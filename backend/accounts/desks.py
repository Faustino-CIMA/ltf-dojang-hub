"""Desk grants. One query per request, cached on that request.

A missing desk header keeps today's access: the person's current role, at full,
unless the only open grant for that role is read-only. A header is allowed only
when a grant for that desk is still valid. User.role is never rewritten here.
"""

from __future__ import annotations

from django.db.models import Q
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied

from .models import DeskGrant, DeskPreference, User

HEADER = "HTTP_X_DESK"
SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})
CLUB_DESKS = frozenset({DeskGrant.Desk.CLUB_ADMIN, DeskGrant.Desk.COACH})
NAMED_DESKS = frozenset(
    {
        DeskGrant.Desk.LTF_FINANCE,
        DeskGrant.Desk.LTF_ADMIN,
        DeskGrant.Desk.MEMBER,
        "ops",
    }
)


def _today():
    return timezone.localdate()


def _django_request(request):
    return getattr(request, "_request", request)


def load_grants(request, user):
    cached = getattr(request, "_desk_grants", None)
    if cached is not None:
        return cached
    today = _today()
    rows = list(
        DeskGrant.objects.filter(user_id=user.id, valid_from__lte=today)
        .filter(Q(valid_until__isnull=True) | Q(valid_until__gt=today))
        .only("id", "desk", "level", "club_id", "source", "user_id")
    )
    request._desk_grants = rows
    _django_request(request)._desk_grants = rows
    return rows


def _parse_header(raw: str):
    if raw in NAMED_DESKS:
        return raw, None
    desk, sep, club = raw.partition(":")
    if sep and desk in CLUB_DESKS and club.isdigit() and int(club) > 0:
        return desk, int(club)
    raise PermissionDenied(detail="desk_not_granted")


def _best(grants, desk: str, club_id: int | None):
    matches = []
    for grant in grants:
        if grant.desk != desk:
            continue
        if desk in CLUB_DESKS and grant.club_id != club_id:
            continue
        matches.append(grant)
    full = [grant for grant in matches if grant.level == DeskGrant.Level.FULL]
    if full:
        return full[0]
    return matches[0] if matches else None


def _implicit_read_only(user, grants) -> bool:
    role_grants = [grant for grant in grants if grant.desk == user.role]
    if not role_grants:
        return False
    if any(grant.level == DeskGrant.Level.FULL for grant in role_grants):
        return False
    return True


def _audit(action: str, user, message: str, metadata: dict, target_id: str = ""):
    from ops.models import OpsAuditLog

    OpsAuditLog.objects.create(
        actor=user if getattr(user, "is_authenticated", False) else None,
        action=action,
        target_type="desk_grant",
        target_id=target_id,
        message=message,
        metadata=metadata,
    )


def _refuse(request, user, code: str, metadata: dict):
    action = "desk.read_only_refused" if code == "desk_read_only" else "desk.switch_refused"
    request._desk_error = code
    _django_request(request)._desk_error = code
    _audit(action, user, code, metadata)
    raise PermissionDenied(detail=code)


def bind_request_desk(request, user) -> None:
    """Resolve the desk for this request. Safe to call twice."""
    if getattr(request, "_desk_bound", False):
        if getattr(request, "_desk_error", None):
            raise PermissionDenied(detail=request._desk_error)
        return
    request._desk_bound = True
    _django_request(request)._desk_bound = True
    raw = str(request.META.get(HEADER) or "").strip()
    if not raw:
        read_only = _implicit_read_only(user, load_grants(request, user))
        request.desk_read_only = read_only
        _django_request(request).desk_read_only = read_only
        if read_only and request.method not in SAFE_METHODS:
            _refuse(request, user, "desk_read_only", {"desk": user.role, "header": ""})
        return
    try:
        desk, club_id = _parse_header(raw)
    except PermissionDenied:
        _refuse(request, user, "desk_not_granted", {"header": raw})
        return
    if desk == "ops":
        if not user.is_superuser:
            _refuse(request, user, "desk_not_granted", {"header": raw})
        request.desk_ops = True
        _django_request(request).desk_ops = True
        return
    grant = _best(load_grants(request, user), desk, club_id)
    if grant is None:
        _refuse(request, user, "desk_not_granted", {"header": raw})
        return
    request.desk_grant = grant
    _django_request(request).desk_grant = grant
    if grant.level == DeskGrant.Level.READ_ONLY and request.method not in SAFE_METHODS:
        _refuse(
            request,
            user,
            "desk_read_only",
            {"desk": grant.desk, "club_id": grant.club_id, "header": raw},
        )


