from django.conf import settings
from django.db.models import Exists, OuterRef
from django.utils import timezone

from clubs.models import Club
from members.ltf_staff import current_staff_q
from members.models import LtfStaffFunction, Member

from .models import SetupState


def app_is_empty() -> bool:
    return not Club.objects.filter(is_demo=False).exists() and not Member.objects.filter(is_demo=False).exists()


def get_state() -> SetupState | None:
    return SetupState.objects.filter(pk=1).first()


def setup_is_completed() -> bool:
    state = get_state()
    return bool(state and state.completed_at)


def setup_available_for(user) -> bool:
    if not user or not getattr(user, "is_authenticated", False) or not user.is_superuser:
        return False
    if getattr(settings, "DEMO_MODE", False):
        return False
    if setup_is_completed():
        return False
    state = get_state()
    if app_is_empty():
        return True
    return bool(state and state.started_at)


def ltf_staff_count() -> int:
    return (
        Member.objects.filter(is_active=True, is_demo=False)
        .filter(Exists(LtfStaffFunction.objects.filter(member_id=OuterRef("pk")).filter(current_staff_q())))
        .count()
    )


def status_payload(user) -> dict:
    state = get_state()
    available = setup_available_for(user)
    results = state.step_results if state else {}
    return {
        "available": available,
        "current_step": state.current_step if state else SetupState.Step.CLUBS,
        "completed": bool(state and state.completed_at),
        "started": bool(state and state.started_at),
        "ltf_prefix_rewrite": bool(state and state.ltf_prefix_rewrite),
        "needs_admin_step": "admins" not in (results or {}),
        "counts": {
            "clubs": Club.objects.filter(is_demo=False).count(),
            "club_members": Member.objects.filter(is_demo=False, club__isnull=False).count(),
            "ltf_staff": ltf_staff_count(),
            "admins": 0,
        },
        "step_results": results or {},
    }


def lock_setup(user) -> SetupState:
    state = SetupState.objects.select_for_update().get(pk=1)
    state.completed_at = timezone.now()
    state.completed_by = user
    state.current_step = SetupState.Step.DONE
    state.save(update_fields=["completed_at", "completed_by", "current_step"])
    return state
