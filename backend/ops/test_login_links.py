import csv
import io
from datetime import timedelta
from unittest.mock import patch
from urllib.parse import parse_qs, urlparse

from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from accounts.models import AccountSetupInvite, DeskGrant, StaffMfaGrace, User
from accounts.password_reset import ResetTokenGenerator
from accounts.setup_invites import invite_for_token, invite_is_open

from .models import OpsAuditLog


@override_settings(FRONTEND_BASE_URL="https://hub.example.test")
class BulkLoginLinkTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.superuser = User.objects.create_superuser(
            username="ops-links",
            email="ops-links@example.test",
            password="pass12345",
        )
        self.member = User.objects.create_user(
            username="ada-links",
            email="",
            password="pass12345",
            role=User.Roles.MEMBER,
            first_name="Ada",
            last_name="Ng",
        )
        self.inactive = User.objects.create_user(
            username="idle-links",
            email="idle-links@example.test",
            password="pass12345",
            role=User.Roles.MEMBER,
            first_name="Idle",
            last_name="Gone",
            is_active=False,
        )
        self.ltf_admin = User.objects.create_user(
            username="ltf-links",
            email="ltf-links@example.test",
            password="pass12345",
            role=User.Roles.LTF_ADMIN,
            first_name="Lea",
            last_name="Admin",
        )
        self.finance = User.objects.create_user(
            username="finance-links",
            email="finance-links@example.test",
            password="pass12345",
            role=User.Roles.LTF_FINANCE,
        )
        self.club_admin = User.objects.create_user(
            username="club-links",
            email="club-links@example.test",
            password="pass12345",
            role=User.Roles.CLUB_ADMIN,
        )
        token = Token.objects.create(user=self.superuser)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}", HTTP_X_DESK="ops")

    def _post(self, link_type, user_ids, locale="en"):
        return self.client.post(
            "/api/ops/users/login-links/",
            {"link_type": link_type, "user_ids": user_ids, "locale": locale},
            format="json",
        )

    def _rows(self, text):
        return list(csv.DictReader(io.StringIO(text)))

    def test_other_desks_are_refused_and_a_read_only_ops_grant_is_refused(self):
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {Token.objects.create(user=self.ltf_admin).key}")
        self.assertEqual(self._post("first_login", [self.member.id]).status_code, 403)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {Token.objects.create(user=self.finance).key}", HTTP_X_DESK="ops")
        self.assertEqual(self._post("first_login", [self.member.id]).status_code, 403)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {Token.objects.create(user=self.club_admin).key}", HTTP_X_DESK="ops")
        self.assertEqual(self._post("reset_password", [self.member.id]).status_code, 403)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {Token.objects.get(user=self.superuser).key}")
        self.assertEqual(self._post("first_login", [self.member.id]).status_code, 403)

        self.client.credentials(
            HTTP_AUTHORIZATION=f"Token {Token.objects.get(user=self.superuser).key}",
            HTTP_X_DESK="ops",
        )
        DeskGrant.objects.create(
            user=self.superuser,
            desk="ops",
            level=DeskGrant.Level.READ_ONLY,
            source=DeskGrant.Source.LEGACY,
            valid_from=timezone.localdate(),
        )
        refused = self._post("first_login", [self.member.id])
        self.assertEqual(refused.status_code, 403)
        self.assertFalse(AccountSetupInvite.objects.filter(user=self.member).exists())

    def test_first_login_file_skips_inactive_and_does_not_email_or_touch_mfa(self):
        grace_before = StaffMfaGrace.objects.count()
        with patch("accounts.email_utils.send_password_reset_email") as send_reset, patch(
            "accounts.email_utils.send_resend_email"
        ) as send_any:
            response = self._post("first_login", [self.member.id, self.inactive.id, self.member.id], locale="lb")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Cache-Control"], "no-store")
        send_reset.assert_not_called()
        send_any.assert_not_called()
        self.assertEqual(response.data["created_count"], 1)
        self.assertEqual(response.data["skipped_count"], 1)
        self.assertEqual(StaffMfaGrace.objects.count(), grace_before)
        rows = self._rows(response.data["csv"])
        self.assertEqual(list(rows[0].keys()), ["username", "name", "link_type", "link", "expiry", "skipped"])
        self.assertEqual(rows[0]["username"], "ada-links")
        self.assertEqual(rows[0]["name"], "NG Ada")
        self.assertEqual(rows[0]["link_type"], "first_login")
        self.assertEqual(rows[0]["skipped"], "")
        self.assertIn("/lb/account-setup?token=", rows[0]["link"])
        self.assertNotIn("pass12345", response.data["csv"])
        self.assertEqual(rows[1]["username"], "idle-links")
        self.assertEqual(rows[1]["link"], "")
        self.assertEqual(rows[1]["expiry"], "")
        self.assertEqual(rows[1]["skipped"], "inactive")
        self.assertTrue(response.data["pdf_base64"])
        invite = AccountSetupInvite.objects.get(user=self.member, revoked_at__isnull=True)
        self.assertGreater(invite.expires_at, timezone.now() + timedelta(days=6))
        self.assertLess(invite.expires_at, timezone.now() + timedelta(days=8))
        audit = OpsAuditLog.objects.get(action="users.bulk_first_login_links")
        self.assertEqual(audit.message, "Created 1 first-login links. Skipped 1 inactive.")
        self.assertEqual(audit.metadata["created_user_ids"], [self.member.id])
        self.assertEqual(audit.metadata["skipped"], [{"id": self.inactive.id, "reason": "inactive"}])
        self.assertNotIn("http", str(audit.metadata).lower())
        self.assertNotIn("token", str(audit.metadata).lower())
        self.assertEqual(OpsAuditLog.objects.filter(action="users.bulk_first_login_links").count(), 1)

    def test_first_login_link_is_single_use_and_a_new_one_revokes_the_older(self):
        from accounts.setup_invites import issue_setup_invite, setup_link

        old_invite, old_raw = issue_setup_invite(self.member, self.superuser)
        response = self._post("first_login", [self.member.id])
        self.assertEqual(response.status_code, 200)
        old_invite.refresh_from_db()
        self.assertIsNotNone(old_invite.revoked_at)
        self.assertFalse(invite_is_open(invite_for_token(old_raw)))
        link = self._rows(response.data["csv"])[0]["link"]
        raw = parse_qs(urlparse(link).query)["token"][0]
        opened = self.client.get(f"/api/auth/account-setup/?token={raw}")
        self.assertEqual(opened.status_code, 200)
        saved = self.client.post(
            "/api/auth/account-setup/",
            {
                "token": raw,
                "email": "ada-links@example.test",
                "password": "S3cure-link-pass",
                "password_confirm": "S3cure-link-pass",
            },
            format="json",
        )
        self.assertEqual(saved.status_code, 200, saved.data)
        again = self.client.post(
            "/api/auth/account-setup/",
            {
                "token": raw,
                "email": "ada-links-2@example.test",
                "password": "S3cure-link-pass",
                "password_confirm": "S3cure-link-pass",
            },
            format="json",
        )
        self.assertEqual(again.status_code, 400)
        self.assertFalse(invite_is_open(invite_for_token(raw)))
        self.assertTrue(setup_link(raw, "en"))

    def test_reset_link_lasts_three_days_and_a_new_link_kills_the_older_one(self):
        with patch("accounts.email_utils.send_password_reset_email") as send_reset:
            first = self._post("reset_password", [self.member.id])
            second = self._post("reset_password", [self.member.id])
        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        send_reset.assert_not_called()
        first_row = self._rows(first.data["csv"])[0]
        second_row = self._rows(second.data["csv"])[0]
        self.assertEqual(first_row["link_type"], "reset_password")
        self.assertNotEqual(first_row["link"], second_row["link"])
        expiry = timezone.datetime.fromisoformat(second_row["expiry"])
        if timezone.is_naive(expiry):
            expiry = timezone.make_aware(expiry, timezone.get_current_timezone())
        delta = expiry - timezone.now()
        self.assertGreater(delta, timedelta(days=2, hours=23))
        self.assertLess(delta, timedelta(days=3, hours=1))
        self.member.refresh_from_db()
        first_token = parse_qs(urlparse(first_row["link"]).query)["token"][0]
        second_token = parse_qs(urlparse(second_row["link"]).query)["token"][0]
        uid = parse_qs(urlparse(second_row["link"]).query)["uid"][0]
        self.assertFalse(ResetTokenGenerator().check_token(self.member, first_token))
        self.assertTrue(ResetTokenGenerator().check_token(self.member, second_token))
        changed = self.client.post(
            "/api/auth/password-reset/confirm/",
            {"uid": uid, "token": second_token, "password": "S3cure-link-pass"},
            format="json",
        )
        self.assertEqual(changed.status_code, 200, getattr(changed, "data", None))
        self.member.refresh_from_db()
        self.assertFalse(ResetTokenGenerator().check_token(self.member, second_token))
        audit = OpsAuditLog.objects.filter(action="users.bulk_password_reset_links")
        self.assertEqual(audit.count(), 2)
        self.assertNotIn("http", str(audit.latest("id").metadata).lower())

    def test_an_all_inactive_selection_creates_no_live_link(self):
        response = self._post("reset_password", [self.inactive.id])
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["created_count"], 0)
        self.assertNotIn("http", response.data["csv"])
        self.assertEqual(self._rows(response.data["csv"])[0]["skipped"], "inactive")
