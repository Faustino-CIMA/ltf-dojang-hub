from datetime import timedelta

from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.test import RequestFactory, TestCase
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from clubmgmt.models import Committee, CommitteeMandate, Person
from clubs.models import Club
from licenses.models import FinanceAuditLog, Invoice, Order
from members.models import Member
from ops.models import OpsAuditLog

from .models import DeskGrant, MfaPolicy, OfficeDeskMap, User


class OfficeDeskTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.today = timezone.localdate()
        self.root = User.objects.create_superuser(
            username="repro-fcima",
            email="repro-fcima@example.com",
            password="pass12345",
            first_name="Faux",
            last_name="CIMA",
        )
        self.finance = User.objects.create_user(
            username="desk-finance",
            email="desk-finance@example.com",
            password="pass12345",
            role=User.Roles.LTF_FINANCE,
        )
        self.admin = User.objects.create_user(
            username="desk-admin",
            email="desk-admin@example.com",
            password="pass12345",
            role=User.Roles.LTF_ADMIN,
        )
        self.club = Club.objects.create(name="Desk Club", created_by=self.admin)
        self.home = Member.objects.create(
            user=self.admin,
            club=self.club,
            first_name="Ada",
            last_name="Admin",
            date_of_birth=self.today.replace(year=self.today.year - 40),
        )
        self.committee = Committee.objects.create(scope=Committee.Scope.FEDERATION, name="Board")
        self.person = Person.objects.create(first_name="Faux", last_name="CIMA")
        self.mandate = CommitteeMandate.objects.create(
            committee=self.committee,
            role=CommitteeMandate.Role.TREASURER,
            person=self.person,
            started_on=self.today - timedelta(days=10),
        )

    def test_linking_the_treasurer_contact_opens_finance(self):
        self.assertFalse(
            DeskGrant.objects.filter(user=self.root, desk=DeskGrant.Desk.LTF_FINANCE, source=DeskGrant.Source.OFFICE).exists()
        )
        token = Token.objects.create(user=self.root)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")
        linked = self.client.post(
            "/api/ops/desks/contacts/",
            {"person_id": self.person.id, "user_id": self.root.id},
            format="json",
        )
        self.assertEqual(linked.status_code, 200, linked.data)
        finance = DeskGrant.objects.get(user=self.root, desk=DeskGrant.Desk.LTF_FINANCE, source=DeskGrant.Source.OFFICE)
        admin = DeskGrant.objects.get(user=self.root, desk=DeskGrant.Desk.LTF_ADMIN, source=DeskGrant.Source.OFFICE)
        self.assertEqual(finance.level, DeskGrant.Level.FULL)
        self.assertEqual(admin.level, DeskGrant.Level.READ_ONLY)
        self.assertIsNone(finance.valid_until)
        self.assertTrue(OpsAuditLog.objects.filter(action="desk.contact_linked").exists())
        self.assertTrue(OpsAuditLog.objects.filter(action="desk.grant_created").exists())

        self.mandate.ended_on = self.today
        self.mandate.save()
        finance.refresh_from_db()
        self.assertEqual(finance.valid_until, self.today)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}", HTTP_X_DESK="ltf_finance")
        denied = self.client.get("/api/invoices/")
        self.assertEqual(denied.status_code, 403)

    def test_new_office_desk_asks_for_a_second_factor(self):
        self.person.user = self.root
        self.person.save(update_fields=["user"])
        from accounts.offices import sync_mandate

        sync_mandate(self.mandate)
        policy = MfaPolicy.objects.get(pk=1)
        self.assertLessEqual(self.root.date_joined.date(), policy.shipped_on)
        token = Token.objects.create(user=self.root)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}", HTTP_X_DESK="ltf_finance")
        blocked = self.client.get("/api/invoices/")
        self.assertEqual(blocked.status_code, 403)
        self.assertEqual(blocked.data["detail"], "mfa_enrol_required")

    def test_manual_read_only_grant_needs_an_end_date(self):
        token = Token.objects.create(user=self.root)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")
        missing = self.client.post(
            "/api/ops/desks/grants/",
            {"user_id": self.finance.id, "desk": "ltf_admin", "level": "read_only", "reason": "Cover"},
            format="json",
        )
        self.assertEqual(missing.status_code, 400)
        created = self.client.post(
            "/api/ops/desks/grants/",
            {
                "user_id": self.finance.id,
                "desk": "ltf_admin",
                "level": "read_only",
                "reason": "Cover",
                "valid_until": (self.today + timedelta(days=30)).isoformat(),
            },
            format="json",
        )
        self.assertEqual(created.status_code, 201, created.data)
        self.assertTrue(OfficeDeskMap.objects.filter(office="treasurer", desk="ltf_finance", level="full").exists())

    def test_own_club_override_is_blocked_until_an_exception(self):
        from licenses.models import ModulePurchase

        purchase = ModulePurchase.objects.create(
            club=self.club,
            status=ModulePurchase.Status.ACTIVE,
            source=ModulePurchase.Source.LEGACY,
            module_ids=["club_management"],
            description="Legacy club management",
            price_snapshot=0,
        )
        token = Token.objects.create(user=self.admin)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")
        blocked = self.client.post(
            f"/api/module-purchases/{purchase.id}/override/",
            {"action": "keep_open", "reason": "because"},
            format="json",
        )
        self.assertEqual(blocked.status_code, 403)
        self.assertEqual(blocked.data["detail"], "own_club_override")
        allowed = self.client.post(
            "/api/ops/desks/exceptions/",
            {
                "user_id": self.admin.id,
                "rule": "own_club_override",
                "club_id": self.club.id,
                "reason": "Stand-in",
                "valid_until": (self.today + timedelta(days=90)).isoformat(),
            },
            format="json",
        )
        self.assertEqual(allowed.status_code, 403)
        root = Token.objects.create(user=self.root)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {root.key}")
        too_long = self.client.post(
            "/api/ops/desks/exceptions/",
            {
                "user_id": self.admin.id,
                "rule": "own_club_override",
                "club_id": self.club.id,
                "reason": "Too long",
                "valid_until": (self.today + timedelta(days=91)).isoformat(),
            },
            format="json",
        )
        self.assertEqual(too_long.status_code, 400)
        ok = self.client.post(
            "/api/ops/desks/exceptions/",
            {
                "user_id": self.admin.id,
                "rule": "own_club_override",
                "club_id": self.club.id,
                "reason": "Stand-in",
                "valid_until": (self.today + timedelta(days=30)).isoformat(),
            },
            format="json",
        )
        self.assertEqual(ok.status_code, 201, ok.data)
        self.assertTrue(OpsAuditLog.objects.filter(action="desk.exception").exists())

    def test_invoice_creator_cannot_record_the_payment(self):
        order = Order.objects.create(
            club=self.club,
            ledger=Order.Ledger.FEDERATION,
            status=Order.Status.PENDING,
            subtotal=10,
            tax_total=0,
            total=10,
        )
        invoice = Invoice.objects.create(
            order=order,
            club=self.club,
            status=Invoice.Status.ISSUED,
            subtotal=10,
            tax_total=0,
            total=10,
        )
        FinanceAuditLog.objects.create(
            action="invoice.created",
            message="Invoice created.",
            actor=self.finance,
            club=self.club,
            order=order,
            invoice=invoice,
        )
        request = RequestFactory().post("/api/orders/1/confirm-payment/")
        request.user = self.finance
        request.META = {}
        from accounts.duties import refuse_own_invoice_payment

        self.assertEqual(refuse_own_invoice_payment(request, order), "own_invoice_payment")
        request.user = self.admin
        self.assertIsNone(refuse_own_invoice_payment(request, order))


