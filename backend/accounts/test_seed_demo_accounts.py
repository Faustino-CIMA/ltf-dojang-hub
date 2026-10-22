import os
from datetime import timedelta
from io import StringIO
from unittest.mock import patch

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from accounts.models import User
from clubmgmt.clothing import MemberClothingValue
from clubmgmt.gear import MemberGear
from clubmgmt.teams import ClubTeam
from clubs.models import Club
from events.models import Event
from licenses.models import Invoice, License
from members.models import Member
from modules.models import InstallEntitlement

PASSWORD_ENVS = (
    "DEMO_LTF_ADMIN_PASSWORD",
    "DEMO_LTF_FINANCE_PASSWORD",
    "DEMO_CLUB_ADMIN_PASSWORD",
    "DEMO_CLUB_FINANCE_PASSWORD",
    "DEMO_COACH_PASSWORD",
    "DEMO_MEMBER_PASSWORD",
)


def _counts():
    return (
        User.objects.count(),
        Club.objects.count(),
        Member.objects.count(),
        License.objects.count(),
        Invoice.objects.count(),
        Event.objects.count(),
        InstallEntitlement.objects.count(),
    )


class SeedDemoRefusalTests(TestCase):
    def setUp(self):
        self.ltf_admin = User.objects.create_user(
            username="ltfadmin",
            email="ltf@example.com",
            password="keep-this-password",
            role=User.Roles.LTF_ADMIN,
            is_email_verified=True,
        )
        self.club = Club.objects.create(name="Centre Luxembourg", created_by=self.ltf_admin)
        self.member = Member.objects.create(
            first_name="Lea",
            last_name="Weber",
            club=self.club,
            date_of_birth="2010-06-01",
            is_active=True,
        )
        self.coach = User.objects.create_user(
            username="ntshot_coach",
            email="coach@example.com",
            password="old-coach-password",
            role=User.Roles.COACH,
            is_email_verified=False,
        )
        self.club.trainers.add(self.coach)

    @override_settings(DEMO_MODE=False)
    def test_refuses_without_demo_mode_and_changes_nothing(self):
        before = _counts()
        for command, kwargs in (
            ("seed_demo_accounts", {}),
            ("seed_demo_data", {}),
            ("seed_demo_accounts", {"force_demo": True}),
            ("seed_demo_data", {"force_demo": True}),
        ):
            stdout = StringIO()
            with self.assertRaises(CommandError) as ctx:
                call_command(command, stdout=stdout, **kwargs)
            self.assertIn("DEMO_MODE", str(ctx.exception))
            self.assertIn("Nothing was changed", str(ctx.exception))
            self.assertEqual(stdout.getvalue(), "")
        self.assertEqual(before, _counts())
        self.assertFalse(User.objects.filter(username="demo_member").exists())
        self.assertFalse(User.objects.filter(username="demo_ltf_admin").exists())
        self.coach.refresh_from_db()
        self.member.refresh_from_db()
        self.club.refresh_from_db()
        self.assertFalse(self.coach.is_email_verified)
        self.assertFalse(self.member.is_demo)
        self.assertFalse(self.club.is_demo)
        self.assertEqual(self.club.name, "Centre Luxembourg")
        self.assertTrue(self.ltf_admin.check_password("keep-this-password"))

    @override_settings(DEMO_MODE=True)
    def test_refuses_when_database_has_non_demo_clubs_or_members(self):
        before = _counts()
        stdout = StringIO()
        with self.assertRaises(CommandError) as ctx:
            call_command("seed_demo_data", stdout=stdout)
        self.assertIn("not demo data", str(ctx.exception))
        self.assertIn("Nothing was changed", str(ctx.exception))
        self.assertEqual(before, _counts())
        self.assertFalse(User.objects.filter(username="demo_ltf_admin").exists())
        self.assertFalse(Club.objects.filter(is_demo=True).exists())
        self.assertFalse(Member.objects.filter(is_demo=True).exists())
        self.coach.refresh_from_db()
        self.assertFalse(self.coach.is_email_verified)

    @override_settings(DEMO_MODE=True)
    def test_refuses_when_only_a_non_demo_member_exists(self):
        Member.objects.all().delete()
        self.club.delete()
        Member.objects.create(first_name="Noa", last_name="Petit", is_demo=False)
        before_members = Member.objects.count()
        with self.assertRaises(CommandError) as ctx:
            call_command("seed_demo_accounts", stdout=StringIO())
        self.assertIn("not demo data", str(ctx.exception))
        self.assertEqual(Member.objects.count(), before_members)
        self.assertFalse(User.objects.filter(username="demo_member").exists())
        self.assertFalse(Club.objects.filter(is_demo=True).exists())


