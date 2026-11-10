import csv
import io
from datetime import date, timedelta
from unittest.mock import patch
from urllib.parse import parse_qs, urlparse

from django.db import connection
from django.test import TestCase, override_settings
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import AccountSetupInvite, DeskGrant, StaffMfaGrace, User
from accounts.setup_invites import invite_for_token, invite_is_open, issue_setup_invite
from clubs.models import Club
from ops.models import OpsAuditLog

from .models import Member


@override_settings(FRONTEND_BASE_URL="https://hub.example.test")
class MemberUserAccountTests(TestCase):
    def setUp(self):
        self.ltf_admin = User.objects.create_user(
            username="ltf-accounts",
            email="ltf-accounts@example.test",
            password="pass12345",
            role=User.Roles.LTF_ADMIN,
        )
        self.club_admin = User.objects.create_user(
            username="club-accounts",
            email="club-accounts@example.test",
            password="pass12345",
            role=User.Roles.CLUB_ADMIN,
        )
        self.other_admin = User.objects.create_user(
            username="other-accounts",
            email="other-accounts@example.test",
            password="pass12345",
            role=User.Roles.CLUB_ADMIN,
        )
        self.finance = User.objects.create_user(
            username="finance-accounts",
            email="finance-accounts@example.test",
            password="pass12345",
            role=User.Roles.LTF_FINANCE,
        )
        self.coach = User.objects.create_user(
            username="coach-accounts",
            email="coach-accounts@example.test",
            password="pass12345",
            role=User.Roles.COACH,
        )
        self.superuser = User.objects.create_superuser(
            username="super-accounts",
            email="super-accounts@example.test",
            password="pass12345",
        )
        self.club = Club.objects.create(name="Account Club", created_by=self.ltf_admin)
        self.other = Club.objects.create(name="Other Account Club", created_by=self.ltf_admin)
        self.club.admins.add(self.club_admin)
        self.club.trainers.add(self.coach)
        self.other.admins.add(self.other_admin)
        self.client = APIClient()
        self.client.force_authenticate(user=self.club_admin)

    def _member(self, first, last, **kwargs):
        defaults = {
            "club": self.club,
            "first_name": first,
            "last_name": last,
            "date_of_birth": date(2000, 1, 1),
            "is_active": True,
        }
        defaults.update(kwargs)
        return Member.objects.create(**defaults)

    def _post(self, member_ids, action="create", locale="en"):
        return self.client.post(
            "/api/members/user-accounts/",
            {"action": action, "member_ids": member_ids, "locale": locale},
            format="json",
        )

    def _rows(self, text):
        return list(csv.DictReader(io.StringIO(text)))

    def test_club_admin_creates_for_own_club_and_is_refused_for_another(self):
        own = self._member("Ada", "Ng", email="")
        other = self._member("Bea", "Other", club=self.other)
        with patch("accounts.email_utils.send_password_reset_email") as send_reset, patch(
            "accounts.email_utils.send_resend_email"
        ) as send_any, patch("accounts.email_utils.send_club_admin_welcome_email") as send_welcome:
            response = self._post([own.id])
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response["Cache-Control"], "no-store")
        send_reset.assert_not_called()
        send_any.assert_not_called()
        send_welcome.assert_not_called()
        own.refresh_from_db()
        self.assertIsNotNone(own.user_id)
        self.assertEqual(own.user.role, User.Roles.MEMBER)
        self.assertEqual(own.user.email, "")
        self.assertFalse(StaffMfaGrace.objects.filter(user=own.user).exists())
        self.assertEqual(response.data["created_count"], 1)
        self.assertIn("/en/account-setup?token=", response.data["copy_link"])
        refused = self._post([other.id])
        self.assertEqual(refused.status_code, 403)
        other.refresh_from_db()
        self.assertIsNone(other.user_id)

    def test_view_only_finance_and_coach_are_refused(self):
        member = self._member("Cara", "View")
        today = timezone.localdate()
        DeskGrant.objects.create(
            user=self.superuser,
            desk=DeskGrant.Desk.CLUB_ADMIN,
            club=self.club,
            level=DeskGrant.Level.READ_ONLY,
            source=DeskGrant.Source.MANUAL,
            valid_from=today,
            valid_until=today + timedelta(days=30),
        )
        self.client.force_authenticate(user=self.superuser)
        refused = self.client.post(
            "/api/members/user-accounts/",
            {"action": "create", "member_ids": [member.id]},
            format="json",
            HTTP_X_DESK=f"club_admin:{self.club.id}",
        )
        self.assertEqual(refused.status_code, 403)
        member.refresh_from_db()
        self.assertIsNone(member.user_id)

        self.client.force_authenticate(user=self.finance)
        self.assertEqual(self._post([member.id]).status_code, 403)
        self.client.force_authenticate(user=self.coach)
        self.assertEqual(self._post([member.id]).status_code, 403)
        self.client.force_authenticate(user=self.superuser)
        self.assertEqual(self._post([member.id]).status_code, 403)
        member.refresh_from_db()
        self.assertIsNone(member.user_id)

    def test_ltf_admin_creates_for_a_member_with_no_club(self):
        member = self._member("No", "Club", club=None)
        self.client.force_authenticate(user=self.ltf_admin)
        response = self._post([member.id])
        self.assertEqual(response.status_code, 200, response.data)
        member.refresh_from_db()
        self.assertEqual(member.user.role, User.Roles.MEMBER)
        self.assertFalse(member.user.desk_grants.exclude(desk="member").exists())

    def test_username_collision_and_missing_email_still_creates(self):
        first = self._member("Ann", "Muller")
        second = self._member("Ada", "Muller")
        response = self._post([first.id, second.id])
        self.assertEqual(response.status_code, 200, response.data)
        first.refresh_from_db()
        second.refresh_from_db()
        names = {first.user.username, second.user.username}
        self.assertEqual(len(names), 2)
        self.assertTrue(all(len(name) <= 10 for name in names))
        self.assertIn("amuller", names)
        rows = self._rows(response.data["csv"])
        self.assertEqual(rows[0]["link_type"], "first_login")
        self.assertEqual(rows[0]["skipped"], "")
        self.assertNotIn("http", str(OpsAuditLog.objects.get(action="members.bulk_user_accounts").metadata).lower())
        self.assertNotIn("token", str(OpsAuditLog.objects.get(action="members.bulk_user_accounts").metadata).lower())

    def test_email_match_does_not_create_a_second_user_and_one_confirm_links_it(self):
        existing = User.objects.create_user(
            username="ada-existing",
            email="ada.match@example.test",
            password="pass12345",
            role=User.Roles.MEMBER,
        )
        member = self._member("Ada", "Match", email="Ada.Match@example.test")
        preview = self.client.get(f"/api/members/user-accounts/?ids={member.id}")
        self.assertEqual(preview.status_code, 200)
        self.assertEqual(preview.data["results"][0]["match"]["username"], "ada-existing")
        self.assertTrue(preview.data["results"][0]["can_link"])
        created = self._post([member.id])
        self.assertEqual(created.data["created_count"], 0)
        self.assertEqual(created.data["needs_link"][0]["user_id"], existing.id)
        self.assertEqual(User.objects.filter(email__iexact="ada.match@example.test").count(), 1)
        linked = self._post([member.id], action="link")
        self.assertEqual(linked.status_code, 200, linked.data)
        member.refresh_from_db()
        self.assertEqual(member.user_id, existing.id)
        self.assertEqual(member.user.role, User.Roles.MEMBER)
        audit = OpsAuditLog.objects.get(action="members.user_linked")
        self.assertEqual(audit.metadata["linked_member_ids"], [member.id])
        self.assertEqual(audit.metadata["linked_user_ids"], [existing.id])
        self.assertNotIn("http", str(audit.metadata).lower())
        self.assertNotIn("token", str(audit.metadata).lower())

    def test_email_already_linked_elsewhere_is_refused(self):
        other_member = self._member("Other", "Person", email="taken.link@example.test")
        other_user = User.objects.create_user(
            username="taken-link",
            email="taken.link@example.test",
            password="pass12345",
            role=User.Roles.MEMBER,
        )
        other_member.user = other_user
        other_member.save(update_fields=["user"])
        member = self._member("New", "Person", email="taken.link@example.test")
        response = self._post([member.id])
        self.assertEqual(response.data["created_count"], 0)
        self.assertEqual(response.data["skipped"][0]["reason"], "linked_elsewhere")
        member.refresh_from_db()
        self.assertIsNone(member.user_id)

    def test_club_admin_cannot_link_an_ltf_admin_login(self):
        member = self._member("Lea", "Staff", email="ltf-accounts@example.test")
        response = self._post([member.id], action="link")
        self.assertEqual(response.data["linked_count"], 0)
        self.assertEqual(response.data["skipped"][0]["reason"], "staff_login")
        member.refresh_from_db()
        self.assertIsNone(member.user_id)

    def test_under_16_missing_birth_date_and_inactive_are_skipped(self):
        today = timezone.localdate()
        child = self._member("Kid", "Young", date_of_birth=today.replace(year=today.year - 15))
        teen = self._member("Teen", "Allowed", date_of_birth=today.replace(year=today.year - 16))
        missing = self._member("No", "Date", date_of_birth=None)
        idle = self._member("Idle", "Member", is_active=False)
        before = User.objects.count()
        response = self._post([child.id, teen.id, missing.id, idle.id])
        self.assertEqual(response.status_code, 200, response.data)
        reasons = {row["member_id"]: row["reason"] for row in response.data["skipped"]}
        self.assertEqual(reasons[child.id], "under_16")
        self.assertEqual(reasons[missing.id], "no_birth_date")
        self.assertEqual(reasons[idle.id], "inactive")
        self.assertNotIn(teen.id, reasons)
        teen.refresh_from_db()
        self.assertIsNotNone(teen.user_id)
        child.refresh_from_db()
        self.assertIsNone(child.user_id)
        self.assertEqual(User.objects.count(), before + 1)
        skipped_only = self._post([child.id])
        self.assertEqual(skipped_only.data["csv"], "")
        self.assertEqual(skipped_only.data["created_count"], 0)

    def test_first_login_link_expires_in_seven_days_is_single_use_and_revokes_the_older(self):
        member = self._member("Link", "Person")
        response = self._post([member.id])
        self.assertEqual(response.status_code, 200, response.data)
        member.refresh_from_db()
        raw = parse_qs(urlparse(response.data["copy_link"]).query)["token"][0]
        invite = invite_for_token(raw)
        self.assertGreater(invite.expires_at, timezone.now() + timedelta(days=6))
        self.assertLess(invite.expires_at, timezone.now() + timedelta(days=8))
        older = invite
        copy = self._post([member.id], action="copy_link")
        self.assertEqual(copy.status_code, 200, copy.data)
        older.refresh_from_db()
        self.assertIsNotNone(older.revoked_at)
        self.assertFalse(invite_is_open(invite_for_token(raw)))
        fresh = parse_qs(urlparse(copy.data["copy_link"]).query)["token"][0]
        setup = self.client.post(
            "/api/auth/account-setup/",
            {
                "token": fresh,
                "email": "link.person@example.test",
                "password": "Correct-horse-battery",
                "password_confirm": "Correct-horse-battery",
            },
            format="json",
        )
        self.assertEqual(setup.status_code, 200, setup.data)
        again = self.client.post(
            "/api/auth/account-setup/",
            {
                "token": fresh,
                "email": "link.person2@example.test",
                "password": "Correct-horse-battery",
                "password_confirm": "Correct-horse-battery",
            },
            format="json",
        )
        self.assertEqual(again.status_code, 400)
        audit = OpsAuditLog.objects.get(action="members.user_account", message__startswith="Created 1 first-login")
        self.assertEqual(audit.metadata["issued_member_ids"], [member.id])
        self.assertNotIn("http", str(audit.metadata).lower())
        self.assertNotIn("token", str(audit.metadata).lower())
        self.assertEqual(audit.metadata["actor_id"], self.club_admin.id)

    def test_list_marks_a_member_who_already_administers_their_club(self):
        admin_member = self._member("Ada", "Admin", user=self.club_admin)
        other = self._member("Bea", "Member")
        self.client.force_authenticate(user=self.ltf_admin)
        response = self.client.get("/api/members/?page=1&page_size=50")
        self.assertEqual(response.status_code, 200, response.data)
        rows = {row["id"]: row["is_home_club_admin"] for row in response.data["results"]}
        self.assertTrue(rows[admin_member.id])
        self.assertFalse(rows[other.id])

    def test_list_account_state_query_count_stays_flat(self):
        pending_user = User.objects.create_user(username="pending-acct", password="pass12345", role=User.Roles.MEMBER)
        active_user = User.objects.create_user(username="active-acct", password="pass12345", role=User.Roles.MEMBER)
        disabled_user = User.objects.create_user(
            username="disabled-acct", password="pass12345", role=User.Roles.MEMBER, is_active=False
        )
        self._member("None", "Account")
        pending = self._member("Pending", "Account", user=pending_user)
        active = self._member("Active", "Account", user=active_user)
        disabled = self._member("Disabled", "Account", user=disabled_user)
        issue_setup_invite(pending_user, self.ltf_admin)
        used, _raw = issue_setup_invite(active_user, self.ltf_admin)
        used.used_at = timezone.now()
        used.save(update_fields=["used_at"])
        self.client.force_authenticate(user=self.ltf_admin)

        def listed():
            with CaptureQueriesContext(connection) as captured:
                response = self.client.get("/api/members/?page=1&page_size=50&is_active=true")
            self.assertEqual(response.status_code, 200)
            return response, len(captured)

        self.client.get("/api/members/?page=1&page_size=50&is_active=true")
        first, first_queries = listed()
        states = {row["id"]: row["account_state"] for row in first.data["results"]}
        self.assertEqual(states[pending.id], "pending")
        self.assertEqual(states[active.id], "active")
        self.assertEqual(states[disabled.id], "disabled")
        none_id = next(row_id for row_id, state in states.items() if state == "none" and row_id not in {pending.id, active.id, disabled.id})
        self.assertEqual(states[none_id], "none")
        for index in range(6):
            self._member("Extra", f"Row{index}")
        _second, second_queries = listed()
        self.assertEqual(first_queries, second_queries)
        filtered = self.client.get("/api/members/?page=1&page_size=50&account=pending&is_active=true")
        self.assertEqual([row["id"] for row in filtered.data["results"]], [pending.id])
        ordered = self.client.get("/api/members/?page=1&page_size=50&ordering=account&is_active=true")
        self.assertEqual(ordered.status_code, 200)

    def test_invitation_uses_the_club_language_and_replaces_the_file_link(self):
        self.club.communication_language = "de"
        self.club.save(update_fields=["communication_language"])
        with_email = self._member("Ada", "Ng", email="ada.ng@example.test")
        without = self._member("Bea", "Noemail", email="")
        created = self._post([with_email.id, without.id], locale="fr")
        self.assertEqual(created.status_code, 200, created.data)
        self.assertEqual({row["name"] for row in created.data["created"]}, {"NG Ada", "NOEMAIL Bea"})
        ada_created = next(row for row in created.data["created"] if row["email"] == "ada.ng@example.test")
        file_rows = self._rows(created.data["csv"])
        ada = next(row for row in file_rows if row["username"] == ada_created["username"])
        old_token = parse_qs(urlparse(ada["link"]).query)["token"][0]
        self.assertTrue(invite_is_open(invite_for_token(old_token)))
        with patch("accounts.email_utils.send_resend_email", return_value=(True, "")) as send:
            sent = self._post([with_email.id, without.id], action="send_invite", locale="fr")
        self.assertEqual(sent.status_code, 200, sent.data)
        self.assertEqual(sent.data["sent"], 1)
        self.assertEqual(sent.data["missing_email"], 1)
        self.assertEqual(sent.data["failed"], 0)
        self.assertFalse(invite_is_open(invite_for_token(old_token)))
        _to, subject, html, _text = send.call_args[0]
        self.assertEqual(_to, "ada.ng@example.test")
        self.assertIn("Anmeldung", subject)
        self.assertIn("/de/account-setup?token=", html)
        audit = OpsAuditLog.objects.get(action="members.user_invite")
        self.assertNotIn("http", str(audit.metadata).lower())
        self.assertNotIn("token", str(audit.metadata).lower())