class MemberOfficeGrantTests(TestCase):
    """A federation term can exist before the member's login. Linking the login opens the mapped desks."""

    def setUp(self):
        self.today = timezone.localdate()
        self.club = Club.objects.create(
            name="Grant Club",
            created_by=User.objects.create_user(
                username="grant-admin",
                email="grant-admin@example.com",
                password="pass12345",
                role=User.Roles.LTF_ADMIN,
            ),
        )
        self.committee = Committee.objects.create(scope=Committee.Scope.FEDERATION, name="LTF Committee")
        OfficeDeskMap.objects.create(office="committee_member", desk="ltf_admin", level="full")
        OfficeDeskMap.objects.create(office="committee_member", desk="ltf_finance", level="read_only")
        self.member = Member.objects.create(
            club=self.club,
            first_name="Dora",
            last_name="Beispiel",
            date_of_birth=self.today.replace(year=self.today.year - 30),
        )
        self.mandate = CommitteeMandate.objects.create(
            committee=self.committee,
            role=CommitteeMandate.Role.COMMITTEE_MEMBER,
            member=self.member,
            started_on=self.today - timedelta(days=30),
        )
        self.login = User.objects.create_user(
            username="dora-login",
            email="dora-login@example.com",
            password="pass12345",
            role=User.Roles.MEMBER,
        )

    def _office_grants(self):
        return DeskGrant.objects.filter(source=DeskGrant.Source.OFFICE, mandate=self.mandate)

    def test_linking_a_login_opens_the_mapped_desks(self):
        self.assertFalse(self._office_grants().exists())
        self.member.user = self.login
        self.member.save(update_fields=["user", "updated_at"])
        grants = {grant.desk: grant for grant in self._office_grants()}
        self.assertEqual(set(grants), {DeskGrant.Desk.LTF_ADMIN, DeskGrant.Desk.LTF_FINANCE})
        self.assertEqual(grants[DeskGrant.Desk.LTF_ADMIN].level, DeskGrant.Level.FULL)
        self.assertEqual(grants[DeskGrant.Desk.LTF_FINANCE].level, DeskGrant.Level.READ_ONLY)
        self.assertIsNone(grants[DeskGrant.Desk.LTF_ADMIN].valid_until)
        self.assertEqual(self.login.role, User.Roles.MEMBER)
        self.assertEqual(set(self._office_grants().values_list("user_id", flat=True)), {self.login.id})

    def test_clearing_the_login_ends_the_desks(self):
        self.member.user = self.login
        self.member.save(update_fields=["user", "updated_at"])
        self.member.user = None
        self.member.save(update_fields=["user", "updated_at"])
        grants = list(self._office_grants())
        self.assertEqual(len(grants), 2)
        self.assertTrue(all(grant.valid_until == self.today for grant in grants))

    def test_an_ended_row_is_reused_for_the_next_login(self):
        self.member.user = self.login
        self.member.save(update_fields=["user", "updated_at"])
        original_ids = set(self._office_grants().values_list("id", flat=True))
        self.member.user = None
        self.member.save(update_fields=["user", "updated_at"])
        other = User.objects.create_user(
            username="dora-next",
            email="dora-next@example.com",
            password="pass12345",
            role=User.Roles.MEMBER,
        )
        self.member.user = other
        self.member.save(update_fields=["user", "updated_at"])
        grants = list(self._office_grants())
        self.assertEqual({grant.id for grant in grants}, original_ids)
        self.assertTrue(all(grant.user_id == other.id and grant.valid_until is None for grant in grants))

    def test_a_parked_import_gets_no_desk_and_an_inactive_member_keeps_theirs(self):
        parked = Member(
            club=self.club,
            first_name="Park",
            last_name="Import",
            sex=Member.Sex.FEMALE,
            import_status=Member.ImportStatus.PARKED,
            is_active=False,
        )
        parked.save()
        parked_login = User.objects.create_user(
            username="park-login",
            email="park-login@example.com",
            password="pass12345",
            role=User.Roles.MEMBER,
        )
        parked_term = CommitteeMandate.objects.create(
            committee=self.committee,
            role=CommitteeMandate.Role.COMMITTEE_MEMBER,
            member=parked,
            started_on=self.today - timedelta(days=5),
        )
        parked.user = parked_login
        parked.save(update_fields=["user", "updated_at"])
        self.assertFalse(DeskGrant.objects.filter(source=DeskGrant.Source.OFFICE, mandate=parked_term).exists())

        self.member.is_active = False
        self.member.user = self.login
        self.member.save(update_fields=["is_active", "user", "updated_at"])
        self.assertEqual(self._office_grants().count(), 2)

    def test_saving_without_a_login_change_does_not_touch_office_tables(self):
        self.member.user = self.login
        self.member.save(update_fields=["user", "updated_at"])
        loaded = Member.objects.get(pk=self.member.pk)
        loaded.belt_rank = "1st Kup"
        with CaptureQueriesContext(connection) as narrowed:
            loaded.save(update_fields=["belt_rank", "updated_at"])
        loaded.last_name = "Beispielin"
        with CaptureQueriesContext(connection) as full:
            loaded.save()
        for captured in (narrowed, full):
            sql = " ".join(query["sql"].lower() for query in captured.captured_queries)
            self.assertNotIn("deskgrant", sql)
            self.assertNotIn("officedeskmap", sql)
            self.assertNotIn("committeemandate", sql)

    def test_a_club_office_and_an_unlinked_contact_stay_closed(self):
        club_committee = Committee.objects.create(scope=Committee.Scope.CLUB, club=self.club, name="Club Board")
        club_term = CommitteeMandate.objects.create(
            committee=club_committee,
            role=CommitteeMandate.Role.COMMITTEE_MEMBER,
            member=self.member,
            started_on=self.today - timedelta(days=2),
        )
        person = Person.objects.create(first_name="Contact", last_name="Only", converted_member=self.member)
        person_term = CommitteeMandate.objects.create(
            committee=self.committee,
            role=CommitteeMandate.Role.TREASURER,
            person=person,
            started_on=self.today - timedelta(days=2),
        )
        self.member.user = self.login
        self.member.save(update_fields=["user", "updated_at"])
        self.assertFalse(DeskGrant.objects.filter(source=DeskGrant.Source.OFFICE, mandate=club_term).exists())
        self.assertFalse(DeskGrant.objects.filter(source=DeskGrant.Source.OFFICE, mandate=person_term).exists())
        person.user = self.login
        person.save(update_fields=["user"])
        self.assertTrue(
            DeskGrant.objects.filter(
                source=DeskGrant.Source.OFFICE,
                mandate=person_term,
                user=self.login,
                desk=DeskGrant.Desk.LTF_FINANCE,
            ).exists()
        )


