from datetime import timedelta

from allauth.account.models import EmailAddress
from allauth.mfa.models import Authenticator
from allauth.mfa.recovery_codes.internal.auth import RecoveryCodes
from allauth.mfa.totp.internal.auth import TOTP, format_hotp_value, hotp_value, yield_hotp_counters_from_time
from django.contrib.auth import BACKEND_SESSION_KEY, HASH_SESSION_KEY, SESSION_KEY
from django.contrib.sessions.backends.db import SessionStore
from django.test import TestCase
from django.utils import timezone
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from clubs.models import Club
from ops.models import AuthEvent, OpsAuditLog

from .mfa import legacy_tokens_open
from .models import EmailMfa, MfaPolicy, StaffMfaGrace, User


def _code(secret: str) -> str:
    counter = next(yield_hotp_counters_from_time())
    return format_hotp_value(hotp_value(secret, counter))


class MfaLoginTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.member = User.objects.create_user(
            username="mfa-member",
            email="member-mfa@example.com",
            password="pass12345",
            role=User.Roles.MEMBER,
        )
        EmailAddress.objects.create(user=self.member, email=self.member.email, verified=True, primary=True)
        self.admin = User.objects.create_user(
            username="mfa-admin",
            email="admin-mfa@example.com",
            password="pass12345",
            role=User.Roles.CLUB_ADMIN,
        )
        EmailAddress.objects.create(user=self.admin, email=self.admin.email, verified=True, primary=True)
        self.club = Club.objects.create(name="MFA Club", created_by=self.admin)
        self.club.admins.add(self.admin)

    def test_password_login_issues_a_session_token(self):
        response = self.client.post(
            "/api/auth/login/",
            {"username": "mfa-member", "password": "pass12345"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn("token", response.data)
        self.assertNotIn("mfa_pending", response.data)
        self.assertFalse(Token.objects.filter(key=response.data["token"]).exists())
        self.assertTrue(
            AuthEvent.objects.filter(
                event_type=AuthEvent.EventType.LOGIN_SUCCESS,
                username_attempted="mfa-member",
            ).exists()
        )
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {response.data['token']}")
        me = self.client.get("/api/auth/me/")
        self.assertEqual(me.status_code, 200)
        self.assertFalse(me.data["mfa"]["required"])

    def test_legacy_token_works_until_sunset_and_then_stops(self):
        token = Token.objects.create(user=self.member)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")
        self.assertEqual(self.client.get("/api/auth/me/").status_code, 200)
        policy = MfaPolicy.objects.get(pk=1)
        policy.token_sunset_on = timezone.localdate()
        policy.save(update_fields=["token_sunset_on"])
        self.assertFalse(legacy_tokens_open())
        denied = self.client.get("/api/auth/me/")
        self.assertIn(denied.status_code, {401, 403})
        self.assertEqual(denied.data["detail"], "token_sunset")

    def test_staff_desk_stays_open_during_grace_and_closes_after(self):
        token = Token.objects.create(user=self.admin)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")
        self.client.get("/api/auth/me/")
        open_now = self.client.get("/api/clubs/")
        self.assertNotEqual(open_now.status_code, 403)
        StaffMfaGrace.objects.update_or_create(
            user=self.admin,
            defaults={"grace_until": timezone.localdate(), "no_grace": True, "extended": False},
        )
        closed = self.client.get("/api/clubs/")
        self.assertEqual(closed.status_code, 403)
        self.assertEqual(closed.data["detail"], "mfa_enrol_required")
        self.assertEqual(self.client.get("/api/auth/me/").status_code, 200)

    def test_new_staff_after_ship_date_have_no_grace(self):
        policy = MfaPolicy.objects.get(pk=1)
        policy.shipped_on = timezone.localdate() - timedelta(days=2)
        policy.save(update_fields=["shipped_on"])
        created = User.objects.create_user(
            username="mfa-new-admin",
            email="new-admin-mfa@example.com",
            password="pass12345",
            role=User.Roles.LTF_ADMIN,
        )
        row = StaffMfaGrace.objects.get(user=created)
        self.assertTrue(row.no_grace)
        token = Token.objects.create(user=created)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")
        denied = self.client.get("/api/clubs/")
        self.assertEqual(denied.status_code, 403)
        self.assertEqual(denied.data["detail"], "mfa_enrol_required")

    def test_totp_then_recovery_code_opens_the_desk(self):
        secret = "JBSWY3DPEHPK3PXP"
        TOTP.activate(self.admin, secret)
        RecoveryCodes.activate(self.admin)
        started = self.client.post(
            "/api/auth/login/",
            {"username": "mfa-admin", "password": "pass12345"},
            format="json",
        )
        self.assertEqual(started.status_code, 200)
        self.assertTrue(started.data.get("mfa_pending"))
        self.assertIn("totp", started.data["mfa_methods"])
        confirmed = self.client.post(
            "/api/auth/mfa/confirm/",
            {"token": started.data["token"], "code": _code(secret)},
            format="json",
        )
        self.assertEqual(confirmed.status_code, 200, confirmed.data)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {confirmed.data['token']}")
        clubs = self.client.get("/api/clubs/")
        self.assertNotEqual(clubs.status_code, 403)
        codes = Authenticator.objects.get(user=self.admin, type=Authenticator.Type.RECOVERY_CODES)
        recovery = codes.wrap().get_unused_codes()[0]
        self.client.credentials()
        again = self.client.post(
            "/api/auth/login/",
            {"username": "mfa-admin", "password": "pass12345"},
            format="json",
        )
        used = self.client.post(
            "/api/auth/mfa/confirm/",
            {"token": again.data["token"], "code": recovery},
            format="json",
        )
        self.assertEqual(used.status_code, 200, used.data)
        self.assertTrue(
            OpsAuditLog.objects.filter(action="mfa.recovery_used", target_id=str(self.admin.id)).exists()
        )

    def test_email_code_is_refused_for_a_staff_desk(self):
        EmailMfa.objects.create(user=self.admin, enabled=True)
        EmailMfa.objects.create(user=self.member, enabled=True)
        staff = self.client.post(
            "/api/auth/login/",
            {"username": "mfa-admin", "password": "pass12345"},
            format="json",
        )
        self.assertNotIn("email", staff.data.get("mfa_methods") or [])
        self.assertFalse(staff.data.get("mfa_pending"))
        TOTP.activate(self.admin, "JBSWY3DPEHPK3PXP")
        RecoveryCodes.activate(self.admin)
        session = SessionStore()
        session[SESSION_KEY] = str(self.admin.pk)
        session[BACKEND_SESSION_KEY] = "django.contrib.auth.backends.ModelBackend"
        session[HASH_SESSION_KEY] = self.admin.get_session_auth_hash()
        session["account_authentication_methods"] = [
            {"method": "email", "at": timezone.now().timestamp(), "type": "email"}
        ]
        session.save()
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {session.session_key}")
        denied = self.client.get("/api/clubs/")
        self.assertEqual(denied.status_code, 403)
        self.assertEqual(denied.data["detail"], "mfa_required")

    def test_superuser_reset_keeps_passkeys_and_extension_is_once(self):
        root = User.objects.create_superuser(username="mfa-root", email="root-mfa@example.com", password="pass12345")
        EmailAddress.objects.create(user=root, email=root.email, verified=True, primary=True)
        TOTP.activate(self.admin, "JBSWY3DPEHPK3PXP")
        RecoveryCodes.activate(self.admin)
        Authenticator.objects.create(
            user=self.admin,
            type=Authenticator.Type.WEBAUTHN,
            data={"name": "Laptop", "credential": {}},
        )
        token = Token.objects.create(user=root)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")
        reset = self.client.post(
            f"/api/ops/users/{self.admin.id}/",
            {"action": "reset_authenticator"},
            format="json",
        )
        self.assertEqual(reset.status_code, 200, reset.data)
        self.assertFalse(Authenticator.objects.filter(user=self.admin, type=Authenticator.Type.TOTP).exists())
        self.assertTrue(Authenticator.objects.filter(user=self.admin, type=Authenticator.Type.WEBAUTHN).exists())
        self.assertTrue(OpsAuditLog.objects.filter(action="mfa.reset", target_id=str(self.admin.id)).exists())
        removed = self.client.post(
            f"/api/ops/users/{self.admin.id}/",
            {"action": "remove_passkeys"},
            format="json",
        )
        self.assertEqual(removed.status_code, 200)
        self.assertFalse(Authenticator.objects.filter(user=self.admin, type=Authenticator.Type.WEBAUTHN).exists())
        first = self.client.post(
            f"/api/ops/users/{self.admin.id}/",
            {"action": "extend_mfa_grace"},
            format="json",
        )
        self.assertEqual(first.status_code, 200, first.data)
        second = self.client.post(
            f"/api/ops/users/{self.admin.id}/",
            {"action": "extend_mfa_grace"},
            format="json",
        )
        self.assertEqual(second.status_code, 400)
        self.assertTrue(OpsAuditLog.objects.filter(action="mfa.grace_extended").exists())

    def test_passkey_login_options_are_offered(self):
        options = self.client.get("/api/auth/mfa/webauthn/login/")
        self.assertEqual(options.status_code, 200, options.data)
        self.assertIn("token", options.data)
        self.assertIn("options", options.data)