def record_desk_switch(user, *, desk: str, club_id: int | None = None) -> DeskPreference:
    """Remember a chosen desk and audit the change. Does not change User.role."""
    grants = list(
        DeskGrant.objects.filter(user_id=user.id, valid_from__lte=_today()).filter(
            Q(valid_until__isnull=True) | Q(valid_until__gt=_today())
        )
    )
    if desk == "ops":
        if not user.is_superuser:
            _audit("desk.switch_refused", user, "desk_not_granted", {"desk": desk})
            raise PermissionDenied(detail="desk_not_granted")
        grant = None
    else:
        grant = _best(grants, desk, club_id)
        if grant is None:
            _audit("desk.switch_refused", user, "desk_not_granted", {"desk": desk, "club_id": club_id})
            raise PermissionDenied(detail="desk_not_granted")
    preference = DeskPreference.objects.filter(user_id=user.id).first()
    previous = None if preference is None else {"desk": preference.desk, "club_id": preference.club_id}
    changed = preference is None or preference.desk != desk or preference.club_id != club_id
    if preference is None:
        preference = DeskPreference.objects.create(user=user, desk=desk, club_id=club_id)
    elif changed:
        preference.desk = desk
        preference.club_id = club_id
        preference.save(update_fields=["desk", "club", "updated_at"])
    if changed:
        _audit(
            "desk.switched",
            user,
            "Desk switched.",
            {
                "from": previous,
                "desk": desk,
                "club_id": club_id,
                "level": None if grant is None else grant.level,
            },
            target_id=str(preference.pk),
        )
    user.refresh_from_db(fields=["role"])
    return preference


def _audit_grant(action: str, grant, message: str):
    _audit(
        action,
        None,
        message,
        {
            "user_id": grant.user_id,
            "desk": grant.desk,
            "level": grant.level,
            "source": grant.source,
            "club_id": grant.club_id,
        },
        target_id=str(grant.pk),
    )


def ensure_legacy_grant(user, desk: str, club_id: int | None, today=None) -> DeskGrant:
    today = today or _today()
    grant = (
        DeskGrant.objects.filter(
            user_id=user.id,
            desk=desk,
            club_id=club_id,
            level=DeskGrant.Level.FULL,
            source=DeskGrant.Source.LEGACY,
        )
        .order_by("id")
        .first()
    )
    if grant is None:
        grant = DeskGrant.objects.create(
            user_id=user.id,
            desk=desk,
            club_id=club_id,
            level=DeskGrant.Level.FULL,
            source=DeskGrant.Source.LEGACY,
            valid_from=today,
            reason="",
        )
        _audit_grant("desk.grant_created", grant, "Legacy desk grant.")
        return grant
    if grant.valid_until is not None:
        grant.valid_until = None
        grant.save(update_fields=["valid_until"])
        _audit_grant("desk.grant_created", grant, "Legacy desk grant reopened.")
    return grant


def _end_grant(grant, today):
    if grant.valid_until is not None and grant.valid_until <= today:
        return
    grant.valid_until = today
    grant.save(update_fields=["valid_until"])
    _audit_grant("desk.grant_ended", grant, "Legacy desk grant ended.")


def desired_legacy_pairs(user) -> list[tuple[str, int | None]]:
    role = user.role
    if role == User.Roles.CLUB_ADMIN:
        club_ids = list(user.clubs_administered.values_list("id", flat=True))
        if club_ids:
            return [(DeskGrant.Desk.CLUB_ADMIN, club_id) for club_id in club_ids]
        return [(DeskGrant.Desk.CLUB_ADMIN, None)]
    if role == User.Roles.COACH:
        club_ids = list(user.clubs_trained.values_list("id", flat=True))
        if not club_ids:
            from members.models import Member

            club_id = Member.objects.filter(user_id=user.id).values_list("club_id", flat=True).first()
            if club_id:
                club_ids = [club_id]
        if club_ids:
            return [(DeskGrant.Desk.COACH, club_id) for club_id in club_ids]
        return [(DeskGrant.Desk.COACH, None)]
    if role in {
        User.Roles.LTF_ADMIN,
        User.Roles.LTF_FINANCE,
        User.Roles.MEMBER,
    }:
        return [(role, None)]
    return []


def sync_legacy_grants(user) -> None:
    """Keep legacy grants aligned with the account role and club lists."""
    if not user.pk:
        return
    today = _today()
    desired = set(desired_legacy_pairs(user))
    existing = list(DeskGrant.objects.filter(user_id=user.id, source=DeskGrant.Source.LEGACY))
    for grant in existing:
        if (grant.desk, grant.club_id) not in desired or grant.level != DeskGrant.Level.FULL:
            _end_grant(grant, today)
    for desk, club_id in desired:
        ensure_legacy_grant(user, desk, club_id, today)


def audit_read_only_export(request) -> None:
    grant = getattr(request, "desk_grant", None)
    if grant is None or grant.level != DeskGrant.Level.READ_ONLY:
        return
    if request.method not in SAFE_METHODS:
        return
    path = request.path or ""
    if "/pdf" not in path and "export" not in path:
        return
    _audit(
        "desk.read_only_export",
        getattr(request, "user", None),
        "Read-only download.",
        {"path": path, "desk": grant.desk, "club_id": grant.club_id},
        target_id=str(grant.pk),
    )