class OfficeGrantRepairTests(TestCase):
    def test_the_repair_grants_only_the_map_and_can_run_twice(self):
        today = timezone.localdate()
        club = Club.objects.create(
            name="Repair Club",
            created_by=User.objects.create_user(
                username="repair-admin",
                email="repair-admin@example.com",
                password="pass12345",
            ),
        )
        login = User.objects.create_user(
            username="repair-login",
            email="repair-login@example.com",
            password="pass12345",
            role=User.Roles.MEMBER,
        )
        member = Member.objects.create(
            club=club,
            first_name="Repair",
            last_name="Holder",
            date_of_birth=today.replace(year=today.year - 40),
            user=login,
        )
        committee = Committee.objects.create(scope=Committee.Scope.FEDERATION, name="Repair Board")
        OfficeDeskMap.objects.get_or_create(office="committee_member", desk="ltf_admin", defaults={"level": "full"})
        OfficeDeskMap.objects.get_or_create(
            office="committee_member", desk="ltf_finance", defaults={"level": "read_only"}
        )
        open_term = CommitteeMandate.objects.create(
            committee=committee,
            role=CommitteeMandate.Role.COMMITTEE_MEMBER,
            member=member,
            started_on=today - timedelta(days=10),
        )
        closed = CommitteeMandate.objects.create(
            committee=committee,
            role=CommitteeMandate.Role.COMMITTEE_MEMBER,
            member=member,
            started_on=today - timedelta(days=40),
            ended_on=today - timedelta(days=1),
        )
        DeskGrant.objects.filter(source=DeskGrant.Source.OFFICE, mandate__in=[open_term, closed]).delete()
        ended = DeskGrant.objects.create(
            user=login,
            desk=DeskGrant.Desk.LTF_ADMIN,
            level=DeskGrant.Level.FULL,
            source=DeskGrant.Source.OFFICE,
            valid_from=open_term.started_on,
            valid_until=today,
            mandate=open_term,
            reason="Office",
        )

        executor = MigrationExecutor(connection)
        state = executor.loader.project_state([("accounts", "0013_resync_office_grants")]).apps
        repair = executor.loader.get_migration("accounts", "0013_resync_office_grants").operations[0].code

        repair(state, None)
        grants = DeskGrant.objects.filter(source=DeskGrant.Source.OFFICE, mandate=open_term)
        self.assertEqual(grants.count(), 2)
        ended.refresh_from_db()
        self.assertEqual(ended.user_id, login.id)
        self.assertIsNone(ended.valid_until)
        self.assertFalse(DeskGrant.objects.filter(source=DeskGrant.Source.OFFICE, mandate=closed).exists())
        self.assertFalse(
            DeskGrant.objects.filter(source=DeskGrant.Source.OFFICE, mandate=open_term, desk=DeskGrant.Desk.COACH).exists()
        )
        created = OpsAuditLog.objects.filter(action="desk.grant_created").count()
        updated = OpsAuditLog.objects.filter(action="desk.grant_updated").count()

        repair(state, None)
        self.assertEqual(DeskGrant.objects.filter(source=DeskGrant.Source.OFFICE, mandate=open_term).count(), 2)
        self.assertEqual(OpsAuditLog.objects.filter(action="desk.grant_created").count(), created)
        self.assertEqual(OpsAuditLog.objects.filter(action="desk.grant_updated").count(), updated)
