import csv
import io
from datetime import timedelta

from django.core import mail
from django.core.cache import cache
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import AccountSetupInvite, User
from accounts.setup_invites import hash_setup_token
from members.models import Member
from ops.models import OpsAuditLog

from .access_links import RATE_LIMIT
from .models import Club


@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend", RESEND_API_KEY="")
class ClubAdminAccessLinkTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.ltf = User.objects.create_user(username="ltf-links", password="pass12345", role=User.Roles.LTF_ADMIN)
        self.home = Club.objects.create(name="Silver Crane Academy", created_by=self.ltf, max_admins=5)
        self.other = Club.objects.create(name="Second Dojang", created_by=self.ltf, max_admins=5)
        self.actor_user = User.objects.create_user(
            username="cadmin",
            password="pass12345",
            role=User.Roles.CLUB_ADMIN,
            first_name="Casey",
            last_name="Admin",
        )
        Member.objects.create(user=self.actor_user, club=self.home, first_name="Casey", last_name="Admin")
        self.home.admins.add(self.actor_user)
        self.other.admins.add(self.actor_user)
        self.fresh = self._admin("Ada", "Ng", email="", password=None)
        self.ready = self._admin("Bea", "Ortiz", email="bea@example.com", password="Already-set-pass-1")
        self.other_admin = self._admin("Cleo", "Voss", email="", password=None, club=self.other)

    def _admin(self, first, last, *, email, password, club=None):
        club = club or self.home
        user = User(username=f"{first}.{last}".lower(), email=email, role=User.Roles.CLUB_ADMIN, first_name=first, last_name=last)
        if password:
            user.set_password(password)
            user.last_login = timezone.now()
        else:
            user.set_unusable_password()
        user.save()
        Member.objects.create(user=user, club=club, first_name=first, last_name=last, email=email)
        club.admins.add(user)
        return user

    def test_home_club_limits_add_and_remove_and_readd_keeps_the_account(self):
        self.client.force_authenticate(user=self.actor_user)
        outsider = Member.objects.create(club=self.other, first_name="Nia", last_name="Park", email="nia.park@example.com")
        denied = self.client.post(f"/api/clubs/{self.home.id}/add_admin/", {"member_id": outsider.id}, format="json")
        self.assertEqual(denied.status_code, 400)
        self.assertEqual(denied.data["detail"], "home_club_only")

        other_member = Member.objects.create(club=self.other, first_name="Omar", last_name="Feld", email="omar.feld@example.com")
        cross = self.client.post(f"/api/clubs/{self.other.id}/add_admin/", {"member_id": other_member.id}, format="json")
        self.assertEqual(cross.status_code, 403)
        self.assertEqual(cross.data["detail"], "actor_home_club")
        remove_other = self.client.post(
            f"/api/clubs/{self.other.id}/remove_admin/",
            {"user_id": self.other_admin.id},
            format="json",
        )
        self.assertEqual(remove_other.status_code, 403)
        self.assertTrue(self.other.admins.filter(id=self.other_admin.id).exists())

        removed = self.client.post(f"/api/clubs/{self.home.id}/remove_admin/", {"user_id": self.fresh.id}, format="json")
        self.assertEqual(removed.status_code, 200, removed.data)
        self.fresh.refresh_from_db()
        self.assertTrue(self.fresh.is_active)
        self.assertFalse(self.home.admins.filter(id=self.fresh.id).exists())
        self.assertIsNotNone(self.fresh.member_profile)
        again = self.client.post(
            f"/api/clubs/{self.home.id}/add_admin/",
            {"member_id": self.fresh.member_profile.id},
            format="json",
        )
        self.assertEqual(again.status_code, 200, again.data)
        self.assertFalse(again.data["created_user"])
        self.assertFalse(again.data["email_sent"])
        self.assertEqual(again.data["reset_url"], "")
        self.assertEqual(len(mail.outbox), 0)
        self.fresh.refresh_from_db()
        self.assertFalse(self.fresh.has_usable_password())

        board = self.client.get("/api/clubs/admin_assignment/")
        self.assertEqual([club["id"] for club in board.data["clubs"]], [self.home.id])
        search = self.client.get("/api/clubs/admin_assignment_members/", {"club_id": self.other.id, "licensed_only": "false"})
        self.assertEqual(search.data["members"], [])

    def test_single_link_is_setup_or_reset_and_email_rules(self):
        self.client.force_authenticate(user=self.ltf)
        missing = self.client.post(f"/api/clubs/admins/{self.fresh.id}/access-link/", {"delivery": "email", "locale": "fr"}, format="json")
        self.assertEqual(missing.status_code, 400)
        self.assertEqual(missing.data["detail"], "email_required")

        issued = self.client.post(
            f"/api/clubs/admins/{self.fresh.id}/access-link/",
            {"delivery": "both", "email": "ada.ng@example.com", "locale": "fr"},
            format="json",
        )
        self.assertEqual(issued.status_code, 200, issued.data)
        self.assertEqual(issued.data["kind"], "setup")
        self.assertIn("/fr/account-setup?token=", issued.data["link"])
        self.assertTrue(issued.data["email_sent"])
        self.fresh.refresh_from_db()
        self.assertEqual(self.fresh.email, "ada.ng@example.com")
        self.assertEqual(self.fresh.member_profile.email, "ada.ng@example.com")
        invite = AccountSetupInvite.objects.get(user=self.fresh)
        self.assertGreater(invite.expires_at, timezone.now() + timedelta(days=6))
        self.assertLess(invite.expires_at, timezone.now() + timedelta(days=8))
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("mot de passe", mail.outbox[0].body)
        self.assertIn("ada.ng@example.com", mail.outbox[0].to)
        token = issued.data["link"].split("token=", 1)[1]
        self.assertNotIn(token, str(OpsAuditLog.objects.get(action="club_admin_access_link").metadata))

        again = self.client.post(
            f"/api/clubs/admins/{self.fresh.id}/access-link/",
            {"delivery": "copy", "locale": "en"},
            format="json",
        )
        self.assertNotEqual(again.data["link"], issued.data["link"])
        invite.refresh_from_db()
        self.assertIsNotNone(invite.revoked_at)

        taken = User.objects.create_user(username="taken-mail", password="pass12345", email="taken@example.com")
        clash = self.client.post(
            f"/api/clubs/admins/{self.fresh.id}/access-link/",
            {"delivery": "copy", "email": taken.email, "locale": "en"},
            format="json",
        )
        self.assertEqual(clash.status_code, 400)
        self.assertEqual(clash.data["detail"], "email_in_use")
        self.fresh.refresh_from_db()
        self.assertEqual(self.fresh.email, "ada.ng@example.com")

        changed = self.client.post(
            f"/api/clubs/admins/{self.ready.id}/access-link/",
            {"delivery": "email", "email": "bea.new@example.com", "locale": "de"},
            format="json",
        )
        self.assertEqual(changed.status_code, 200, changed.data)
        self.assertEqual(changed.data["kind"], "reset")
        self.assertEqual(changed.data["link"], "")
        self.ready.refresh_from_db()
        self.assertEqual(self.ready.email, "bea.new@example.com")
        self.assertIn("Passwort", mail.outbox[-1].body)
        self.assertIn("reset-password", mail.outbox[-1].body)

        self.client.force_authenticate(user=self.actor_user)
        forbidden = self.client.post(
            f"/api/clubs/admins/{self.ready.id}/access-link/",
            {"delivery": "email", "email": "nope@example.com", "locale": "en"},
            format="json",
        )
        self.assertEqual(forbidden.status_code, 403)
        self.assertEqual(forbidden.data["detail"], "email_change_forbidden")
        self.ready.refresh_from_db()
        self.assertEqual(self.ready.email, "bea.new@example.com")

        blank = self._admin("Dee", "Klein", email="", password="Has-a-password-1")
        filled = self.client.post(
            f"/api/clubs/admins/{blank.id}/access-link/",
            {"delivery": "email", "email": "dee.klein@example.com", "locale": "lb"},
            format="json",
        )
        self.assertEqual(filled.status_code, 200, filled.data)
        self.assertEqual(filled.data["kind"], "reset")
        blank.refresh_from_db()
        self.assertEqual(blank.email, "dee.klein@example.com")
        self.assertIn("Passwuert", mail.outbox[-1].body)

        other = self.client.post(
            f"/api/clubs/admins/{self.other_admin.id}/access-link/",
            {"delivery": "copy", "locale": "en"},
            format="json",
        )
        self.assertEqual(other.status_code, 403)

    def test_csv_is_ltf_only_and_skips_people_who_have_a_password(self):
        self.client.force_authenticate(user=self.actor_user)
        denied = self.client.post(
            "/api/clubs/admins/access-links/",
            {"user_ids": [self.fresh.id], "locale": "en"},
            format="json",
        )
        self.assertEqual(denied.status_code, 403)
        self.assertFalse(AccountSetupInvite.objects.exists())

        self.client.force_authenticate(user=self.ltf)
        first = self.client.post(
            "/api/clubs/admins/access-links/",
            {"user_ids": [self.fresh.id, self.ready.id, self.other_admin.id, self.ltf.id], "locale": "en"},
            format="json",
        )
        self.assertEqual(first.status_code, 200, first.content)
        self.assertEqual(first["X-Access-Links-Skipped"], "2")
        self.assertIn("club-admin-links-CONFIDENTIAL-", first["Content-Disposition"])
        rows = list(csv.DictReader(io.StringIO(first.content.decode())))
        by_user = {row["username"]: row for row in rows}
        self.assertEqual(set(by_user), {self.fresh.username, self.other_admin.username})
        self.assertEqual(by_user[self.fresh.username]["kind"], "setup")
        self.assertNotIn(self.ready.username, by_user)
        token = by_user[self.fresh.username]["link"].split("token=", 1)[1]
        invite = AccountSetupInvite.objects.get(token_hash=hash_setup_token(token))
        self.assertGreater(invite.expires_at, timezone.now() + timedelta(hours=47))
        self.assertLess(invite.expires_at, timezone.now() + timedelta(hours=49))
        audit = OpsAuditLog.objects.get(action="club_admin_access_links_csv")
        self.assertNotIn(token, audit.message)
        self.assertNotIn(token, str(audit.metadata))
        self.assertEqual(audit.metadata["count"], 2)

        second = self.client.post(
            "/api/clubs/admins/access-links/",
            {"user_ids": [self.fresh.id], "locale": "en"},
            format="json",
        )
        new_token = list(csv.DictReader(io.StringIO(second.content.decode())))[0]["link"].split("token=", 1)[1]
        self.assertNotEqual(new_token, token)
        invite.refresh_from_db()
        self.assertIsNotNone(invite.revoked_at)
        public = APIClient()
        stale = public.get("/api/auth/account-setup/", {"token": token})
        self.assertEqual(stale.status_code, 400)

    def test_rate_limit_issues_nothing(self):
        cache.set(
            f"club-admin-access-link:{self.ltf.id}",
            {"start": timezone.now().timestamp(), "count": RATE_LIMIT},
            timeout=3600,
        )
        self.client.force_authenticate(user=self.ltf)
        response = self.client.post(
            "/api/clubs/admins/access-links/",
            {"user_ids": [self.fresh.id], "locale": "en"},
            format="json",
        )
        self.assertEqual(response.status_code, 429)
        self.assertEqual(response.data["detail"], "rate_limited")
        self.assertFalse(AccountSetupInvite.objects.exists())

    def test_board_reports_link_state(self):
        self.client.force_authenticate(user=self.ltf)
        self.client.post(
            f"/api/clubs/admins/{self.fresh.id}/access-link/",
            {"delivery": "copy", "locale": "en"},
            format="json",
        )
        board = self.client.get("/api/clubs/admin_assignment/")
        row = next(item for item in board.data["admins"] if item["id"] == self.fresh.id)
        self.assertEqual(row["link_status"], "active")
        self.assertFalse(row["password_set"])
        self.assertEqual(row["access_kind"], "setup")
        self.assertIsNotNone(row["link_sent_at"])
        ready = next(item for item in board.data["admins"] if item["id"] == self.ready.id)
        self.assertTrue(ready["password_set"])
        self.assertEqual(ready["access_kind"], "reset")
