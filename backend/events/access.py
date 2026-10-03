from django.db.models import Q
from django.utils import timezone

from clubmgmt.models import Committee, CommitteeMandate
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


def _role(user) -> str:
    return getattr(user, "role", "") or ""


def _assigned_staff_club_ids(user) -> set[int]:
    if not user or not getattr(user, "is_authenticated", False):
        return set()
    cached = getattr(user, "_event_staff_club_ids", None)
    if cached is not None:
        return cached
    club_ids = set(user.clubs_administered.values_list("id", flat=True))
    club_ids.update(user.clubs_trained.values_list("id", flat=True))
    assigned = {club_id for club_id in club_ids if club_calendar_assigned(club_id)}
    user._event_staff_club_ids = assigned
    return assigned


def current_president_club_ids(user) -> set[int]:
    if not user or not getattr(user, "is_authenticated", False):
        return set()
    cached = getattr(user, "_event_president_club_ids", None)
    if cached is not None:
        return cached
    member = getattr(user, "member_profile", None)
    if member is None:
        ids: set[int] = set()
    else:
        today = timezone.localdate()
        ids = set(
            CommitteeMandate.objects.filter(
                member=member,
                role=CommitteeMandate.Role.PRESIDENT,
                committee__scope=Committee.Scope.CLUB,
                started_on__lte=today,
            )
            .filter(Q(ended_on__isnull=True) | Q(ended_on__gte=today))
            .values_list("committee__club_id", flat=True)
        )
    user._event_president_club_ids = ids
    return ids


def _sees_shared(user) -> bool:
    if is_ltf_manager(user) or _role(user) == "ltf_finance":
        return True
    return bool(_assigned_staff_club_ids(user))


def _is_invited_president(user, event: Event) -> bool:
    invited = {club.id for club in event.audience_clubs.all()}
    if not invited:
        return False
    return bool(current_president_club_ids(user) & invited)


def can_view_event(user, event: Event) -> bool:
    if not calendar_entitled() or not user or not getattr(user, "is_authenticated", False):
        return False
    if event.visibility == Event.Visibility.PRESIDENTS:
        return is_ltf_manager(user) or _is_invited_president(user, event)
    if event.visibility == Event.Visibility.SHARED:
        if _sees_shared(user):
            return True
        return bool(
            event.club_id
            and member_home_club_id(user) == event.club_id
            and club_calendar_assigned(event.club_id)
        )
    if event.owner_scope == Event.OwnerScope.FEDERATION:
        if is_ltf_manager(user):
            return True
        if event.visibility == Event.Visibility.PRIVATE:
            return False
        if event.visibility == Event.Visibility.INTERNAL:
            return _role(user) in ("club_admin", "coach", "ltf_finance")
        return True
    if event.visibility == Event.Visibility.PRIVATE:
        return club_calendar_assigned(event.club_id) and is_club_manager(user, event.club_id)
    if not club_calendar_assigned(event.club_id):
        return False
    if event.visibility == Event.Visibility.INTERNAL:
        return is_club_manager(user, event.club_id) or is_club_coach(user, event.club_id)
    if is_ltf_manager(user) or is_club_manager(user, event.club_id):
        return True
    if is_club_coach(user, event.club_id):
        return True
    if member_home_club_id(user) == event.club_id:
        return event.visibility == Event.Visibility.PUBLIC
    return False
