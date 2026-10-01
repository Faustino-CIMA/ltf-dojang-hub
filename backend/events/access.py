from modules.entitlements import is_club_assigned, is_install_entitled
from modules.registry import EVENT_CALENDAR_MODULE_ID

from .models import Event


def calendar_entitled() -> bool:
    return is_install_entitled(EVENT_CALENDAR_MODULE_ID)


def club_calendar_assigned(club_id: int | None) -> bool:
    return is_club_assigned(EVENT_CALENDAR_MODULE_ID, club_id)


def is_ltf_manager(user) -> bool:
    if not user or not getattr(user, "is_authenticated", False):
        return False
    return bool(getattr(user, "is_superuser", False) or getattr(user, "role", "") == "ltf_admin")


def is_club_manager(user, club_id: int | None) -> bool:
    if not user or not getattr(user, "is_authenticated", False) or club_id is None:
        return False
    if getattr(user, "role", "") != "club_admin":
        return False
    return user.clubs_administered.filter(id=club_id).exists()


def is_club_coach(user, club_id: int | None) -> bool:
    if not user or not getattr(user, "is_authenticated", False) or club_id is None:
        return False
    if getattr(user, "role", "") != "coach":
        return False
    return user.clubs_trained.filter(id=club_id).exists() or user.clubs_administered.filter(id=club_id).exists()


def member_home_club_id(user) -> int | None:
    member = getattr(user, "member_profile", None)
    if member is None:
        return None
    return getattr(member, "club_id", None)


def can_manage_event(user, event: Event) -> bool:
    if event.owner_scope == Event.OwnerScope.FEDERATION:
        return calendar_entitled() and is_ltf_manager(user)
    return club_calendar_assigned(event.club_id) and is_club_manager(user, event.club_id)


def can_view_event(user, event: Event) -> bool:
    if not calendar_entitled():
        return False
    if event.owner_scope == Event.OwnerScope.FEDERATION:
        if is_ltf_manager(user):
            return True
        if event.visibility == Event.Visibility.PRIVATE:
            return False
        if event.visibility == Event.Visibility.INTERNAL:
            return getattr(user, "role", "") in ("club_admin", "coach", "ltf_finance")
        return True
    if not club_calendar_assigned(event.club_id):
        return False
    if is_ltf_manager(user) or is_club_manager(user, event.club_id):
        return True
    if is_club_coach(user, event.club_id):
        return event.visibility != Event.Visibility.PRIVATE
    if member_home_club_id(user) == event.club_id:
        return event.visibility == Event.Visibility.PUBLIC
    return False
