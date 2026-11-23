"""The security panel lists real sign-ins, not leftover API tokens."""

from datetime import timedelta

from allauth.account.models import EmailAddress
from django.contrib.sessions.models import Session
from django.test import TestCase
from django.utils import timezone
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from accounts.models import User

from .models import AuthTokenMeta


class SignedInListTests(TestCase):
    def setUp(self):
        self.ops = APIClient()
        self.root = User.objects.create_superuser(
            username="signed-in-root",
            email="signed-in-root@example.com",
            password="pass12345",
        )
        self.member = User.objects.create_user(
            username="signed-in-ada",
            email="signed-in-ada@example.com",
            password="pass12345",
            role=User.Roles.MEMBER,
        )
        EmailAddress.objects.create(
            user=self.member, email=self.member.email, verified=True, primary=True
        )
        self.token_only = User.objects.create_user(
            username="signed-in-token",
            email="signed-in-token@example.com",
            password="pass12345",
            role=User.Roles.MEMBER,
        )
        leftover = Token.objects.create(user=self.token_only)
        AuthTokenMeta.objects.create(
            token=leftover,
            last_used_at=timezone.now(),
            last_ip="203.0.113.10",
            user_agent="token-only",
        )
        root_token = Token.objects.create(user=self.root)
        self.ops.credentials(HTTP_AUTHORIZATION=f"Token {root_token.key}")

    def _sign_in(self) -> str:
        client = APIClient()
        response = client.post(
            "/api/auth/login/",
            {"username": "signed-in-ada", "password": "pass12345"},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        token = response.data["token"]
        self.assertFalse(Token.objects.filter(key=token).exists())
        self.assertTrue(Session.objects.filter(session_key=token, expire_date__gte=timezone.now()).exists())
        return token

    def test_two_devices_are_listed_without_the_session_key(self):
        phone = self._sign_in()
        laptop = self._sign_in()
        self.assertNotEqual(phone, laptop)

        listed = self.ops.get("/api/ops/sessions/?minutes=60")
        self.assertEqual(listed.status_code, 200)
        names = [row["username"] for row in listed.data["results"]]
        self.assertEqual(names, ["signed-in-ada", "signed-in-ada"])
        self.assertEqual(len({row["id"] for row in listed.data["results"]}), 2)
        self.assertNotIn("signed-in-token", names)
        self.assertNotIn("signed-in-root", names)
        body = listed.content.decode()
        self.assertNotIn(phone, body)
        self.assertNotIn(laptop, body)
        for row in listed.data["results"]:
            self.assertEqual(row["token_key_suffix"], "")
            self.assertNotIn("session_key", row)

        overview = self.ops.get("/api/ops/overview/")
        self.assertEqual(overview.status_code, 200)
        self.assertEqual(overview.data["online_sessions"], 2)

        queried = self.ops.post("/api/ops/queries/active_sessions/run/", {"params": {}}, format="json")
        self.assertEqual(queried.status_code, 200)
        self.assertEqual([row["username"] for row in queried.data["rows"]], ["signed-in-ada", "signed-in-ada"])
        self.assertNotIn(phone, queried.content.decode())
        self.assertNotIn(laptop, queried.content.decode())

    def test_an_expired_sign_in_is_left_off_the_list(self):
        phone = self._sign_in()
        laptop = self._sign_in()
        Session.objects.filter(session_key=phone).update(expire_date=timezone.now() - timedelta(minutes=1))

        listed = self.ops.get("/api/ops/sessions/?minutes=60")
        self.assertEqual(listed.status_code, 200)
        self.assertEqual(len(listed.data["results"]), 1)
        self.assertEqual(listed.data["results"][0]["username"], "signed-in-ada")
        self.assertNotIn(phone, listed.content.decode())
        self.assertNotIn(laptop, listed.content.decode())

    def test_revoke_ends_the_open_sign_ins(self):
        phone = self._sign_in()
        laptop = self._sign_in()
        revoked = self.ops.post(f"/api/ops/sessions/{self.member.id}/revoke/")
        self.assertEqual(revoked.status_code, 200)
        self.assertEqual(revoked.data["deleted"], 2)
        self.assertNotIn(phone, revoked.content.decode())
        self.assertNotIn(laptop, revoked.content.decode())

        listed = self.ops.get("/api/ops/sessions/?minutes=60")
        self.assertEqual(listed.data["results"], [])
        phone_client = APIClient()
        phone_client.credentials(HTTP_AUTHORIZATION=f"Token {phone}")
        self.assertNotEqual(phone_client.get("/api/auth/me/").status_code, 200)
        laptop_client = APIClient()
        laptop_client.credentials(HTTP_AUTHORIZATION=f"Token {laptop}")
        self.assertNotEqual(laptop_client.get("/api/auth/me/").status_code, 200)
