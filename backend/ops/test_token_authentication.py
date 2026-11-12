from types import SimpleNamespace
from unittest.mock import patch

from allauth.account.models import EmailAddress
from allauth.headless.internal.sessionkit import authenticate_by_x_session_token
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from accounts.allauth_session import user_and_session
from accounts.models import User


class SessionTokenShapeTests(TestCase):
    def test_accepts_a_tuple_and_a_result_object(self):
        user = object()
        session = object()
        self.assertEqual(user_and_session((user, session)), (user, session))
        self.assertEqual(user_and_session(SimpleNamespace(user=user, session=session)), (user, session))
        self.assertEqual(user_and_session(None), (None, None))
        self.assertEqual(user_and_session(("only-one",)), (None, None))


class SessionTokenHeaderTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="session-token-user",
            email="session-token@example.com",
            password="pass12345",
            role=User.Roles.MEMBER,
        )
        EmailAddress.objects.create(
            user=self.user,
            email=self.user.email,
            verified=True,
            primary=True,
        )

    def _session_token(self):
        started = self.client.post(
            "/api/auth/login/",
            {"username": "session-token-user", "password": "pass12345"},
            format="json",
        )
        self.assertEqual(started.status_code, status.HTTP_200_OK, started.data)
        token = started.data["token"]
        self.client.credentials()
        return token

    def test_authorization_token_reads_me_and_logs_out(self):
        token = self._session_token()
        self.client.credentials(
            HTTP_AUTHORIZATION=f"Token {token}",
            HTTP_X_DESK="member",
        )
        me = self.client.get("/api/auth/me/", HTTP_HOST="api.ltkdf.org")
        self.assertEqual(me.status_code, status.HTTP_200_OK, getattr(me, "data", me.content[:200]))
        self.assertEqual(me.data["username"], "session-token-user")
        logged_out = self.client.post("/api/auth/logout/")
        self.assertEqual(logged_out.status_code, status.HTTP_204_NO_CONTENT)
        again = self.client.get("/api/auth/me/")
        self.assertIn(again.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))

    def test_allauth_result_object_is_accepted(self):
        token = self._session_token()

        def as_object(key):
            found = authenticate_by_x_session_token(key)
            if found is None:
                return None
            if isinstance(found, tuple):
                return SimpleNamespace(user=found[0], session=found[1])
            return found

        self.client.credentials(HTTP_AUTHORIZATION=f"Token {token}")
        with patch(
            "allauth.headless.internal.sessionkit.authenticate_by_x_session_token",
            side_effect=as_object,
        ):
            me = self.client.get("/api/auth/me/")
        self.assertEqual(me.status_code, status.HTTP_200_OK, getattr(me, "data", me.content[:200]))
        self.assertEqual(me.data["username"], "session-token-user")
