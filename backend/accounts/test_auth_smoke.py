"""Sign-in smoke: a real allauth session token, not force_login and not a DRF token."""

from __future__ import annotations

from allauth.account.models import EmailAddress
from allauth.mfa.recovery_codes.internal.auth import RecoveryCodes
from allauth.mfa.totp.internal.auth import TOTP, format_hotp_value, hotp_value, yield_hotp_counters_from_time
from django.test import TestCase
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from accounts.models import User
from clubs.models import Club

_SECRET = "JBSWY3DPEHPK3PXP"


def _code(secret: str) -> str:
    counter = next(yield_hotp_counters_from_time())
    return format_hotp_value(hotp_value(secret, counter))


class AuthSmokeTests(TestCase):
    """Login, authenticator confirm, /api/auth/me/, one list per desk, and logout."""

    def _user(self, username: str, role: str, *, superuser: bool = False) -> User:
        user = User.objects.create_user(
            username=username,
            email=f"{username}@example.com",
            password="pass12345",
            role=role,
        )
        if superuser:
            user.is_superuser = True
            user.is_staff = True
            user.save(update_fields=["is_superuser", "is_staff"])
        EmailAddress.objects.create(user=user, email=user.email, verified=True, primary=True)
        TOTP.activate(user, _SECRET)
        RecoveryCodes.activate(user)
        return user

    def _desk(self, user: User, desk: str, club: Club | None) -> None:
        client = APIClient()
        started = client.post(
            "/api/auth/login/",
            {"username": user.username, "password": "pass12345"},
            format="json",
        )
        self.assertEqual(started.status_code, 200, started.data.get("detail") if isinstance(started.data, dict) else started.status_code)
        self.assertTrue(started.data.get("mfa_pending"))
        pending = started.data.get("token")
        self.assertTrue(pending)
        self.assertFalse(Token.objects.filter(key=pending).exists())
        confirmed = client.post(
            "/api/auth/mfa/confirm/",
            {"token": pending, "code": _code(_SECRET)},
            format="json",
        )
        self.assertEqual(
            confirmed.status_code,
            200,
            confirmed.data.get("detail") if isinstance(confirmed.data, dict) else confirmed.status_code,
        )
        token = confirmed.data.get("token")
        self.assertTrue(token)
        self.assertFalse(Token.objects.filter(key=token).exists())
        header = desk if club is None else f"{desk}:{club.id}"
        # The sign-in responses may set a session cookie. The app's later calls
        # send only the Token header, so the cookie must not authenticate these.
        client.cookies.clear()
        client.credentials(HTTP_AUTHORIZATION=f"Token {token}", HTTP_X_DESK=header)
        me = client.get("/api/auth/me/")
        self.assertEqual(me.status_code, 200, getattr(me, "data", {}).get("detail") if isinstance(getattr(me, "data", None), dict) else me.status_code)
        self.assertEqual(me.data.get("username"), user.username)
        listed = client.get(self.LISTS[desk])
        self.assertEqual(
            listed.status_code,
            200,
            listed.data.get("detail") if isinstance(listed.data, dict) else listed.status_code,
        )
        self.assertTrue(isinstance(listed.data, list) or "results" in listed.data)
        logged_out = client.post("/api/auth/logout/")
        self.assertEqual(logged_out.status_code, 204)
        again = client.get("/api/auth/me/")
        self.assertIn(again.status_code, (401, 403))

    LISTS = {
        "member": "/api/members/",
        "coach": "/api/members/",
        "club_admin": "/api/members/",
        "ltf_finance": "/api/license-prices/",
        "ltf_admin": "/api/clubs/",
        "ops": "/api/ops/users/",
    }

    def test_each_desk_signs_in_with_a_session_token(self):
        owner = self._user("smoke-owner", User.Roles.LTF_ADMIN)
        club = Club.objects.create(name="Smoke Club", created_by=owner)
        member = self._user("smoke-member", User.Roles.MEMBER)
        coach = self._user("smoke-coach", User.Roles.COACH)
        club.trainers.add(coach)
        admin = self._user("smoke-club", User.Roles.CLUB_ADMIN)
        club.admins.add(admin)
        finance = self._user("smoke-finance", User.Roles.LTF_FINANCE)
        ops = self._user("smoke-ops", User.Roles.MEMBER, superuser=True)
        self._desk(member, "member", None)
        self._desk(coach, "coach", club)
        self._desk(admin, "club_admin", club)
        self._desk(finance, "ltf_finance", None)
        self._desk(owner, "ltf_admin", None)
        self._desk(ops, "ops", None)
