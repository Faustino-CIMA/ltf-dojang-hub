from datetime import timedelta

from django.contrib.sessions.models import Session
from django.test import TestCase
from django.utils import timezone
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from accounts.models import DeskGrant, OfficeDeskMap, User
from clubmgmt.models import Committee, CommitteeMandate
from clubs.models import Club
from members.models import Member


class OpsUserDeleteTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.today = timezone.localdate()
        self.root = User.objects.create_superuser(
            username="ops-root",
            email="ops-root@example.com",
            password="pass12345",
        )
        self.other = User.objects.create_superuser(
            username="ops-other",
            email="ops-other@example.com",
            password="pass12345",
        )
        self.login = User.objects.create_user(
            username="held-login",
            email="held-login@example.com",
            password="pass12345",
            role=User.Roles.MEMBER,
            first_name="Ada",
            last_name="Ng",
            is_email_verified=True,
        )
        self.club = Club.objects.create(name="Delete Club", created_by=self.other)
        self.member = Member.objects.create(
            club=self.club,
            first_name="Ada",
            last_name="Ng",
            date_of_birth=self.today.replace(year=self.today.year - 30),
            user=self.login,
        )
        committee = Committee.objects.create(scope=Committee.Scope.FEDERATION, name="Delete Board")
        OfficeDeskMap.objects.create(office="committee_member", desk="ltf_admin", level="full")
        self.mandate = CommitteeMandate.objects.create(
            committee=committee,
            role=CommitteeMandate.Role.COMMITTEE_MEMBER,
            member=self.member,
            started_on=self.today - timedelta(days=3),
        )
        self.root_token = Token.objects.create(user=self.root)
        signed_in = self.client.post(
            "/api/auth/login/",
            {"username": "held-login", "password": "pass12345"},
            format="json",
        )
        self.assertEqual(signed_in.status_code, 200, signed_in.data)
        self.session_token = signed_in.data["token"]

    def _as_root(self):
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.root_token.key}")

    def test_delete_removes_the_login_and_signs_them_out(self):
        self.assertTrue(
            DeskGrant.objects.filter(
                user=self.login,
                source=DeskGrant.Source.OFFICE,
                mandate=self.mandate,
            ).exists()
        )
        self._as_root()
        deleted = self.client.post(f"/api/ops/users/{self.login.id}/", {"action": "delete"}, format="json")
        self.assertEqual(deleted.status_code, 200, getattr(deleted, "data", deleted.content))
        self.assertFalse(User.objects.filter(pk=self.login.id).exists())
        self.member.refresh_from_db()
        self.assertIsNone(self.member.user_id)
        self.assertFalse(
            DeskGrant.objects.filter(user_id=self.login.id, source=DeskGrant.Source.OFFICE, valid_until__isnull=True).exists()
        )
        self.assertFalse(Session.objects.filter(session_key=self.session_token).exists())
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.session_token}")
        refused = self.client.get("/api/auth/me/")
        self.assertEqual(refused.status_code, 403, getattr(refused, "data", refused.content))
        self.assertEqual(refused.data["detail"], "account_unavailable")

    def test_a_referenced_login_stays_signed_in(self):
        Club.objects.create(name="Created By Login", created_by=self.login)
        self._as_root()
        refused = self.client.post(f"/api/ops/users/{self.login.id}/", {"action": "delete"}, format="json")
        self.assertEqual(refused.status_code, 400, getattr(refused, "data", refused.content))
        self.assertTrue(User.objects.filter(pk=self.login.id).exists())
        self.member.refresh_from_db()
        self.assertEqual(self.member.user_id, self.login.id)
        self.assertTrue(Session.objects.filter(session_key=self.session_token).exists())
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.session_token}")
        still = self.client.get("/api/auth/me/")
        self.assertEqual(still.status_code, 200, getattr(still, "data", still.content))

    def test_you_cannot_delete_your_own_login(self):
        self._as_root()
        refused = self.client.post(f"/api/ops/users/{self.root.id}/", {"action": "delete"}, format="json")
        self.assertEqual(refused.status_code, 400)
        self.assertTrue(User.objects.filter(pk=self.root.id).exists())