class SeedDemoDataTests(TestCase):
    @override_settings(DEMO_MODE=True)
    def test_seed_is_idempotent_and_hides_env_passwords(self):
        env = {
            "DEMO_LTF_ADMIN_PASSWORD": "ltf-admin-pass-12345",
            "DEMO_LTF_FINANCE_PASSWORD": "ltf-finance-pass-12345",
            "DEMO_CLUB_ADMIN_PASSWORD": "club-admin-pass-12345",
            "DEMO_CLUB_FINANCE_PASSWORD": "finance-pass-12345",
            "DEMO_COACH_PASSWORD": "coach-pass-12345",
            "DEMO_MEMBER_PASSWORD": "member-pass-12345",
        }
        stdout = StringIO()
        with patch.dict(os.environ, env, clear=False):
            call_command("seed_demo_data", stdout=stdout)
            after_first = _counts()
            call_command("seed_demo_data", stdout=stdout)
            call_command("seed_demo_accounts", "--with-data", stdout=stdout)
            call_command("seed_demo_accounts", stdout=stdout)
        output = stdout.getvalue()
        for secret in env.values():
            self.assertNotIn(secret, output)
        self.assertIn("set from DEMO_MEMBER_PASSWORD", output)
        self.assertEqual(after_first, _counts())

        clubs = Club.objects.filter(is_demo=True)
        self.assertGreaterEqual(clubs.count(), 4)
        self.assertLessEqual(clubs.count(), 5)
        self.assertFalse(Club.objects.filter(is_demo=False).exists())
        self.assertTrue(clubs.filter(name="Demo Nordlicht Dojang").exists())
        home = Club.objects.get(name="Demo Nordlicht Dojang")

        members = Member.objects.filter(is_demo=True)
        self.assertGreaterEqual(members.count(), 40)
        self.assertLessEqual(members.count(), 60)
        self.assertFalse(members.exclude(email__iendswith="@example.lu").exists())
        self.assertFalse(Member.objects.filter(is_demo=False).exists())

        today = timezone.localdate()
        demo_licenses = License.objects.filter(member__is_demo=True)
        self.assertTrue(demo_licenses.filter(status=License.Status.EXPIRED).exists())
        self.assertTrue(demo_licenses.filter(status=License.Status.PENDING).exists())
        self.assertTrue(
            demo_licenses.filter(
                status=License.Status.ACTIVE,
                end_date__gt=today,
                end_date__lte=today + timedelta(days=30),
            ).exists()
        )
        self.assertTrue(
            demo_licenses.filter(
                status=License.Status.ACTIVE,
                end_date__gt=today + timedelta(days=30),
            ).exists()
        )
        self.assertGreaterEqual(ClubTeam.objects.filter(club=home, name__startswith="Demo").count(), 2)
        self.assertTrue(MemberGear.objects.filter(member__is_demo=True).exists())
        self.assertTrue(MemberClothingValue.objects.filter(member__is_demo=True).exists())
        self.assertGreaterEqual(
            Invoice.objects.filter(club=home, order__items__description__startswith="DEMO club fee").distinct().count(),
            3,
        )
        self.assertTrue(Event.objects.filter(title__startswith="Demo ").exists())
        self.assertTrue(InstallEntitlement.objects.filter(module_id="event_calendar", active=True).exists())

        member = User.objects.get(username="demo_member")
        self.assertEqual(member.role, User.Roles.MEMBER)
        self.assertTrue(member.is_email_verified)
        self.assertTrue(member.email.endswith("@example.lu"))
        self.assertTrue(member.check_password("member-pass-12345"))
        self.assertEqual(member.member_profile.club_id, home.id)
        self.assertTrue(member.member_profile.is_demo)
        self.assertTrue(member.emailaddress_set.filter(verified=True).exists())

        finance_user = User.objects.get(username="demo_ltf_finance")
        self.assertEqual(finance_user.role, User.Roles.LTF_FINANCE)
        club_finance = User.objects.get(username="demo_club_finance")
        self.assertEqual(club_finance.role, User.Roles.CLUB_ADMIN)
        self.assertTrue(home.admins.filter(pk=club_finance.pk).exists())
        self.assertTrue(home.admins.filter(username="demo_club_admin").exists())
        coach = User.objects.get(username="demo_coach")
        self.assertTrue(coach.is_email_verified)
        self.assertTrue(home.trainers.filter(pk=coach.pk).exists())
        self.assertEqual(coach.member_profile.primary_license_role, Member.LicenseRole.COACH)

    @override_settings(DEMO_MODE=True)
    def test_accounts_command_needs_a_demo_club(self):
        with self.assertRaises(CommandError) as ctx:
            call_command("seed_demo_accounts", stdout=StringIO())
        self.assertIn("seed_demo_data", str(ctx.exception))
        self.assertEqual(User.objects.count(), 0)
        self.assertEqual(Club.objects.count(), 0)

    @override_settings(DEMO_MODE=True)
    def test_prints_a_random_password_once_for_a_new_account(self):
        creator = User.objects.create_user(
            username="maker",
            email="maker@example.lu",
            password="maker-pass",
            role=User.Roles.LTF_ADMIN,
            is_email_verified=True,
        )
        Club.objects.create(name="Demo Nordlicht Dojang", created_by=creator, is_demo=True)
        blank = {name: "" for name in PASSWORD_ENVS}
        stdout = StringIO()
        with patch.dict(os.environ, blank, clear=False):
            call_command("seed_demo_accounts", stdout=stdout)
        first = stdout.getvalue()
        self.assertIn("Member: demo_member (created", first)
        printed = _generated_password(first, "Member:")
        self.assertGreaterEqual(len(printed), 16)
        member = User.objects.get(username="demo_member")
        self.assertTrue(member.check_password(printed))
        self.assertTrue(member.email.endswith("@example.lu"))

        again = StringIO()
        with patch.dict(os.environ, blank, clear=False):
            call_command("seed_demo_accounts", stdout=again)
        self.assertNotIn(printed, again.getvalue())
        self.assertIn("Member: demo_member (updated", again.getvalue())
        self.assertIn("password: unchanged", again.getvalue())
        self.assertEqual(User.objects.filter(username="demo_member").count(), 1)

    @override_settings(DEMO_MODE=True)
    def test_force_demo_does_not_touch_real_rows_or_entitlements(self):
        real_admin = User.objects.create_user(
            username="ltfadmin",
            email="person@federation.lu",
            password="keep-this-password",
            role=User.Roles.LTF_ADMIN,
            is_email_verified=True,
        )
        club = Club.objects.create(name="Centre Luxembourg", created_by=real_admin)
        member = Member.objects.create(
            first_name="Lea",
            last_name="Weber",
            club=club,
            date_of_birth="2010-06-01",
        )
        coach = User.objects.create_user(
            username="ntshot_coach",
            email="coach@example.com",
            password="old-coach-password",
            role=User.Roles.COACH,
            is_email_verified=False,
        )
        call_command("seed_demo_data", force_demo=True, stdout=StringIO())
        club.refresh_from_db()
        member.refresh_from_db()
        real_admin.refresh_from_db()
        coach.refresh_from_db()
        self.assertEqual(club.name, "Centre Luxembourg")
        self.assertFalse(club.is_demo)
        self.assertFalse(member.is_demo)
        self.assertEqual(member.last_name, "WEBER")
        self.assertTrue(real_admin.check_password("keep-this-password"))
        self.assertFalse(coach.is_email_verified)
        self.assertFalse(InstallEntitlement.objects.filter(module_id="event_calendar").exists())
        self.assertFalse(Event.objects.exists())
        self.assertGreaterEqual(Club.objects.filter(is_demo=True).count(), 4)
        self.assertGreaterEqual(Member.objects.filter(is_demo=True).count(), 40)
        self.assertTrue(User.objects.get(username="demo_ltf_admin").email.endswith("@example.lu"))

    @override_settings(DEMO_MODE=True)
    def test_refuses_to_rewrite_a_demo_username_with_a_real_email(self):
        user = User.objects.create_user(
            username="demo_ltf_admin",
            email="real.person@federation.lu",
            password="keep-real",
            role=User.Roles.LTF_ADMIN,
            is_email_verified=True,
        )
        with self.assertRaises(CommandError) as ctx:
            call_command("seed_demo_data", stdout=StringIO())
        self.assertIn("demo_ltf_admin", str(ctx.exception))
        user.refresh_from_db()
        self.assertEqual(user.email, "real.person@federation.lu")
        self.assertTrue(user.check_password("keep-real"))
        self.assertFalse(Club.objects.filter(is_demo=True).exists())
        self.assertFalse(Member.objects.filter(is_demo=True).exists())


class DemoModeApiTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="reader",
            email="reader@example.lu",
            password="reader-pass",
            role=User.Roles.LTF_ADMIN,
            is_email_verified=True,
        )
        token = Token.objects.create(user=self.user)
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")

    @override_settings(DEMO_MODE=True)
    def test_me_reports_demo_mode(self):
        response = self.client.get("/api/auth/me/")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["demo_mode"])

    @override_settings(DEMO_MODE=False)
    def test_me_hides_demo_mode_when_the_flag_is_off(self):
        response = self.client.get("/api/auth/me/")
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data["demo_mode"])


def _generated_password(output: str, label: str) -> str:
    lines = output.splitlines()
    for index, line in enumerate(lines):
        if line.startswith(label) and "created" in line:
            return lines[index + 1].split(":", 1)[1].strip()
    return ""
