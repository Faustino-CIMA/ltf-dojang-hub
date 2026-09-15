from __future__ import annotations

from django.db import transaction
from django.utils import timezone

from clubs.models import Club

from .codes import (
    ProductCodeError,
    fingerprint_token,
    get_or_create_install,
    parse_and_verify,
    parse_datetime_utc,
)
from .models import ClubModuleAssignment, InstallEntitlement, ProductCodeRedemption
from .registry import catalog, get_spec


def install_id_str() -> str:
    return str(get_or_create_install().install_id)


def _is_expired(expires_at) -> bool:
    return bool(expires_at and expires_at <= timezone.now())


def entitled_module_ids() -> set[str]:
    now = timezone.now()
    ids: set[str] = set()
    for row in InstallEntitlement.objects.filter(active=True):
        if row.expires_at and row.expires_at <= now:
            continue
        ids.add(row.module_id)
    return ids


def is_install_entitled(module_id: str) -> bool:
    return module_id in entitled_module_ids()


def is_club_assigned(module_id: str, club_id: int | None) -> bool:
    if club_id is None:
        return False
    if not is_install_entitled(module_id):
        return False
    return ClubModuleAssignment.objects.filter(
        club_id=club_id, module_id=module_id, enabled=True
    ).exists()


def club_ids_for_user(user) -> list[int]:
    if not user or not getattr(user, "is_authenticated", False):
        return []
    if getattr(user, "is_superuser", False) or getattr(user, "role", "") == "ltf_admin":
        return list(Club.objects.order_by("name").values_list("id", flat=True))
    if getattr(user, "role", "") in ("club_admin", "coach"):
        return list(user.clubs_administered.order_by("name").values_list("id", flat=True))
    member = getattr(user, "member_profile", None)
    if member is not None and getattr(member, "club_id", None):
        return [member.club_id]
    return []


def assigned_module_ids_for_club(club_id: int) -> list[str]:
    entitled = entitled_module_ids()
    if not entitled:
        return []
    rows = ClubModuleAssignment.objects.filter(
        club_id=club_id, enabled=True, module_id__in=entitled
    ).values_list("module_id", flat=True)
    return sorted(rows)


def status_for_user(user) -> dict:
    entitled = sorted(entitled_module_ids())
    entitled_set = set(entitled)
    club_ids = club_ids_for_user(user)
    clubs = []
    if club_ids:
        assignments = ClubModuleAssignment.objects.filter(
            club_id__in=club_ids, enabled=True, module_id__in=entitled_set
        )
        by_club: dict[int, list[str]] = {cid: [] for cid in club_ids}
        for row in assignments:
            by_club.setdefault(row.club_id, []).append(row.module_id)
        names = dict(Club.objects.filter(id__in=club_ids).values_list("id", "name"))
        for cid in club_ids:
            clubs.append(
                {
                    "id": cid,
                    "name": names.get(cid, ""),
                    "modules": sorted(by_club.get(cid, [])),
                }
            )
    modules = []
    entitlements = {row.module_id: row for row in InstallEntitlement.objects.filter(active=True)}
    for spec in catalog():
        row = entitlements.get(spec["id"])
        expires_at = row.expires_at if row else None
        is_entitled = spec["id"] in entitled_set
        if row and _is_expired(expires_at):
            state = "expired"
        elif is_entitled:
            state = "active"
        else:
            state = "not_entitled"
        modules.append(
            {
                **spec,
                "entitled": is_entitled,
                "expires_at": expires_at.isoformat() if expires_at else None,
                "status": state,
            }
        )
    return {
        "entitled": entitled,
        "modules": modules,
        "clubs": clubs,
    }


@transaction.atomic
def redeem_product_code(token: str, *, user=None) -> ProductCodeRedemption:
    payload = parse_and_verify(token)
    token_fp = fingerprint_token(token)
    if ProductCodeRedemption.objects.filter(fingerprint=token_fp).exists():
        raise ProductCodeError("replay", "This product code was already entered.")
    jti = str(payload.get("jti") or "")
    if not jti:
        raise ProductCodeError("malformed", "Product code is not valid.")
    if ProductCodeRedemption.objects.filter(jti=jti).exists():
        raise ProductCodeError("replay", "This product code was already entered.")

    current_install = install_id_str()
    payload_install = str(payload.get("install_id") or "")
    if payload_install != current_install:
        raise ProductCodeError(
            "wrong_install",
            "This product code is bound to a different install.",
        )

    expires_at = parse_datetime_utc(payload.get("exp"))
    if _is_expired(expires_at):
        raise ProductCodeError("expired", "This product code has expired.")

    issued_at = parse_datetime_utc(payload.get("iat"))
    modules = list(payload.get("modules") or [])
    caps = payload.get("caps") if isinstance(payload.get("caps"), dict) else {}

    redemption = ProductCodeRedemption.objects.create(
        jti=jti,
        fingerprint=token_fp,
        modules=modules,
        caps=caps,
        payload={k: v for k, v in payload.items()},
        issued_at=issued_at,
        expires_at=expires_at,
        status=ProductCodeRedemption.Status.ACTIVE,
        redeemed_by=user if getattr(user, "is_authenticated", False) else None,
    )

    # Additive: a new code grants its modules. It does not turn off modules
    # already entitled by an earlier code.
    for module_id in modules:
        InstallEntitlement.objects.update_or_create(
            module_id=module_id,
            defaults={
                "source": redemption,
                "active": True,
                "expires_at": expires_at,
                "caps": caps,
            },
        )
    return redemption


def set_club_assignment(*, club: Club, module_id: str, enabled: bool, user=None) -> ClubModuleAssignment:
    spec = get_spec(module_id)
    if spec is None:
        raise ProductCodeError("unknown_module", "Unknown module id.")
    if spec.scope != "club":
        raise ProductCodeError("not_per_club", "This module is not assigned per club.")
    if enabled and not is_install_entitled(module_id):
        raise ProductCodeError(
            "not_entitled",
            "This install is not entitled for that module.",
        )
    assignment, _created = ClubModuleAssignment.objects.update_or_create(
        club=club,
        module_id=module_id,
        defaults={
            "enabled": enabled,
            "assigned_by": user if getattr(user, "is_authenticated", False) else None,
        },
    )
    return assignment
