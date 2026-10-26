"""LTF staff functions and federation-issued licences.

A staff function is not exclusive with club membership. Someone with no club
can hold a licence that the LTF issues directly, with no club order or invoice.
Someone who also belongs to a club keeps the normal club licence.
"""

from __future__ import annotations

from datetime import date

from django.db.models import Q
from django.utils import timezone
from django.utils.crypto import get_random_string

from accounts.models import User
from licenses.history import log_license_created, log_license_status_change
from licenses.models import License, LicenseType

from .models import LtfStaffFunction, Member
from .services import generate_next_ltf_license_id

STAFF_LICENSE_ROLES = {
    LtfStaffFunction.Function.SECRETARY: Member.LicenseRole.STAFF,
    LtfStaffFunction.Function.COACH: Member.LicenseRole.STAFF,
    LtfStaffFunction.Function.MEDIC: Member.LicenseRole.STAFF,
    LtfStaffFunction.Function.MEDIA: Member.LicenseRole.MEDIA,
    LtfStaffFunction.Function.OTHER: Member.LicenseRole.STAFF,
}


def canonical_staff_function(value: str) -> str:
    """Keep people who were stored as photographer on the LTF Media role."""
    if value == "photographer":
        return LtfStaffFunction.Function.MEDIA
    return value
LOGIN_ROLES = {User.Roles.LTF_ADMIN, User.Roles.LTF_FINANCE}


class LtfStaffError(Exception):
    def __init__(self, detail: str, status_code: int = 400):
        super().__init__(detail)
        self.detail = detail
        self.status_code = status_code


def current_staff_q(day: date | None = None) -> Q:
    day = day or timezone.localdate()
    return (Q(started_on__isnull=True) | Q(started_on__lte=day)) & (
        Q(ended_on__isnull=True) | Q(ended_on__gt=day)
    )


def current_staff_function(member: Member, day: date | None = None) -> LtfStaffFunction | None:
    return (
        member.ltf_staff_functions.filter(current_staff_q(day))
        .order_by("-started_on", "-id")
        .first()
    )


def _parse_date(value, field: str) -> date | None:
    if value in (None, ""):
        return None
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(str(value))
    except ValueError as exc:
        raise LtfStaffError(f"invalid_{field}") from exc


def _check_dates(started_on: date | None, ended_on: date | None) -> None:
    if started_on and ended_on and ended_on < started_on:
        raise LtfStaffError("end_before_start")


def _apply_function(
    member: Member,
    *,
    function: str,
    started_on: date | None,
    ended_on: date | None,
    actor,
) -> LtfStaffFunction:
    function = canonical_staff_function(function)
    if function not in LtfStaffFunction.Function.values:
        raise LtfStaffError("invalid_function")
    _check_dates(started_on, ended_on)
    current = current_staff_function(member)
    if current and current.function != function and (ended_on is None or ended_on > timezone.localdate()):
        current.ended_on = started_on or timezone.localdate()
        if current.started_on and current.ended_on < current.started_on:
            current.ended_on = current.started_on
        current.save(update_fields=["ended_on", "updated_at"])
        current = None
    if current is None:
        current = LtfStaffFunction(
            member=member,
            function=function,
            recorded_by=actor if actor and getattr(actor, "is_authenticated", False) else None,
        )
    current.function = function
    current.started_on = started_on
    current.ended_on = ended_on
    current.save()
    if member.club_id is None and current_staff_function(member) is None:
        raise LtfStaffError("staff_required_without_club")
    if not member.primary_license_role:
        member.primary_license_role = STAFF_LICENSE_ROLES[function]
        member.save(update_fields=["primary_license_role", "updated_at"])
    return current


