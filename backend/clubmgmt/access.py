from django.utils import timezone

from modules.entitlements import is_club_assigned, is_install_entitled
from modules.permissions import IsClubModuleAssigned
from modules.registry import CLUB_MANAGEMENT_MODULE_ID, COMPETITION_MODULE_ID

from .models import Committee, CommitteeMandate


def club_mgmt_entitled() -> bool:
    return is_install_entitled(CLUB_MANAGEMENT_MODULE_ID)


def club_mgmt_assigned(club_id: int | None) -> bool:
    return is_club_assigned(CLUB_MANAGEMENT_MODULE_ID, club_id)


def _request_club_id(request) -> int | None:
    raw = request.query_params.get("club") or request.data.get("club") or request.data.get("club_id")
    if raw in (None, ""):
        return None
    try:
        return int(raw)
    except (TypeError, ValueError):
        return None


class CompetitionModulePermission(IsClubModuleAssigned):
    """Competition assignment when the request names a club.

    Detail routes identify a team or a member instead of a club. Those views
    still reject the caller through measurement_club_ids().
    """

    def has_permission(self, request, view) -> bool:
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if not getattr(view, "module_id", None):
            view.module_id = COMPETITION_MODULE_ID
        if _request_club_id(request) is None:
            return True
        return super().has_permission(request, view)


def is_ltf_manager(user) -> bool:
    if user and user.is_authenticated and (user.is_superuser or user.role == "ltf_admin"):
        return True
    from accounts.desks import current_desk

    return current_desk() == "ltf_admin"


def is_club_admin_of(user, club_id: int | None) -> bool:
    if not user or not user.is_authenticated or club_id is None:
        return False
    if user.role != "club_admin":
        return False
    from accounts.desks import current_active_club

    active = current_active_club()
    if active is not None and int(club_id) != int(active):
        return False
    return user.clubs_administered.filter(id=club_id).exists()


def can_manage_club_records(user, club_id: int | None) -> bool:
    if not club_mgmt_entitled():
        return False
    if is_ltf_manager(user):
        return True
    return club_mgmt_assigned(club_id) and is_club_admin_of(user, club_id)


def current_bank_access_mandate(user, club_id: int | None):
    if not is_club_admin_of(user, club_id):
        return None
    member = getattr(user, "member_profile", None)
    if member is None or club_id is None or member.club_id != club_id:
        return None
    today = timezone.localdate()
    return (
        CommitteeMandate.objects.filter(
            member=member,
            role__in=CommitteeMandate.UNIQUE_CURRENT_ROLES,
            committee__scope=Committee.Scope.CLUB,
            committee__club_id=club_id,
        )
        .filter(CommitteeMandate.active_q(today))
        .first()
    )


def can_record_club_payments(user, club_id: int | None) -> bool:
    if not club_mgmt_entitled() or not club_mgmt_assigned(club_id):
        return False
    if getattr(user, "role", None) in {"ltf_admin", "ltf_finance"}:
        return False
    return current_bank_access_mandate(user, club_id) is not None


def can_view_club_books(user, club_id: int | None) -> bool:
    if not club_mgmt_entitled() or not club_mgmt_assigned(club_id):
        return False
    return is_club_admin_of(user, club_id)


def can_mutate_club_books(user, club_id: int | None) -> bool:
    return can_record_club_payments(user, club_id)


def can_edit_committee(user, committee) -> bool:
    """Club admins edit their own club committee. LTF admins edit every committee."""
    if is_ltf_manager(user):
        return True
    if getattr(committee, "scope", None) != Committee.Scope.CLUB:
        return False
    return can_manage_club_records(user, getattr(committee, "club_id", None))
