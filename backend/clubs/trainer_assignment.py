from __future__ import annotations

from datetime import date

from django.conf import settings
from django.utils.crypto import get_random_string

from accounts.email_utils import build_password_reset_url, send_club_admin_welcome_email
from accounts.models import User
from members.models import Member

from .admin_assignment import AdminAssignmentError, build_username
from .models import Club

PROTECTED_ROLES = {User.Roles.LTF_ADMIN, User.Roles.LTF_FINANCE}


def _is_adult(born: date | None, on: date | None = None) -> bool:
    if born is None:
        return False
    today = on or date.today()
    age = today.year - born.year - ((today.month, today.day) < (born.month, born.day))
    return age >= 18


def list_trainers(club: Club) -> list[dict]:
    from clubmgmt.models import CoachQualification

    included = {
        row.user_id: row.include_in_qualite
        for row in CoachQualification.objects.filter(club=club)
    }
    rows = []
    users = club.trainers.select_related("member_profile").order_by("last_name", "first_name", "username")
    for user in users:
        member = getattr(user, "member_profile", None)
        rows.append(
            {
                "user_id": user.id,
                "member_id": member.id if member else None,
                "first_name": (member.first_name if member else user.first_name) or "",
                "last_name": (member.last_name if member else user.last_name) or "",
                "email": (member.email if member and member.email else user.email) or "",
                "username": user.username,
                "include_in_qualite": included.get(user.id, True),
            }
        )
    return rows


def set_trainer_qualite(club: Club, user_id, include: bool) -> dict:
    from clubmgmt.models import CoachQualification

    if not club.trainers.filter(id=user_id).exists():
        raise AdminAssignmentError({"detail": "Coach not found on this club."}, 400)
    CoachQualification.objects.update_or_create(
        club=club,
        user_id=user_id,
        defaults={"include_in_qualite": include},
    )
    return {"trainers": list_trainers(club)}


def add_trainer(club: Club, *, member_id, email: str | None = None, locale: str | None = None) -> dict:
    member = Member.objects.select_related("user", "club").filter(id=member_id, is_active=True).first()
    if member is None:
        raise AdminAssignmentError({"detail": "Member not found."}, 400)
    if member.club_id != club.id:
        raise AdminAssignmentError({"detail": "home_club_only"}, 400)
    if not _is_adult(member.date_of_birth):
        raise AdminAssignmentError({"detail": "This person cannot be a coach."}, 400)

    created_user = False
    if member.user_id:
        user = member.user
    else:
        resolved_email = str(email or member.email or "").strip()
        if not resolved_email:
            raise AdminAssignmentError({"detail": "email_required", "member_id": member.id}, 400)
        taken = User.objects.filter(email__iexact=resolved_email).exclude(email="").exists()
        if taken:
            raise AdminAssignmentError({"detail": "email_in_use"}, 400)
        if not member.email:
            member.email = resolved_email
            member.save(update_fields=["email"])
        user = User.objects.create_user(
            username=build_username(member.first_name, member.last_name),
            email=resolved_email,
            password=get_random_string(20),
            role=User.Roles.COACH,
            first_name=member.first_name,
            last_name=member.last_name,
        )
        member.user = user
        member.save(update_fields=["user"])
        created_user = True

    if user.role in PROTECTED_ROLES:
        raise AdminAssignmentError({"detail": "This person cannot be a coach."}, 400)
    if club.trainers.filter(id=user.id).exists():
        raise AdminAssignmentError({"detail": "already_trainer"}, 400)

    club.trainers.add(user)
    if user.role == User.Roles.MEMBER:
        user.role = User.Roles.COACH
        user.save(update_fields=["role"])

    email_sent = False
    email_error = None
    if created_user and user.email:
        reset_url = build_password_reset_url(user, locale or settings.FRONTEND_DEFAULT_LOCALE)
        email_sent, email_error = send_club_admin_welcome_email(user, club, reset_url)

    return {
        "detail": "Coach added.",
        "user_id": user.id,
        "member_id": member.id,
        "created_user": created_user,
        "email_sent": email_sent,
        "email_error": email_error or None,
        "trainers": list_trainers(club),
    }


def remove_trainer(club: Club, user_id) -> dict:
    user = User.objects.filter(id=user_id).first()
    if user is None or not club.trainers.filter(id=user.id).exists():
        raise AdminAssignmentError({"detail": "Coach not found on this club."}, 400)
    club.trainers.remove(user)
    still_trains = Club.objects.filter(trainers=user).exists()
    still_admins = Club.objects.filter(admins=user).exists()
    if user.role == User.Roles.COACH and not still_trains and not still_admins:
        user.role = User.Roles.MEMBER
        user.save(update_fields=["role"])
    return {"detail": "Coach removed.", "trainers": list_trainers(club)}
