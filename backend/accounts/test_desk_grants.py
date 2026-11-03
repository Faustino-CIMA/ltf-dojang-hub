import importlib
from datetime import date, timedelta
from decimal import Decimal
from unittest.mock import patch

from django.apps import apps
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from clubs.models import Club
from licenses.models import (
    BankStatement,
    CardFormatPreset,
    CardTemplate,
    CardTemplateVersion,
    Expense,
    ExpenseCategory,
    Order,
    PrintJob,
)
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

    def test_multi_hat_user_can_switch_every_desk(self):
        person = User.objects.create_user(
            username="desk-hats",
            email="desk-hats@example.com",
            password="pass12345",
            role=User.Roles.CLUB_ADMIN,
            is_superuser=True,
        )
        self.club_a.admins.add(person)
        self.club_b.admins.add(person)
        DeskGrant.objects.create(
            user=person,
            desk=DeskGrant.Desk.LTF_FINANCE,
            level=DeskGrant.Level.FULL,
            source=DeskGrant.Source.MANUAL,
            valid_from=timezone.localdate() - timedelta(days=1),
            reason="Cover",
        )
        DeskGrant.objects.create(
            user=person,
            desk=DeskGrant.Desk.LTF_ADMIN,
            level=DeskGrant.Level.READ_ONLY,
            source=DeskGrant.Source.MANUAL,
            valid_from=timezone.localdate() - timedelta(days=1),
            valid_until=timezone.localdate() + timedelta(days=30),
            reason="Cover",
        )
        self.client.force_authenticate(user=person)
        me = self.client.get("/api/auth/me/")
        self.assertEqual(me.status_code, status.HTTP_200_OK, me.content)
        names = {(row["desk"], row["club_id"]) for row in me.data["desks"]}
        self.assertIn(("club_admin", self.club_a.id), names)
        self.assertIn(("club_admin", self.club_b.id), names)
        self.assertIn(("ltf_finance", None), names)
        self.assertIn(("ltf_admin", None), names)
        self.assertIn(("ops", None), names)
        finance = self.client.get("/api/auth/me/", HTTP_X_DESK="ltf_finance")
        self.assertEqual(finance.status_code, status.HTTP_200_OK, finance.content)
        self.assertEqual(finance.data["mfa"]["desk_block"], "mfa_enrol_required")
        for desk, club_id in (
            ("club_admin", self.club_a.id),
            ("club_admin", self.club_b.id),
            ("ltf_finance", None),
            ("ltf_admin", None),
            ("ops", None),
        ):
            body = {"desk": desk} if club_id is None else {"desk": desk, "club_id": club_id}
            chosen = self.client.post("/api/auth/desk/", body, format="json")
            self.assertEqual(chosen.status_code, status.HTTP_200_OK, chosen.content)
            self.assertEqual(chosen.data["desk"], desk)
            self.assertEqual(chosen.data["club_id"], club_id)
            again = self.client.get("/api/auth/me/", HTTP_X_DESK="ops" if desk == "ops" else (f"{desk}:{club_id}" if club_id else desk))
            self.assertEqual(again.data["last_desk"]["desk"], desk)
            self.assertEqual(again.data["last_desk"]["club_id"], club_id)
            person.refresh_from_db()
            self.assertEqual(person.role, User.Roles.CLUB_ADMIN)

    def test_choosing_a_desk_is_audited_and_leaves_the_role_alone(self):
        record_desk_switch(self.admin, desk=DeskGrant.Desk.LTF_ADMIN)
        self.admin.refresh_from_db()
        self.assertEqual(self.admin.role, User.Roles.LTF_ADMIN)
        self.assertEqual(self.admin.desk_preference.desk, DeskGrant.Desk.LTF_ADMIN)
        self.assertTrue(OpsAuditLog.objects.filter(action="desk.switched", actor=self.admin).exists())
        record_desk_switch(self.admin, desk=DeskGrant.Desk.LTF_ADMIN)
        self.assertEqual(OpsAuditLog.objects.filter(action="desk.switched", actor=self.admin).count(), 1)

    def test_me_lists_one_row_per_club_and_select_audits_ltf_admin(self):
        self.client.force_authenticate(user=self.club_admin)
        me = self.client.get("/api/auth/me/")
        self.assertEqual(me.status_code, status.HTTP_200_OK)
        clubs = {row["club_id"] for row in me.data["desks"]}
        self.assertEqual(clubs, {self.club_a.id, self.club_b.id})
        self.client.force_authenticate(user=self.admin)
        chosen = self.client.post("/api/auth/desk/", {"desk": "ltf_admin"}, format="json")
        self.assertEqual(chosen.status_code, status.HTTP_200_OK, chosen.content)
        self.assertEqual(chosen.data["level"], "full")
        audit = OpsAuditLog.objects.filter(action="desk.switched", actor=self.admin).latest("id")
        self.assertTrue(audit.metadata["into_ltf_admin"])
        self.admin.refresh_from_db()
        self.assertEqual(self.admin.role, User.Roles.LTF_ADMIN)
        refused = self.client.post("/api/auth/desk/", {"desk": "ltf_finance"}, format="json")
        self.assertEqual(refused.status_code, status.HTTP_403_FORBIDDEN)

    def test_club_list_narrows_to_the_active_club_desk(self):
        self.client.force_authenticate(user=self.club_admin)
        everything = self.client.get("/api/clubs/")
        self.assertEqual(everything.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(len(everything.data), 2)
        one = self.client.get("/api/clubs/", HTTP_X_DESK=f"club_admin:{self.club_a.id}")
        self.assertEqual(one.status_code, status.HTTP_200_OK, one.content)
        self.assertEqual([row["id"] for row in one.data], [self.club_a.id])

    def test_club_desk_hides_the_other_clubs_books_and_print_jobs(self):
        today = date.today()
        category = ExpenseCategory.objects.create(name="Desk paper", club=self.club_a)
        own_expense = Expense.objects.create(
            category=category,
            club=self.club_a,
            description="Paper",
            amount=Decimal("2.00"),
            expense_date=today,
            ledger=Order.Ledger.CLUB,
            created_by=self.club_admin,
        )
        other_expense = Expense.objects.create(
            category=category,
            club=self.club_b,
            description="Other paper",
            amount=Decimal("3.00"),
            expense_date=today,
            ledger=Order.Ledger.CLUB,
            created_by=self.club_admin,
        )
        own_statement = BankStatement.objects.create(
            ledger=Order.Ledger.CLUB,
            club=self.club_a,
            period_start=today,
            period_end=today,
            created_by=self.club_admin,
        )
        other_statement = BankStatement.objects.create(
            ledger=Order.Ledger.CLUB,
            club=self.club_b,
            period_start=today,
            period_end=today,
            created_by=self.club_admin,
        )
        preset = CardFormatPreset.objects.order_by("id").first()
        if preset is None:
            preset = CardFormatPreset.objects.create(name="Desk card", width_mm=Decimal("85.60"), height_mm=Decimal("53.98"))
        template = CardTemplate.objects.create(name="Desk template")
        version = CardTemplateVersion.objects.create(template=template, version_number=1, card_format=preset)
        own_job = PrintJob.objects.create(club=self.club_a, template_version=version)
        other_job = PrintJob.objects.create(club=self.club_b, template_version=version)
        self.client.force_authenticate(user=self.club_admin)
        header = {"HTTP_X_DESK": f"club_admin:{self.club_a.id}"}
        with patch("clubmgmt.access.club_mgmt_entitled", return_value=True), patch(
            "clubmgmt.access.club_mgmt_assigned", return_value=True
        ):
            self.assertEqual(self.client.get(f"/api/club-expenses/{own_expense.id}/", **header).status_code, status.HTTP_200_OK)
            self.assertEqual(self.client.get(f"/api/club-expenses/{other_expense.id}/", **header).status_code, status.HTTP_404_NOT_FOUND)
            self.assertEqual(self.client.get(f"/api/club-expenses/{other_expense.id}/").status_code, status.HTTP_200_OK)
            self.assertEqual(
                self.client.get(f"/api/club-bank-statements/{own_statement.id}/", **header).status_code,
                status.HTTP_200_OK,
            )
            self.assertEqual(
                self.client.get(f"/api/club-bank-statements/{other_statement.id}/", **header).status_code,
                status.HTTP_404_NOT_FOUND,
            )
        self.assertEqual(self.client.get(f"/api/print-jobs/{own_job.id}/", **header).status_code, status.HTTP_200_OK)
        self.assertEqual(self.client.get(f"/api/print-jobs/{other_job.id}/", **header).status_code, status.HTTP_404_NOT_FOUND)
