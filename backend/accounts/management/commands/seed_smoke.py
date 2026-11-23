"""Fake club for the Playwright smoke. Not a person's data, and not the demo seed.

The authenticator secret is the same well-known test secret the Django auth
smoke already uses. It only opens this fixture account.
"""

from datetime import date, datetime
from zoneinfo import ZoneInfo

from allauth.account.models import EmailAddress
from allauth.mfa.recovery_codes.internal.auth import RecoveryCodes
from allauth.mfa.totp.internal.auth import TOTP
from django.core.management.base import BaseCommand

from accounts.models import User
from clubmgmt.models import MemberRecord
from clubs.models import Club
from members.models import Member, MemberVerification
from members.ssn_countries import luxembourg_check_digits

SMOKE_USERNAMES = ("smoke-owner", "smoke-club", "smoke-member")
SMOKE_PASSWORD = "pass12345"
SMOKE_TOTP_SECRET = "JBSWY3DPEHPK3PXP"
CLUB_NAME = "Example Club"


def _number(body: str) -> str:
    return body + luxembourg_check_digits(body)


class Command(BaseCommand):
    help = "Create the fake club, club admin, and members used by the Playwright smoke."

    def add_arguments(self, parser):
        parser.add_argument(
            "--env",
            action="store_true",
            help="Print SMOKE_* assignments for the shell.",
        )

    def handle(self, *args, **options):
        clubs = Club.objects.filter(created_by__username__in=SMOKE_USERNAMES)
        Member.objects.filter(club__in=clubs).delete()
        Member.objects.filter(
            ltf_licenseid__in=("LTF-EX-0001", "LTF-EX-0002", "LTF-EX-0003", "LTF-EX-0004")
        ).delete()
        clubs.delete()
        User.objects.filter(username__in=SMOKE_USERNAMES).delete()

        owner = self._user("smoke-owner", User.Roles.LTF_ADMIN)
        admin = self._user("smoke-club", User.Roles.CLUB_ADMIN)
        member_user = self._user("smoke-member", User.Roles.MEMBER)
        club = Club.objects.create(
            name=CLUB_NAME,
            city="Luxembourg",
            address="1 Road",
            created_by=owner,
        )
        club.admins.add(admin)
        self._enable_club_management(club, owner)

        open_member = self._member(
            club,
            first_name="Ada",
            last_name="EXAMPLE",
            license_id="LTF-EX-0001",
            number=_number("19711002130"),
        )
        missing_number = self._member(
            club,
            first_name="No",
            last_name="NUMBER",
            license_id="LTF-EX-0002",
            number="",
        )
        verified = self._member(
            club,
            first_name="Vera",
            last_name="EXAMPLE",
            license_id="LTF-EX-0003",
            number=_number("19900101120"),
        )
        MemberVerification.objects.create(
            member=verified,
            status=MemberVerification.Status.VERIFIED,
            verified_at=datetime(2026, 11, 29, 13, 5, tzinfo=ZoneInfo("UTC")),
            verified_by=admin,
            method=MemberVerification.Method.CARD,
            locked_fields=["first_name", "last_name", "date_of_birth", "sex"],
        )
        own = self._member(
            club,
            first_name="Bea",
            last_name="EXAMPLE",
            license_id="LTF-EX-0004",
            number="",
            user=member_user,
        )
        lines = {
            "SMOKE_CLUB_ID": club.id,
            "SMOKE_OPEN_ID": open_member.id,
            "SMOKE_MISSING_ID": missing_number.id,
            "SMOKE_VERIFIED_ID": verified.id,
            "SMOKE_OWN_ID": own.id,
            "SMOKE_USERNAME": admin.username,
            "SMOKE_MEMBER_USERNAME": member_user.username,
            "SMOKE_PASSWORD": SMOKE_PASSWORD,
            "SMOKE_TOTP_SECRET": SMOKE_TOTP_SECRET,
        }
        if options["env"]:
            for key, value in lines.items():
                self.stdout.write(f"{key}={value}")
        else:
            self.stdout.write(self.style.SUCCESS(f"Smoke club {club.id} is ready."))

    def _user(self, username: str, role: str) -> User:
        user = User.objects.create_user(
            username=username,
            email=f"{username}@example.com",
            password=SMOKE_PASSWORD,
            role=role,
        )
        EmailAddress.objects.create(user=user, email=user.email, verified=True, primary=True)
        TOTP.activate(user, SMOKE_TOTP_SECRET)
        RecoveryCodes.activate(user)
        return user

    def _member(self, club, *, first_name, last_name, license_id, number, user=None) -> Member:
        member = Member.objects.create(
            user=user,
            club=club,
            first_name=first_name,
            last_name=last_name,
            sex=Member.Sex.FEMALE,
            date_of_birth=date(1990, 1, 1),
            ltf_licenseid=license_id,
        )
        if number:
            MemberRecord.objects.create(
                member=member,
                social_security_number=number,
                social_security_country="LU",
            )
        return member

    def _enable_club_management(self, club, owner) -> None:
        from modules.codes import build_payload, sign_payload
        from modules.entitlements import install_id_str, redeem_product_code, set_club_assignment
        from modules.registry import CLUB_MANAGEMENT_MODULE_ID

        token = sign_payload(build_payload(module_ids=[CLUB_MANAGEMENT_MODULE_ID], install_id=install_id_str()))
        redeem_product_code(token)
        set_club_assignment(club=club, module_id=CLUB_MANAGEMENT_MODULE_ID, enabled=True, user=owner)