def _link_login(member: Member, payload: dict) -> dict:
    user_id = payload.get("user_id")
    username = str(payload.get("username") or "").strip()
    create_role = str(payload.get("create_login_role") or "").strip()
    if not user_id and not username and not create_role:
        return {"linked": False, "created_user": False}

    if member.user_id and (create_role or (user_id and int(user_id) != member.user_id)):
        raise LtfStaffError("already_has_login")

    if create_role:
        if create_role not in LOGIN_ROLES:
            raise LtfStaffError("invalid_login_role")
        email = str(payload.get("email") or member.email or "").strip()
        if not email:
            raise LtfStaffError("email_required")
        if User.objects.filter(email__iexact=email).exclude(email="").exists():
            raise LtfStaffError("email_in_use")
        from clubs.admin_assignment import build_username

        user = User.objects.create_user(
            username=build_username(member.first_name, member.last_name),
            email=email,
            password=get_random_string(20),
            role=create_role,
            first_name=member.first_name,
            last_name=member.last_name,
        )
        if not member.email:
            member.email = email
        member.user = user
        member.save(update_fields=["user", "email", "updated_at"])
        return {"linked": True, "created_user": True, "user": user}

    if user_id:
        user = User.objects.filter(id=user_id).first()
    else:
        user = User.objects.filter(username__iexact=username).first()
        if user is None and "@" in username:
            user = User.objects.filter(email__iexact=username).first()
    if user is None:
        raise LtfStaffError("user_not_found")
    if user.role not in LOGIN_ROLES:
        raise LtfStaffError("user_role_not_ltf")
    if Member.all_objects.filter(user=user).exclude(pk=member.pk).exists():
        raise LtfStaffError("user_already_linked")
    member.user = user
    member.save(update_fields=["user", "updated_at"])
    return {"linked": True, "created_user": False, "user": user}


def _maybe_send_reset(user, locale: str | None) -> None:
    if not user or not user.email:
        return
    from accounts.email_utils import build_password_reset_url, send_password_reset_email

    try:
        send_password_reset_email(user, build_password_reset_url(user, locale or "en"))
    except Exception:
        return


def create_staff_member(payload: dict, *, actor, locale: str | None = None) -> tuple[Member, dict]:
    member_id = payload.get("member_id")
    if member_id:
        member = Member.objects.filter(id=member_id).first()
        if member is None:
            raise LtfStaffError("member_not_found", 404)
    else:
        first_name = str(payload.get("first_name") or "").strip()
        last_name = str(payload.get("last_name") or "").strip()
        if not first_name or not last_name:
            raise LtfStaffError("name_required")
        club = payload.get("club")
        member = Member(
            club=club,
            first_name=first_name,
            last_name=last_name,
            sex=payload.get("sex") or Member.Sex.MALE,
            email=str(payload.get("email") or "").strip(),
            date_of_birth=_parse_date(payload.get("date_of_birth"), "date_of_birth"),
            is_active=True,
        )
        if not member.ltf_licenseid:
            member.ltf_licenseid = generate_next_ltf_license_id(prefix="LTF")
        member.save()

    if "club" in payload and member_id:
        club = payload.get("club")
        if club is None and member.club_id is not None:
            raise LtfStaffError("use_transfer_to_leave_club")
        if club is not None:
            member.club = club
            member.save(update_fields=["club", "updated_at"])

    function = _apply_function(
        member,
        function=str(payload.get("function") or ""),
        started_on=_parse_date(payload.get("started_on"), "started_on"),
        ended_on=_parse_date(payload.get("ended_on"), "ended_on"),
        actor=actor,
    )
    login = _link_login(member, payload)
    if login.get("created_user"):
        _maybe_send_reset(login.get("user"), locale)

    license_record = None
    if payload.get("license_type"):
        license_record = issue_staff_license(
            member,
            license_type=payload["license_type"],
            year=payload.get("license_year"),
            actor=actor,
        )
    member.refresh_from_db()
    return member, {"function_id": function.id, "license_id": license_record.id if license_record else None, **{k: v for k, v in login.items() if k != "user"}}


