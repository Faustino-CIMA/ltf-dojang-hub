from datetime import timedelta

from django.test import RequestFactory, TestCase
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
