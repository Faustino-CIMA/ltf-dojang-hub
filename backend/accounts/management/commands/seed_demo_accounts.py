import os
import secrets

from allauth.account.models import EmailAddress
from django.core.management.base import BaseCommand, CommandError
from django.db.models import Count

from accounts.models import User
from clubs.models import Club
from members.models import Member

DEMO_EMAIL_DOMAIN = "ltf-demo.example"


class Command(BaseCommand):
    help = (
        "Create or update demo logins for a member, a club finance user, and a "
        "verified coach. Reuses an existing club admin and LTF admin when one "
        "is already on the demo club. Safe to run more than once. Passwords "
        "come from environment variables when set; otherwise a new account, or "
        "an account that cannot log in yet, gets a random password printed once."
    )

    def handle(self, *args, **options):
        club = _demo_club()
        self.stdout.write(f"Demo club: {club.name} (id {club.id})")
        self.stdout.write(
            "Club finance uses the club admin role. There is no separate club-finance role."
        )

        _ensure_account(
            self,
            username=_existing_username(
                User.objects.filter(role=User.Roles.LTF_ADMIN).order_by("id"),
                "demo_ltf_admin",
            ),
            fallback_username="demo_ltf_admin",
            role=User.Roles.LTF_ADMIN,
            first_name="Demo",
            last_name="Federation",
            env_name="DEMO_LTF_ADMIN_PASSWORD",
            label="LTF admin",
        )
        club_admin = _ensure_account(
            self,
            username=_existing_username(
                club.admins.filter(role=User.Roles.CLUB_ADMIN).exclude(username="demo_club_finance").order_by("id"),
                "demo_club_admin",
            ),
            fallback_username="demo_club_admin",
            role=User.Roles.CLUB_ADMIN,
            first_name="Demo",
            last_name="Club",
            env_name="DEMO_CLUB_ADMIN_PASSWORD",
            label="Club admin",
            club=club,
            club_relation="admins",
        )
        _ensure_account(
            self,
            username="demo_club_finance",
            fallback_username="demo_club_finance",
            role=User.Roles.CLUB_ADMIN,
            first_name="Demo",
            last_name="Finance",
            env_name="DEMO_CLUB_FINANCE_PASSWORD",
            label="Club finance",
            club=club,
            club_relation="admins",
            member=True,
        )
        _ensure_account(
            self,
            username=_existing_username(
                club.trainers.filter(role=User.Roles.COACH).order_by("id"),
                "demo_coach",
            ),
            fallback_username="demo_coach",
            role=User.Roles.COACH,
            first_name="Demo",
            last_name="Coach",
            env_name="DEMO_COACH_PASSWORD",
            label="Coach",
            club=club,
            club_relation="trainers",
            member=True,
            license_role=Member.LicenseRole.COACH,
        )
        _ensure_account(
            self,
            username=_existing_username(
                User.objects.filter(role=User.Roles.MEMBER, member_profile__club=club)
                .exclude(pk=club_admin.pk)
                .order_by("id"),
                "demo_member",
            ),
            fallback_username="demo_member",
            role=User.Roles.MEMBER,
            first_name="Demo",
            last_name="Member",
            env_name="DEMO_MEMBER_PASSWORD",
            label="Member",
            club=club,
            member=True,
            license_role=Member.LicenseRole.ATHLETE,
        )
        self.stdout.write(self.style.SUCCESS("Demo accounts are ready."))


def _demo_club() -> Club:
    administered = Club.objects.filter(admins__role=User.Roles.CLUB_ADMIN).distinct()
    club = (
        administered.annotate(member_count=Count("members")).order_by("-member_count", "id").first()
        if administered.exists()
        else Club.objects.order_by("id").first()
    )
    if club is None:
        raise CommandError("No club exists. Create a club before seeding demo accounts.")
    return club


def _existing_username(queryset, fallback: str) -> str:
    found = queryset.values_list("username", flat=True).first()
    return found or fallback


def _ensure_account(
    command: Command,
    *,
    username: str,
    fallback_username: str,
    role: str,
    first_name: str,
    last_name: str,
    env_name: str,
    label: str,
    club: Club | None = None,
    club_relation: str | None = None,
    member: bool = False,
    license_role: str = "",
) -> User:
    user = User.objects.filter(username=username).first()
    created = user is None
    if user is None:
        user = User(username=fallback_username, email=f"{fallback_username}@{DEMO_EMAIL_DOMAIN}")
    was_unverified = not user.is_email_verified
    if not user.email:
        user.email = f"{user.username}@{DEMO_EMAIL_DOMAIN}"
    user.role = role
    user.is_active = True
    user.is_email_verified = True
    if created and not user.first_name:
        user.first_name = first_name
    password, source = _password(env_name, created=created, was_unverified=was_unverified)
    if password is not None:
        user.set_password(password)
    user.save()
    _verify_email(user)
    if club is not None and club_relation:
        getattr(club, club_relation).add(user)
    if member and club is not None:
        _ensure_member(user, club, first_name, last_name, license_role)
    state = "created" if created else "updated"
    command.stdout.write(f"{label}: {user.username} ({state}, role {user.role})")
    if source == "generated" and password is not None:
        command.stdout.write(f"  password: {password}")
    elif source == "env":
        command.stdout.write(f"  password: set from {env_name}")
    else:
        command.stdout.write("  password: unchanged")
    return user


def _password(env_name: str, *, created: bool, was_unverified: bool) -> tuple[str | None, str]:
    configured = os.environ.get(env_name, "").strip()
    if configured:
        return configured, "env"
    if created or was_unverified:
        return secrets.token_urlsafe(18), "generated"
    return None, "unchanged"


def _verify_email(user: User) -> None:
    address, _created = EmailAddress.objects.get_or_create(
        user=user,
        email=user.email,
        defaults={"verified": True, "primary": True},
    )
    if not address.verified or not address.primary:
        address.verified = True
        address.primary = True
        address.save(update_fields=["verified", "primary"])


def _ensure_member(user: User, club: Club, first_name: str, last_name: str, license_role: str) -> None:
    profile = Member.objects.filter(user=user).first()
    if profile is None:
        Member.objects.create(
            user=user,
            club=club,
            first_name=first_name,
            last_name=last_name,
            email=user.email,
            date_of_birth="1992-04-12",
            primary_license_role=license_role,
            is_active=True,
        )
        return
    profile.club = club
    profile.is_active = True
    if license_role and not profile.primary_license_role:
        profile.primary_license_role = license_role
    if not profile.email:
        profile.email = user.email
    profile.save()
