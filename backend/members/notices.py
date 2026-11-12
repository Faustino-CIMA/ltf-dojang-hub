"""Who may see or decide an admin notice. One place for photo review."""

from __future__ import annotations

from django.utils import timezone

from accounts.desks import current_active_club, current_desk, holds_desk

from .models import AdminNotice

PICTURE_REVIEW = AdminNotice.Kind.PICTURE_REVIEW


def _request_user(request):
    user = getattr(request, "user", None) if request is not None else None
    if user is None or not getattr(user, "is_authenticated", False):
        return None
    return user


def _read_only(request) -> bool:
    if request is None:
        return False
    if getattr(request, "desk_read_only", False):
        return True
    django_request = getattr(request, "_request", None)
    return bool(django_request is not None and getattr(django_request, "desk_read_only", False))


def _club_ids(request, user) -> set[int]:
    cached = getattr(request, "_review_club_ids", None)
    if cached is not None:
        return cached
    ids = set(user.clubs_administered.values_list("id", flat=True))
    request._review_club_ids = ids
    return ids


def reviewer_mode(request) -> str:
    """hidden, badge, decide_all, or decide_clubs. Cached on the request."""
    if request is None:
        return "hidden"
    cached = getattr(request, "_reviewer_mode", None)
    if cached is not None:
        return cached
    user = _request_user(request)
    if user is None or _read_only(request):
        mode = "hidden"
    else:
        desk = current_desk()
        if desk == "coach" or (desk is None and getattr(user, "role", None) == "coach"):
            mode = "badge"
        elif holds_desk(user, "ltf_admin"):
            mode = "decide_all"
        elif getattr(user, "role", None) == "club_admin" or desk == "club_admin":
            mode = "decide_clubs"
        else:
            mode = "hidden"
    request._reviewer_mode = mode
    return mode


def review_access(request, member) -> str:
    """hidden, badge, or decide for this member."""
    mode = reviewer_mode(request)
    if mode in {"hidden", "badge"}:
        return mode
    if mode == "decide_all":
        return "decide"
    user = _request_user(request)
    club_id = getattr(member, "club_id", None)
    if user is None or not club_id:
        return "hidden"
    if club_id in _club_ids(request, user):
        return "decide"
    if current_desk() == "club_admin" and current_active_club() == club_id:
        return "decide"
    return "hidden"


def can_decide(request, member) -> bool:
    return review_access(request, member) == "decide"


def picture_badge(request, member) -> str:
    if not getattr(member, "profile_picture_pending_processed", None):
        return ""
    if review_access(request, member) in {"badge", "decide"}:
        return "pending"
    return ""


def review_state_for(request, member) -> tuple[str, str]:
    """State and optional rejection reason. Coaches get the badge only."""
    user = _request_user(request)
    owner = bool(user and member.user_id and member.user_id == user.id)
    access = review_access(request, member)
    if access == "hidden" and not owner:
        return "", ""
    if getattr(member, "profile_picture_pending_processed", None):
        if access == "hidden" and not owner:
            return "", ""
        return "pending", ""
    if not owner:
        return ("none", "") if access == "decide" else ("", "")
    latest = (
        AdminNotice.objects.filter(member_id=member.id, kind=PICTURE_REVIEW)
        .order_by("-id")
        .only("decision", "reason", "resolved_at")
        .first()
    )
    if latest is not None and latest.resolved_at and latest.decision == "reject":
        return "rejected", str(latest.reason or "")
    return "none", ""


def open_picture_notice(member) -> AdminNotice:
    """One open photo notice per member. A new upload clears an earlier rejection."""
    existing = AdminNotice.objects.filter(
        member_id=member.id,
        kind=PICTURE_REVIEW,
        resolved_at__isnull=True,
    ).first()
    if existing is not None:
        existing.reason = ""
        existing.decision = ""
        existing.opened_at = timezone.now()
        existing.save(update_fields=["reason", "decision", "opened_at"])
        return existing
    return AdminNotice.objects.create(
        kind=PICTURE_REVIEW,
        club_id=member.club_id,
        member_id=member.id,
    )


def resolve_picture_notice(member, actor, decision: str, reason: str) -> AdminNotice:
    notice = AdminNotice.objects.filter(
        member_id=member.id,
        kind=PICTURE_REVIEW,
        resolved_at__isnull=True,
    ).first()
    if notice is None:
        notice = AdminNotice(
            kind=PICTURE_REVIEW,
            club_id=member.club_id,
            member_id=member.id,
        )
    notice.decision = decision
    notice.reason = reason if decision == "reject" else ""
    notice.resolved_at = timezone.now()
    notice.resolved_by = actor if getattr(actor, "is_authenticated", False) else None
    notice.save()
    return notice


def open_notices_for(request):
    if reviewer_mode(request) == "hidden" or reviewer_mode(request) == "badge":
        return AdminNotice.objects.none()
    rows = AdminNotice.objects.filter(resolved_at__isnull=True).select_related("member")
    if reviewer_mode(request) == "decide_all":
        return rows
    user = _request_user(request)
    if user is None:
        return AdminNotice.objects.none()
    return rows.filter(club_id__in=_club_ids(request, user))
