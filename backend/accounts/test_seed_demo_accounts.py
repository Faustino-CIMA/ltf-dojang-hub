import os
from io import StringIO
from unittest.mock import patch

from django.core.management import call_command
from django.test import TestCase

from accounts.models import User
from clubs.models import Club
from members.models import Member


class SeedDemoAccountsTests(TestCase):
    def setUp(self):
        self.ltf_admin = User.objects.create_user(
            username="ltfadmin",
            email="ltf@example.com",
            password="keep-this-password",
            role=User.Roles.LTF_ADMIN,
            is_email_verified=True,
        )
        self.club = Club.objects.create(name="Centre Luxembourg", created_by=self.ltf_admin)
        self.club_admin = User.objects.create_user(
            username="ntshot_club",
            email="club@example.com",
            password="keep-club-password",
            role=User.Roles.CLUB_ADMIN,
            is_email_verified=True,
        )
        self.club.admins.add(self.club_admin)
        self.coach = User.objects.create_user(
            username="ntshot_coach",
            email="coach@example.com",
            password="old-coach-password",
            role=User.Roles.COACH,
            is_email_verified=False,
        )
        self.club.trainers.add(self.coach)

    def test_command_is_idempotent_and_verifies_logins(self):
        env = {
            "DEMO_MEMBER_PASSWORD": "member-pass-12345",
            "DEMO_CLUB_FINANCE_PASSWORD": "finance-pass-12345",
            "DEMO_COACH_PASSWORD": "coach-pass-12345",
        }
        stdout = StringIO()
        with patch.dict(os.environ, env, clear=False):
            call_command("seed_demo_accounts", stdout=stdout)
            call_command("seed_demo_accounts", stdout=stdout)

        output = stdout.getvalue()
        for secret in env.values():
            self.assertNotIn(secret, output)
        self.assertIn("set from DEMO_MEMBER_PASSWORD", output)
        self.assertEqual(User.objects.filter(username="demo_member").count(), 1)
        self.assertEqual(User.objects.filter(username="demo_club_finance").count(), 1)

        member = User.objects.get(username="demo_member")
        self.assertEqual(member.role, User.Roles.MEMBER)
        self.assertTrue(member.is_email_verified)
        self.assertTrue(member.check_password("member-pass-12345"))
        self.assertEqual(member.member_profile.club_id, self.club.id)
        self.assertTrue(member.emailaddress_set.filter(verified=True).exists())

        finance = User.objects.get(username="demo_club_finance")
        self.assertEqual(finance.role, User.Roles.CLUB_ADMIN)
        self.assertTrue(finance.is_email_verified)
        self.assertTrue(self.club.admins.filter(pk=finance.pk).exists())
        self.assertTrue(Member.objects.filter(user=finance, club=self.club).exists())

        self.coach.refresh_from_db()
        self.assertTrue(self.coach.is_email_verified)
        self.assertTrue(self.coach.check_password("coach-pass-12345"))
        self.assertTrue(self.coach.emailaddress_set.filter(verified=True).exists())

        self.ltf_admin.refresh_from_db()
        self.club_admin.refresh_from_db()
        self.assertTrue(self.ltf_admin.check_password("keep-this-password"))
        self.assertTrue(self.club_admin.check_password("keep-club-password"))
        self.assertIn("password: unchanged", output)

    def test_prints_a_random_password_once_for_a_new_account(self):
        stdout = StringIO()
        with patch.dict(os.environ, {"DEMO_MEMBER_PASSWORD": ""}, clear=False):
            call_command("seed_demo_accounts", stdout=stdout)
        first = stdout.getvalue()
        self.assertIn("Member: demo_member (created", first)
        printed = _generated_password(first, "Member:")
        self.assertGreaterEqual(len(printed), 16)
        member = User.objects.get(username="demo_member")
        self.assertTrue(member.check_password(printed))

        again = StringIO()
        with patch.dict(os.environ, {"DEMO_MEMBER_PASSWORD": ""}, clear=False):
            call_command("seed_demo_accounts", stdout=again)
        self.assertNotIn(printed, again.getvalue())
        self.assertIn("Member: demo_member (updated", again.getvalue())
        self.assertIn("password: unchanged", again.getvalue())


def _generated_password(output: str, label: str) -> str:
    lines = output.splitlines()
    for index, line in enumerate(lines):
        if line.startswith(label) and "created" in line:
            return lines[index + 1].split(":", 1)[1].strip()
    return ""
