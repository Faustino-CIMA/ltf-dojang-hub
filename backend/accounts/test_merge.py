import time

from allauth.account.models import EmailAddress
from allauth.mfa.models import Authenticator
from allauth.mfa.recovery_codes.internal.auth import RecoveryCodes
from allauth.mfa.totp.internal.auth import TOTP
from django.contrib.auth import BACKEND_SESSION_KEY, HASH_SESSION_KEY, SESSION_KEY
from django.contrib.sessions.backends.db import SessionStore
from django.test import TestCase
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from clubs.models import Club
from licenses.models import FinanceAuditLog
from members.models import Member
from ops.models import OpsAuditLog

from .models import DeskGrant, User


def _mfa_session(user) -> str:
    secret = "JBSWY3DPEHPK3PXP"
    if not Authenticator.objects.filter(user=user, type=Authenticator.Type.TOTP).exists():
        TOTP.activate(user, secret)
        RecoveryCodes.activate(user)
    session = SessionStore()
    session[SESSION_KEY] = str(user.pk)
    session[BACKEND_SESSION_KEY] = "django.contrib.auth.backends.ModelBackend"
    session[HASH_SESSION_KEY] = user.get_session_auth_hash()
    session["account_authentication_methods"] = [{"method": "mfa", "type": "totp", "at": time.time()}]
    session.save()
    return session.session_key


class AccountMergeTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.root = User.objects.create_superuser(
            username="merge-root",
            email="merge-root@example.com",
            password="pass12345",
            first_name="Root",
            last_name="KEEPER",
        )
        self.kept = User.objects.create_user(
            username="merge-kept",
            email="kept@example.com",
            password="pass12345",
            role=User.Roles.MEMBER,
            first_name="Lea",
            last_name="WEBER",
        )
        self.extra = User.objects.create_user(
            username="merge-extra",
            email="extra@example.com",
            password="pass12345",
            role=User.Roles.CLUB_ADMIN,
            first_name="Lea",
            last_name="WEBER",
        )
        EmailAddress.objects.create(user=self.extra, email=self.extra.email, verified=True, primary=True)
        self.club = Club.objects.create(name="Merge Club", created_by=self.root)
        self.club.admins.add(self.extra)
        DeskGrant.objects.create(
            user=self.extra,
            desk=DeskGrant.Desk.CLUB_ADMIN,
            level=DeskGrant.Level.FULL,
            club=self.club,
            source=DeskGrant.Source.MANUAL,
            valid_from="2026-01-01",
            reason="Second login",
            granted_by=self.root,
        )
        FinanceAuditLog.objects.create(
            action="invoice.created",
            message="Invoice created.",
            actor=self.extra,
            club=self.club,
        )
        TOTP.activate(self.extra, "JBSWY3DPEHPK3PXP")

    def _auth(self, user):
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {_mfa_session(user)}", HTTP_X_DESK="ops")

    def test_merge_requires_the_superuser_second_factor(self):
        token = Token.objects.create(user=self.root)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}", HTTP_X_DESK="ops")
        refused = self.client.post(
            "/api/ops/merges/",
            {"survivor_id": self.kept.id, "folded_ids": [self.extra.id]},
            format="json",
        )
        self.assertEqual(refused.status_code, 403)
        self.assertEqual(refused.data["detail"], "mfa_required")

    def test_merge_moves_grants_clubs_mail_and_keeps_the_folded_login(self):
        self._auth(self.root)
        preview = self.client.get(f"/api/ops/merges/?survivor={self.kept.id}&folded={self.extra.id}")
        self.assertEqual(preview.status_code, 200, preview.data)
        self.assertFalse(preview.data["member_conflict"])
        self.assertIn("Merge Club", preview.data["folded"][0]["clubs_administered"])
        confirmed = self.client.post(
            "/api/ops/merges/",
            {"survivor_id": self.kept.id, "folded_ids": [self.extra.id]},
            format="json",
        )
        self.assertEqual(confirmed.status_code, 200, confirmed.data)
        self.extra.refresh_from_db()
        self.kept.refresh_from_db()
        self.assertFalse(self.extra.is_active)
        self.assertTrue(User.objects.filter(pk=self.extra.id).exists())
        self.assertEqual(self.kept.email, "kept@example.com")
        self.assertTrue(EmailAddress.objects.filter(user=self.kept, email="extra@example.com", primary=False).exists())
        self.assertTrue(self.club.admins.filter(id=self.kept.id).exists())
        self.assertFalse(self.club.admins.filter(id=self.extra.id).exists())
        self.assertTrue(
            DeskGrant.objects.filter(user=self.kept, desk=DeskGrant.Desk.CLUB_ADMIN, club=self.club).exists()
        )
        self.assertFalse(Token.objects.filter(user=self.extra).exists())
        self.assertTrue(Authenticator.objects.filter(user=self.kept, type=Authenticator.Type.TOTP).exists())
        self.assertEqual(FinanceAuditLog.objects.get(action="invoice.created").actor_id, self.kept.id)
        self.assertTrue(
            OpsAuditLog.objects.filter(action="account.merged", target_id=str(self.kept.id)).exists()
        )
        login = self.client.post(
            "/api/auth/login/",
            {"username": "merge-extra", "password": "pass12345"},
            format="json",
        )
        self.assertEqual(login.status_code, 400)

    def test_two_member_profiles_must_be_chosen(self):
        Member.objects.create(user=self.kept, club=self.club, first_name="Lea", last_name="WEBER")
        other = Member.objects.create(user=self.extra, club=self.club, first_name="Lea", last_name="WEBER")
        self._auth(self.root)
        blocked = self.client.post(
            "/api/ops/merges/",
            {"survivor_id": self.kept.id, "folded_ids": [self.extra.id]},
            format="json",
        )
        self.assertEqual(blocked.status_code, 409)
        self.assertEqual(blocked.data["detail"], "member_conflict")
        chosen = self.client.post(
            "/api/ops/merges/",
            {"survivor_id": self.kept.id, "folded_ids": [self.extra.id], "keep_member_id": other.id},
            format="json",
        )
        self.assertEqual(chosen.status_code, 200, chosen.data)
        other.refresh_from_db()
        self.assertEqual(other.user_id, self.kept.id)
        self.assertEqual(Member.all_objects.filter(user=self.kept).count(), 1)