def update_staff_member(member: Member, payload: dict, *, actor, locale: str | None = None) -> Member:
    if "club" in payload:
        club = payload.get("club")
        if club is None and member.club_id is not None:
            raise LtfStaffError("use_transfer_to_leave_club")
        if club is not None and club.id != member.club_id:
            member.club = club
            member.save(update_fields=["club", "updated_at"])
    for field in ("first_name", "last_name", "email", "sex"):
        if payload.get(field):
            setattr(member, field, str(payload[field]).strip())
    if "date_of_birth" in payload:
        member.date_of_birth = _parse_date(payload.get("date_of_birth"), "date_of_birth")
    member.save()
    if payload.get("function"):
        _apply_function(
            member,
            function=str(payload.get("function")),
            started_on=_parse_date(payload.get("started_on"), "started_on"),
            ended_on=_parse_date(payload.get("ended_on"), "ended_on"),
            actor=actor,
        )
    elif member.club_id is None and current_staff_function(member) is None:
        raise LtfStaffError("staff_required_without_club")
    login = _link_login(member, payload)
    if login.get("created_user"):
        _maybe_send_reset(login.get("user"), locale)
    member.refresh_from_db()
    return member


def delete_staff(member: Member) -> dict:
    if member.club_id:
        member.ltf_staff_functions.all().delete()
        return {"deleted_member": False}
    if member.licenses.filter(
        status__in=[License.Status.ACTIVE, License.Status.PENDING]
    ).exists():
        raise LtfStaffError("revoke_licence_before_delete", 409)
    member.delete()
    return {"deleted_member": True}


def issue_staff_license(member: Member, *, license_type: LicenseType, year, actor) -> License:
    if member.club_id is not None:
        raise LtfStaffError("club_member_uses_club_licence")
    if current_staff_function(member) is None:
        raise LtfStaffError("staff_required")
    try:
        year_value = int(year or timezone.localdate().year)
    except (TypeError, ValueError) as exc:
        raise LtfStaffError("invalid_year") from exc
    today = timezone.localdate()
    # Same years a club can order: this year, or next year. A past year is
    # refused. Club payment leaves a past-year licence unactivated, and an
    # LTF admin must not create a backdated active licence.
    if year_value < today.year:
        raise LtfStaffError("past_year")
    if year_value > today.year + 1:
        raise LtfStaffError("year_not_allowed")
    if member.licenses.filter(
        year=year_value,
        status__in=[License.Status.ACTIVE, License.Status.PENDING],
    ).exists():
        raise LtfStaffError("licence_exists_for_year")
    # This year is inside its start/end dates, so it is active at once, the
    # same as a paid club licence. Next year starts in the future, so it stays
    # pending until the activation task reaches 1 January.
    status_value = (
        License.Status.ACTIVE if year_value == today.year else License.Status.PENDING
    )
    if status_value == License.Status.ACTIVE and member.licenses.filter(
        status=License.Status.ACTIVE
    ).exists():
        raise LtfStaffError("active_licence_exists")
    license_record = License.objects.create(
        member=member,
        club=None,
        license_type=license_type,
        year=year_value,
        status=status_value,
    )
    log_license_created(
        license_record,
        actor=actor,
        reason="LTF staff licence issued without an invoice.",
        metadata={"source": "ltf_staff.issue", "priced": False},
    )
    return license_record


def revoke_staff_license(member: Member, *, actor, reason: str = "") -> License:
    if member.club_id is not None:
        raise LtfStaffError("club_member_uses_club_licence")
    license_record = (
        member.licenses.filter(status__in=[License.Status.ACTIVE, License.Status.PENDING], club__isnull=True)
        .order_by("-year", "-id")
        .first()
    )
    if license_record is None:
        raise LtfStaffError("no_staff_licence", 404)
    previous = license_record.status
    license_record.status = License.Status.REVOKED
    license_record.save(update_fields=["status", "updated_at"])
    log_license_status_change(
        license_record,
        status_before=previous,
        actor=actor,
        reason=reason or "LTF staff licence revoked.",
        metadata={"source": "ltf_staff.revoke"},
    )
    return license_record
