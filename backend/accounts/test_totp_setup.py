import time
from datetime import timedelta
from importlib import import_module
from io import StringIO

from allauth.account import app_settings as account_settings
from allauth.account.models import EmailAddress
from allauth.mfa import app_settings as mfa_settings
from allauth.mfa.totp.internal.auth import format_hotp_value, hotp_value
from django.conf import settings
from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from .models import DeskGrant, User


def _code(secret: str, offset: int = 0) -> str:
    counter = int(time.time()) // mfa_settings.TOTP_PERIOD
    return format_hotp_value(hotp_value(secret, counter + offset))


class TotpSetupTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="totp-setup",
            email="totp-setup@example.com",
            password="pass12345",
            role=User.Roles.LTF_ADMIN,
        )
        EmailAddress.objects.create(user=self.user, email=self.user.email, verified=True, primary=True)
        login = self.client.post(
            "/api/auth/login/",
            {"username": "totp-setup", "password": "pass12345"},
            format="json",
        )
        self.assertEqual(login.status_code, 200, login.data)
        self.token = login.data["token"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.token}")

    def _age_sign_in(self, seconds: float) -> None:
        store = import_module(settings.SESSION_ENGINE).SessionStore(session_key=self.token)
        methods = list(store.get("account_authentication_methods") or [])
        self.assertTrue(methods, "the login timestamp is missing from the token session")
        self.assertTrue(any(row.get("method") == "password" for row in methods))
        self.assertFalse(any(row.get("reauthenticated") for row in methods))
        for row in methods:
            row["at"] = time.time() - seconds
        store["account_authentication_methods"] = methods
        store.save()

    def test_one_setup_accepts_its_own_code(self):
        started = self.client.get("/api/auth/mfa/totp/")
        self.assertEqual(started.status_code, 200, started.data)
        activated = self.client.post(
            "/api/auth/mfa/totp/",
            {"code": _code(started.data["secret"])},
            format="json",
        )
        self.assertEqual(activated.status_code, 200, activated.data)
        self.assertIsNone(activated.data["mfa"]["desk_block"])
        opened = self.client.get("/api/clubs/", HTTP_X_DESK="ltf_admin")
        self.assertNotEqual(opened.status_code, 403, getattr(opened, "data", opened.content))

    def test_view_only_desk_does_not_report_itself_as_the_setup_result(self):
        today = timezone.localdate()
        DeskGrant.objects.filter(user=self.user, source=DeskGrant.Source.LEGACY).update(valid_until=today)
        DeskGrant.objects.create(
            user=self.user,
            desk=DeskGrant.Desk.LTF_ADMIN,
            level=DeskGrant.Level.READ_ONLY,
            source=DeskGrant.Source.MANUAL,
            valid_from=today - timedelta(days=1),
            valid_until=today + timedelta(days=10),
            reason="Look",
        )
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.token}", HTTP_X_DESK="ltf_admin")
        started = self.client.get("/api/auth/mfa/totp/")
        self.assertEqual(started.status_code, 200, started.data)
        activated = self.client.post(
            "/api/auth/mfa/totp/",
            {"code": _code(started.data["secret"])},
            format="json",
        )
        self.assertEqual(activated.status_code, 200, activated.data)
        self.assertNotEqual(activated.data.get("detail"), "desk_read_only")
        self.assertTrue(activated.data["recovery_codes"])

    def test_second_setup_keeps_the_first_secret_and_accepts_a_spaced_code(self):
        first = self.client.get("/api/auth/mfa/totp/")
        second = self.client.get("/api/auth/mfa/totp/")
        self.assertEqual(first.status_code, 200, first.data)
        self.assertEqual(second.status_code, 200, second.data)
        self.assertEqual(second.data["secret"], first.data["secret"])
        self.assertIn("algorithm=SHA1", first.data["otpauth_url"])
        self.assertIn("digits=6", first.data["otpauth_url"])
        self.assertIn("period=30", first.data["otpauth_url"])
        code = _code(first.data["secret"])
        spaced = f"{code[:3]} {code[3:]}"
        activated = self.client.post("/api/auth/mfa/totp/", {"code": spaced}, format="json")
        self.assertEqual(activated.status_code, 200, activated.data)
        self.assertTrue(activated.data["recovery_codes"])

    def test_fresh_asks_for_a_new_secret(self):
        first = self.client.get("/api/auth/mfa/totp/")
        fresh = self.client.get("/api/auth/mfa/totp/?fresh=1")
        self.assertEqual(first.status_code, 200, first.data)
        self.assertEqual(fresh.status_code, 200, fresh.data)
        self.assertNotEqual(fresh.data["secret"], first.data["secret"])

    def test_wrong_code_is_named_as_a_wrong_code(self):
        started = self.client.get("/api/auth/mfa/totp/")
        self.assertEqual(started.status_code, 200, started.data)
        current = _code(started.data["secret"])
        wrong = "111111" if current != "111111" else "000000"
        activated = self.client.post("/api/auth/mfa/totp/", {"code": f"{wrong[:3]} {wrong[3:]}"}, format="json")
        self.assertEqual(activated.status_code, 400, getattr(activated, "data", activated.content))
        self.assertEqual(activated.data["detail"], "incorrect_code")

    def test_login_inside_the_timeout_accepts_the_first_secret(self):
        self._age_sign_in(30)
        first = self.client.get("/api/auth/mfa/totp/")
        second = self.client.get("/api/auth/mfa/totp/")
        self.assertEqual(first.status_code, 200, first.data)
        self.assertEqual(second.data["secret"], first.data["secret"])
        code = _code(first.data["secret"])
        activated = self.client.post(
            "/api/auth/mfa/totp/",
            {"code": f"{code[:3]} {code[3:]}"},
            format="json",
        )
        self.assertEqual(activated.status_code, 200, activated.data)
        self.assertTrue(activated.data["recovery_codes"])

    def test_past_the_timeout_reauth_keeps_the_secret(self):
        started = self.client.get("/api/auth/mfa/totp/")
        self.assertEqual(started.status_code, 200, started.data)
        secret = started.data["secret"]
        self._age_sign_in(account_settings.REAUTHENTICATION_TIMEOUT + 5)
        blocked = self.client.post("/api/auth/mfa/totp/", {"code": _code(secret)}, format="json")
        self.assertEqual(blocked.status_code, 409, getattr(blocked, "data", blocked.content))
        self.assertEqual(blocked.data["detail"], "mfa_sign_in_again")
        reauth = self.client.post(
            "/_allauth/app/v1/auth/reauthenticate",
            {"password": "pass12345"},
            format="json",
            HTTP_X_SESSION_TOKEN=self.token,
        )
        self.assertEqual(reauth.status_code, 200, reauth.content)
        resumed = self.client.get("/api/auth/mfa/totp/")
        self.assertEqual(resumed.status_code, 200, resumed.data)
        self.assertEqual(resumed.data["secret"], secret)
        activated = self.client.post("/api/auth/mfa/totp/", {"code": _code(secret)}, format="json")
        self.assertEqual(activated.status_code, 200, activated.data)

    def test_one_step_of_clock_drift_is_accepted(self):
        self.assertEqual(mfa_settings.TOTP_TOLERANCE, 1)
        started = self.client.get("/api/auth/mfa/totp/")
        activated = self.client.post(
            "/api/auth/mfa/totp/",
            {"code": _code(started.data["secret"], offset=-1)},
            format="json",
        )
        self.assertEqual(activated.status_code, 200, activated.data)

    def test_further_drift_is_refused_and_the_log_names_the_offset(self):
        started = self.client.get("/api/auth/mfa/totp/")
        secret = started.data["secret"]
        drifted = _code(secret, offset=2)
        with self.assertLogs("accounts.mfa", level="WARNING") as logs:
            refused = self.client.post("/api/auth/mfa/totp/", {"code": drifted}, format="json")
        self.assertEqual(refused.status_code, 400, refused.data)
        self.assertEqual(refused.data["detail"], "incorrect_code")
        blob = "\n".join(logs.output)
        self.assertIn("drift_offset_steps=2", blob)
        self.assertIn("drift_seconds=60", blob)
        self.assertNotIn(drifted, blob)
        self.assertNotIn(secret, blob)

    def test_server_time_command_prints_utc(self):
        out = StringIO()
        call_command("server_time", stdout=out)
        self.assertRegex(out.getvalue().strip(), r"^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC$")
