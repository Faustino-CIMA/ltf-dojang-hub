import importlib
from datetime import timedelta

from django.apps import apps
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from clubs.models import Club
from members.models import Member
from ops.models import OpsAuditLog

from .desks import record_desk_switch
from .models import DeskGrant, User

legacy_migration = importlib.import_module("accounts.migrations.0006_legacy_desk_grants")


class DeskGrantTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            username="desk-admin",
            password="pass12345",
            role=User.Roles.LTF_ADMIN,
            email="desk-admin@example.com",
        )
        self.finance = User.objects.create_user(
            username="desk-finance",
            password="pass12345",
            role=User.Roles.LTF_FINANCE,
            email="desk-finance@example.com",
        )
        self.member = User.objects.create_user(
            username="desk-member",
            password="pass12345",
            role=User.Roles.MEMBER,
            email="desk-member@example.com",
        )
        self.coach = User.objects.create_user(
            username="desk-coach",
            password="pass12345",
            role=User.Roles.COACH,
            email="desk-coach@example.com",
        )
        self.club_admin = User.objects.create_user(
            username="desk-club",
            password="pass12345",
            role=User.Roles.CLUB_ADMIN,
            email="desk-club@example.com",
        )
        self.club_a = Club.objects.create(name="Desk Club A", created_by=self.admin)
        self.club_b = Club.objects.create(name="Desk Club B", created_by=self.admin)
        self.club_a.admins.add(self.club_admin)
        self.club_b.admins.add(self.club_admin)
        self.club_a.trainers.add(self.coach)
        Member.objects.create(
            club=self.club_a,
            first_name="Ada",
            last_name="Member",
            user=self.member,
        )

    def test_legacy_grants_follow_the_role_and_each_club(self):
        self.assertTrue(
            DeskGrant.objects.filter(
                user=self.admin,
                desk=DeskGrant.Desk.LTF_ADMIN,
                level=DeskGrant.Level.FULL,
                source=DeskGrant.Source.LEGACY,
                club__isnull=True,
            ).exists()
        )
        self.assertEqual(
            set(
                DeskGrant.objects.filter(
                    user=self.club_admin,
                    desk=DeskGrant.Desk.CLUB_ADMIN,
                    source=DeskGrant.Source.LEGACY,
                    valid_until__isnull=True,
                ).values_list("club_id", flat=True)
            ),
            {self.club_a.id, self.club_b.id},
        )
        self.assertTrue(
            DeskGrant.objects.filter(user=self.coach, desk=DeskGrant.Desk.COACH, club=self.club_a).exists()
        )
        self.assertTrue(OpsAuditLog.objects.filter(action="desk.grant_created", metadata__user_id=self.finance.id).exists())

    def test_backfill_is_idempotent(self):
        before = DeskGrant.objects.count()
        legacy_migration.create_legacy_grants(apps, None)
        legacy_migration.create_legacy_grants(apps, None)
        self.assertEqual(DeskGrant.objects.count(), before)

    def test_missing_header_keeps_todays_access_and_does_not_change_the_role(self):
        self.client.force_authenticate(user=self.finance)
        response = self.client.get("/api/auth/me/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["role"], User.Roles.LTF_FINANCE)
        written = self.client.post("/api/auth/consent/", {"consent_given": True}, format="json")
        self.assertEqual(written.status_code, status.HTTP_200_OK, written.content)
        self.finance.refresh_from_db()
        self.assertEqual(self.finance.role, User.Roles.LTF_FINANCE)

    def test_a_header_for_another_desk_is_refused(self):
        self.client.force_authenticate(user=self.finance)
        response = self.client.get("/api/auth/me/", HTTP_X_DESK="ltf_admin")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(response.data["detail"], "desk_not_granted")
        self.assertTrue(OpsAuditLog.objects.filter(action="desk.switch_refused", actor=self.finance).exists())
        self.finance.refresh_from_db()
        self.assertEqual(self.finance.role, User.Roles.LTF_FINANCE)

    def test_the_matching_header_is_allowed(self):
        self.client.force_authenticate(user=self.club_admin)
        response = self.client.get("/api/auth/me/", HTTP_X_DESK=f"club_admin:{self.club_b.id}")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)

    def test_read_only_blocks_writes_and_allows_reads(self):
        today = timezone.localdate()
        DeskGrant.objects.filter(user=self.finance, source=DeskGrant.Source.LEGACY).update(valid_until=today)
        DeskGrant.objects.create(
            user=self.finance,
            desk=DeskGrant.Desk.LTF_FINANCE,
            level=DeskGrant.Level.READ_ONLY,
            source=DeskGrant.Source.MANUAL,
            valid_from=today - timedelta(days=1),
            valid_until=today + timedelta(days=10),
            reason="Temporary look",
        )
        self.client.force_authenticate(user=self.finance)
        reading = self.client.get("/api/auth/me/", HTTP_X_DESK="ltf_finance")
        self.assertEqual(reading.status_code, status.HTTP_200_OK)
        writing = self.client.post("/api/auth/consent/", {"consent_given": True}, format="json", HTTP_X_DESK="ltf_finance")
        self.assertEqual(writing.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(writing.data["detail"], "desk_read_only")

    def test_choosing_a_desk_is_audited_and_leaves_the_role_alone(self):
        record_desk_switch(self.admin, desk=DeskGrant.Desk.LTF_ADMIN)
        self.admin.refresh_from_db()
        self.assertEqual(self.admin.role, User.Roles.LTF_ADMIN)
        self.assertEqual(self.admin.desk_preference.desk, DeskGrant.Desk.LTF_ADMIN)
        self.assertTrue(OpsAuditLog.objects.filter(action="desk.switched", actor=self.admin).exists())
        record_desk_switch(self.admin, desk=DeskGrant.Desk.LTF_ADMIN)
        self.assertEqual(OpsAuditLog.objects.filter(action="desk.switched", actor=self.admin).count(), 1)
