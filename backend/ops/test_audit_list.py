import importlib
import json
from datetime import date, timedelta

from django.apps import apps
from django.test import TestCase
from django.utils import timezone
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from accounts.mfa import get_policy
from accounts.models import StaffMfaGrace, User
from clubmgmt.models import MemberRecord
from clubs.models import Club
from members.models import Member, MemberVerificationEvent
from members.verification import _audit
from ops.models import OpsAuditLog

copy_verification_events = importlib.import_module(
    "ops.migrations.0003_copy_member_verification_audit"
).copy_verification_events

def _open_grace(*users):
    policy = get_policy()
    if policy is not None:
        policy.shipped_on = timezone.localdate()
        policy.grace_days = 14
        policy.save(update_fields=["shipped_on", "grace_days"])
    StaffMfaGrace.objects.filter(user_id__in=[user.id for user in users]).delete()


class OpsAuditListTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.superuser = User.objects.create_superuser(
            username="audit-ops",
            email="audit-ops@example.com",
            password="pass12345",
        )
        self.other = User.objects.create_user(
            username="audit-ltf",
            email="audit-ltf@example.com",
            password="pass12345",
            role=User.Roles.LTF_ADMIN,
        )
        self.club = Club.objects.create(
            name="North Club",
            city="Luxembourg",
            address="1 Test Road",
            created_by=self.superuser,
        )
        self.member_user = User.objects.create_user(
            username="audit-member",
            email="audit-member@example.com",
            password="pass12345",
            role=User.Roles.MEMBER,
        )
        self.member = Member.objects.create(
            user=self.member_user,
            club=self.club,
            first_name="Ana",
            last_name="Silva",
            sex=Member.Sex.FEMALE,
            date_of_birth=date(1971, 10, 2),
        )
        _open_grace(self.superuser, self.other)
        MemberRecord.objects.create(
            member=self.member,
            social_security_number="1893120105732",
            social_security_country="LU",
        )
        OpsAuditLog.objects.all().delete()

    def _auth(self, user):
        token = Token.objects.create(user=user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")

    def _log(self, *, action, message, actor=None, when=None, metadata=None, target_id="1"):
        row = OpsAuditLog.objects.create(
            actor=actor,
            action=action,
            target_type="member",
            target_id=target_id,
            message=message,
            metadata=metadata or {},
        )
        if when is not None:
            OpsAuditLog.objects.filter(pk=row.pk).update(created_at=when)
            row.refresh_from_db()
        return row

    def test_only_a_superuser_can_read_the_audit(self):
        self._auth(self.other)
        denied = self.client.get("/api/ops/audit/")
        self.assertEqual(denied.status_code, 403)
        self._auth(self.superuser)
        allowed = self.client.get("/api/ops/audit/")
        self.assertEqual(allowed.status_code, 200)
        self.assertEqual(allowed.data["count"], 0)
        self.assertEqual(allowed.data["results"], [])

    def test_pages_are_newest_first_and_the_second_page_is_reachable(self):
        now = timezone.now()
        oldest = self._log(action="older", message="oldest row", when=now - timedelta(days=2))
        self._log(action="middle", message="middle row", when=now - timedelta(days=1))
        self._log(action="newer", message="newest row", when=now)
        self._auth(self.superuser)
        first = self.client.get("/api/ops/audit/?page=1&page_size=2")
        second = self.client.get("/api/ops/audit/?page=2&page_size=2")
        self.assertEqual(first.status_code, 200)
        self.assertEqual(first.data["count"], 3)
        self.assertEqual([row["action"] for row in first.data["results"]], ["newer", "middle"])
        self.assertEqual(second.data["results"][0]["id"], oldest.id)
        self.assertIn("older", first.data["actions"])

    def test_search_and_filters_use_the_server(self):
        now = timezone.now()
        self._log(
            action="query_run",
            message="Ran a report",
            actor=self.superuser,
            when=now,
            metadata={"club_name": "North Club", "token": "sekret-token-value", "social_security_number": "1893120105732"},
        )
        self._log(action="print_job_retry", message="Other row", actor=self.other, when=now - timedelta(days=3))
        self._auth(self.superuser)
        by_club = self.client.get("/api/ops/audit/?q=North")
        by_actor = self.client.get("/api/ops/audit/?actor=audit-ops")
        by_action = self.client.get("/api/ops/audit/?action=query_run")
        today = timezone.localdate().isoformat()
        by_day = self.client.get(f"/api/ops/audit/?from={today}&to={today}")
        self.assertEqual(by_club.data["count"], 1)
        self.assertEqual(by_actor.data["count"], 1)
        self.assertEqual(by_action.data["results"][0]["action"], "query_run")
        self.assertEqual(by_day.data["count"], 1)
        dumped = json.dumps(by_club.data)
        self.assertNotIn("sekret-token-value", dumped)
        self.assertNotIn("1893120105732", dumped)
        self.assertEqual(by_club.data["results"][0]["metadata"].get("club_name"), "North Club")
        self.assertNotIn("token", by_club.data["results"][0]["metadata"])
        self.assertNotIn("social_security_number", by_club.data["results"][0]["metadata"])

    def test_a_card_check_is_listed_without_the_number(self):
        _audit(
            self.member,
            self.superuser,
            "verify",
            reason="",
            fields=["first_name"],
            old={"first_name": "Ana", "last_name": "Silva", "date_of_birth": date(1971, 10, 2), "sex": "F"},
            new={"first_name": "Ana", "last_name": "SILVA", "date_of_birth": date(1971, 10, 2), "sex": "F"},
        )
        self._auth(self.superuser)
        listed = self.client.get("/api/ops/audit/?q=North")
        self.assertEqual(listed.status_code, 200)
        self.assertEqual(listed.data["count"], 1)
        row = listed.data["results"][0]
        self.assertEqual(row["action"], "member_verification.verify")
        self.assertEqual(row["target_id"], str(self.member.id))
        self.assertEqual(row["club_name"], "North Club")
        self.assertIn("SILVA", row["message"])
        dumped = json.dumps(listed.data)
        self.assertNotIn("1893120105732", dumped)
        self.assertNotIn("social_security_number", dumped)
        self.assertTrue(row["metadata"]["ssn_changed"] is False)

    def test_an_older_card_check_is_copied_onto_the_ops_log(self):
        event = MemberVerificationEvent.objects.create(
            member=self.member,
            actor=self.superuser,
            action="unlock",
            reason="Correct a spelling",
            fields=["last_name"],
            old_first_name="Ana",
            new_first_name="Ana",
            old_last_name="Silva",
            new_last_name="Silva",
            old_date_of_birth=date(1971, 10, 2),
            new_date_of_birth=date(1971, 10, 2),
            old_sex="F",
            new_sex="F",
            ssn_changed=True,
        )
        copy_verification_events(apps, None)
        copied = OpsAuditLog.objects.get(metadata__verification_event_id=event.id)
        self.assertEqual(copied.action, "member_verification.unlock")
        self.assertEqual(copied.created_at, event.created_at)
        self.assertNotIn("1893120105732", json.dumps(copied.metadata))
        self.assertTrue(copied.metadata["ssn_changed"])
        self.assertIn("North Club", copied.message)
