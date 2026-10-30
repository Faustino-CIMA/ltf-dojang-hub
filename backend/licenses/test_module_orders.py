from datetime import date
from decimal import Decimal
from unittest.mock import patch

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from accounts.models import User
from clubs.models import Club
from members.models import Member
from modules.codes import build_payload, sign_payload
from modules.entitlements import install_id_str, redeem_product_code, set_club_assignment
from modules.models import ClubModuleAssignment
from modules.registry import CLUB_MANAGEMENT_MODULE_ID, COMPETITION_MODULE_ID, EVENT_CALENDAR_MODULE_ID

from .models import Invoice, License, LicenseType, ModuleBundle, ModulePurchase
from .module_orders import add_subscription_months


class ModuleOrderTests(APITestCase):
    def setUp(self):
        self.client = APIClient()
        self.finance = User.objects.create_user(
            username="order-finance",
            password="pass12345",
            role=User.Roles.LTF_FINANCE,
        )
        self.admin = User.objects.create_user(
            username="order-ltf-admin",
            password="pass12345",
            role=User.Roles.LTF_ADMIN,
        )
        self.club_admin = User.objects.create_user(
            username="order-club-admin",
            password="pass12345",
            role=User.Roles.CLUB_ADMIN,
        )
        self.other_admin = User.objects.create_user(
            username="order-other-admin",
            password="pass12345",
            role=User.Roles.CLUB_ADMIN,
        )
        self.club = Club.objects.create(name="Ordering Club", created_by=self.finance, is_active=True)
        self.other = Club.objects.create(name="Other Ordering Club", created_by=self.finance, is_active=True)
        self.club.admins.add(self.club_admin)
        self.other.admins.add(self.other_admin)
        self.license_type = LicenseType.objects.create(name="Order Annual", code="order-annual")
        self.year = timezone.localdate().year
        token = sign_payload(
            build_payload(
                module_ids=[CLUB_MANAGEMENT_MODULE_ID, COMPETITION_MODULE_ID, EVENT_CALENDAR_MODULE_ID],
                install_id=install_id_str(),
            )
        )
        redeem_product_code(token, user=self.finance)
        self.client.force_authenticate(user=self.finance)
        self.client.post(
            "/api/club-fee-types/",
            {
                "module_id": CLUB_MANAGEMENT_MODULE_ID,
                "initial_amount": "80.00",
                "initial_pricing_type": "flat",
                "initial_effective_from": f"{self.year}-01-01",
            },
            format="json",
        )
        self.client.post(
            "/api/club-fee-types/",
            {
                "module_id": COMPETITION_MODULE_ID,
                "initial_amount": "2.00",
                "initial_pricing_type": "per_active_member",
                "initial_effective_from": f"{self.year}-01-01",
            },
            format="json",
        )
        self.client.post(
            "/api/club-fee-types/",
            {
                "module_id": EVENT_CALENDAR_MODULE_ID,
                "initial_amount": "40.00",
                "initial_pricing_type": "flat",
                "initial_effective_from": f"{self.year}-01-01",
            },
            format="json",
        )
        created = self.client.post(
            "/api/module-bundles/",
            {
                "name": "Competition pack",
                "modules": [CLUB_MANAGEMENT_MODULE_ID, COMPETITION_MODULE_ID],
                "initial_amount": "100.00",
            },
            format="json",
        )
        self.bundle_id = created.data["id"]
        self.calendar_bundle = self.client.post(
            "/api/module-bundles/",
            {
                "name": "Calendar pack",
                "modules": [EVENT_CALENDAR_MODULE_ID, CLUB_MANAGEMENT_MODULE_ID],
                "initial_amount": "90.00",
            },
            format="json",
        ).data["id"]

    def _member(self):
        member = Member.objects.create(club=self.club, first_name="Anne", last_name="Reding")
        License.objects.create(
            member=member,
            club=self.club,
            license_type=self.license_type,
            year=self.year,
            status=License.Status.ACTIVE,
        )

    def test_add_months_lands_on_28_february_after_a_leap_day(self):
        self.assertEqual(add_subscription_months(date(2024, 2, 29), 12), date(2025, 2, 28))

    def test_club_admin_orders_one_invoice_and_payment_switches_modules_on(self):
        self._member()
        self.client.force_authenticate(user=self.club_admin)
        ordered = self.client.post(
            f"/api/clubs/{self.club.id}/module-orders/",
            {"modules": [EVENT_CALENDAR_MODULE_ID], "bundles": [self.bundle_id]},
            format="json",
        )
        self.assertEqual(ordered.status_code, status.HTTP_201_CREATED, ordered.content)
        self.assertEqual(Decimal(ordered.data["total"]), Decimal("140.00"))
        self.assertEqual(len(ordered.data["lines"]), 2)
        invoice = Invoice.objects.get(id=ordered.data["invoice_id"])
        self.assertEqual(invoice.status, Invoice.Status.ISSUED)
        self.assertEqual(invoice.order.items.count(), 2)
        bundle_line = invoice.order.items.get(bundle_id=self.bundle_id)
        self.assertIsNone(bundle_line.fee_type_id)
        self.assertEqual(bundle_line.quantity, 1)
        self.assertEqual(bundle_line.charged_amount, Decimal("100.00"))
        self.assertEqual(
            bundle_line.description,
            "Competition pack — Club management, Competition",
        )
        self.assertFalse(
            ClubModuleAssignment.objects.filter(club=self.club, enabled=True).exists()
        )
        purchases = ModulePurchase.objects.filter(club=self.club)
        self.assertEqual(purchases.count(), 2)
        self.assertTrue(all(purchase.status == ModulePurchase.Status.PENDING for purchase in purchases))
        self.assertTrue(all(purchase.ends_at is None for purchase in purchases))

        with patch("licenses.tasks.send_invoice_email.delay"):
            paid = self.client.post(
                f"/api/orders/{invoice.order_id}/confirm-payment/",
                {
                    "payment_method": "bank_transfer",
                    "payment_provider": "manual",
                    "payment_reference": invoice.invoice_number,
                },
                format="json",
            )
        self.assertEqual(paid.status_code, status.HTTP_403_FORBIDDEN, paid.content)
        self.client.force_authenticate(user=self.finance)
        with patch("licenses.tasks.send_invoice_email.delay"):
            paid = self.client.post(
                f"/api/orders/{invoice.order_id}/confirm-payment/",
                {
                    "payment_method": "bank_transfer",
                    "payment_provider": "manual",
                    "payment_reference": invoice.invoice_number,
                },
                format="json",
            )
        self.assertEqual(paid.status_code, status.HTTP_200_OK, paid.content)
        invoice.refresh_from_db()
        self.assertEqual(invoice.status, Invoice.Status.PAID)
        for module_id in (CLUB_MANAGEMENT_MODULE_ID, COMPETITION_MODULE_ID, EVENT_CALENDAR_MODULE_ID):
            self.assertTrue(
                ClubModuleAssignment.objects.filter(club=self.club, module_id=module_id, enabled=True).exists()
            )
        expected_end = add_subscription_months(timezone.localdate(), 12)
        for purchase in ModulePurchase.objects.filter(club=self.club):
            self.assertEqual(purchase.status, ModulePurchase.Status.ACTIVE)
            self.assertEqual(purchase.ends_at, expected_end)
            self.assertIsNotNone(purchase.activated_at)
        first_end = ModulePurchase.objects.get(club=self.club, bundle_id=self.bundle_id).ends_at

        from licenses.module_orders import activate_module_purchases

        activate_module_purchases(invoice.order, actor=self.finance)
        self.assertEqual(
            ModulePurchase.objects.get(club=self.club, bundle_id=self.bundle_id).ends_at,
            first_end,
        )

    def test_a_per_member_price_is_frozen_on_the_invoice(self):
        self._member()
        self.client.force_authenticate(user=self.club_admin)
        ordered = self.client.post(
            f"/api/clubs/{self.club.id}/module-orders/",
            {"modules": [COMPETITION_MODULE_ID]},
            format="json",
        )
        self.assertEqual(ordered.status_code, status.HTTP_201_CREATED, ordered.content)
        item = Invoice.objects.get().order.items.get()
        self.assertEqual(item.quantity, 1)
        self.assertEqual(item.active_member_count, 1)
        self.assertEqual(item.charged_amount, Decimal("2.00"))
        self.assertIn("1 active members", item.description)

    def test_a_module_already_on_is_not_ordered_again(self):
        set_club_assignment(
            club=self.club,
            module_id=CLUB_MANAGEMENT_MODULE_ID,
            enabled=True,
            user=self.finance,
        )
        self.client.force_authenticate(user=self.club_admin)
        refused = self.client.post(
            f"/api/clubs/{self.club.id}/module-orders/",
            {"modules": [CLUB_MANAGEMENT_MODULE_ID], "bundles": []},
            format="json",
        )
        self.assertEqual(refused.status_code, status.HTTP_400_BAD_REQUEST)
        bundled = self.client.post(
            f"/api/clubs/{self.club.id}/module-orders/",
            {"bundles": [self.bundle_id]},
            format="json",
        )
        self.assertEqual(bundled.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Invoice.objects.count(), 0)
        catalog = self.client.get(f"/api/clubs/{self.club.id}/module-order-catalog/")
        self.assertEqual(catalog.status_code, status.HTTP_200_OK)
        row = next(offer for offer in catalog.data["offers"] if offer["key"] == CLUB_MANAGEMENT_MODULE_ID)
        self.assertEqual(row["state"], "on")
        self.assertIsNone(row["ends_at"])

    def test_an_open_invoice_blocks_a_second_order(self):
        self.client.force_authenticate(user=self.club_admin)
        first = self.client.post(
            f"/api/clubs/{self.club.id}/module-orders/",
            {"modules": [EVENT_CALENDAR_MODULE_ID]},
            format="json",
        )
        self.assertEqual(first.status_code, status.HTTP_201_CREATED, first.content)
        second = self.client.post(
            f"/api/clubs/{self.club.id}/module-orders/",
            {"modules": [EVENT_CALENDAR_MODULE_ID]},
            format="json",
        )
        self.assertEqual(second.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Invoice.objects.count(), 1)

    def test_a_bundle_drops_the_single_module_it_already_contains(self):
        self.client.force_authenticate(user=self.club_admin)
        ordered = self.client.post(
            f"/api/clubs/{self.club.id}/module-orders/",
            {"modules": [CLUB_MANAGEMENT_MODULE_ID], "bundles": [self.bundle_id]},
            format="json",
        )
        self.assertEqual(ordered.status_code, status.HTTP_201_CREATED, ordered.content)
        self.assertEqual(len(ordered.data["lines"]), 1)
        self.assertEqual(ordered.data["notices"][0]["code"], "dropped_single")
        self.assertEqual(Invoice.objects.get().total, Decimal("100.00"))

    def test_two_bundles_that_share_a_module_are_refused(self):
        self.client.force_authenticate(user=self.club_admin)
        ordered = self.client.post(
            f"/api/clubs/{self.club.id}/module-orders/",
            {"bundles": [self.bundle_id, self.calendar_bundle]},
            format="json",
        )
        self.assertEqual(ordered.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Invoice.objects.count(), 0)

    def test_another_club_admin_and_ltf_admin_cannot_order(self):
        self.client.force_authenticate(user=self.other_admin)
        self.assertEqual(
            self.client.post(
                f"/api/clubs/{self.club.id}/module-orders/",
                {"modules": [EVENT_CALENDAR_MODULE_ID]},
                format="json",
            ).status_code,
            status.HTTP_404_NOT_FOUND,
        )
        self.client.force_authenticate(user=self.admin)
        self.assertEqual(
            self.client.post(
                f"/api/clubs/{self.club.id}/module-orders/",
                {"modules": [EVENT_CALENDAR_MODULE_ID]},
                format="json",
            ).status_code,
            status.HTTP_403_FORBIDDEN,
        )

    def test_finance_invoice_without_entitlement_does_not_switch_the_module_on(self):
        from modules.models import InstallEntitlement

        InstallEntitlement.objects.filter(module_id=EVENT_CALENDAR_MODULE_ID).update(active=False)
        self.client.force_authenticate(user=self.club_admin)
        hidden = self.client.get(f"/api/clubs/{self.club.id}/module-order-catalog/")
        self.assertNotIn(
            EVENT_CALENDAR_MODULE_ID,
            [offer["key"] for offer in hidden.data["offers"]],
        )
        self.client.force_authenticate(user=self.finance)
        visible = self.client.get(f"/api/clubs/{self.club.id}/module-order-catalog/")
        calendar = next(offer for offer in visible.data["offers"] if offer["key"] == EVENT_CALENDAR_MODULE_ID)
        self.assertEqual(calendar["state"], "not_entitled")
        ordered = self.client.post(
            f"/api/clubs/{self.club.id}/module-orders/",
            {"modules": [EVENT_CALENDAR_MODULE_ID]},
            format="json",
        )
        self.assertEqual(ordered.status_code, status.HTTP_201_CREATED, ordered.content)
        invoice = Invoice.objects.get()
        with patch("licenses.tasks.send_invoice_email.delay"):
            paid = self.client.post(
                f"/api/orders/{invoice.order_id}/confirm-payment/",
                {
                    "payment_method": "bank_transfer",
                    "payment_provider": "manual",
                    "payment_reference": invoice.invoice_number,
                },
                format="json",
            )
        self.assertEqual(paid.status_code, status.HTTP_200_OK, paid.content)
        purchase = ModulePurchase.objects.get()
        self.assertEqual(purchase.status, ModulePurchase.Status.PENDING)
        self.assertTrue(purchase.activation_error)
        self.assertFalse(
            ClubModuleAssignment.objects.filter(club=self.club, module_id=EVENT_CALENDAR_MODULE_ID).exists()
        )

    def test_an_invoiced_bundle_switches_off_instead_of_being_deleted(self):
        self.client.force_authenticate(user=self.club_admin)
        self.client.post(
            f"/api/clubs/{self.club.id}/module-orders/",
            {"bundles": [self.bundle_id]},
            format="json",
        )
        self.client.force_authenticate(user=self.finance)
        removed = self.client.delete(f"/api/module-bundles/{self.bundle_id}/")
        self.assertEqual(removed.status_code, status.HTTP_200_OK, removed.content)
        self.assertFalse(removed.data["is_active"])
        self.assertTrue(removed.data["has_invoices"])
        self.assertTrue(ModuleBundle.objects.filter(id=self.bundle_id, is_active=False).exists())

    def test_module_purchase_invoice_uses_the_federation_letterhead(self):
        from io import BytesIO

        from pypdf import PdfReader

        from licenses.models import Order, OrderItem
        from licenses.pdf_utils import build_invoice_context, render_invoice_pdf

        self.client.force_authenticate(user=self.club_admin)
        ordered = self.client.post(
            f"/api/clubs/{self.club.id}/module-orders/",
            {"bundles": [self.bundle_id], "modules": [EVENT_CALENDAR_MODULE_ID]},
            format="json",
        )
        self.assertEqual(ordered.status_code, status.HTTP_201_CREATED, ordered.content)
        invoice = Invoice.objects.get(id=ordered.data["invoice_id"])
        context = build_invoice_context(invoice)
        self.assertTrue(context["module_invoice"])
        self.assertFalse(context["license_invoice"])
        self.assertFalse(context["club_invoice"])
        self.assertEqual(len(context["module_rows"]), 2)
        bundle_row = next(row for row in context["module_rows"] if "Competition pack" in row["label"])
        self.assertEqual(bundle_row["label"], "Competition pack — Club management, Competition")
        self.assertEqual(bundle_row["quantity"], 1)
        self.assertEqual(bundle_row["line_total"], "100,00 €")
        self.assertEqual(context["total_amount"], "140,00 €")
        pdf = render_invoice_pdf(invoice, base_url="http://localhost")
        text = "\n".join((page.extract_text() or "") for page in PdfReader(BytesIO(pdf)).pages)
        self.assertIn("Luxembourg Taekwondo Federation", text)
        self.assertIn("Subject:", text)
        self.assertIn("Competition pack", text)
        self.assertIn("100,00 €", text)
        self.assertIn("140,00 €", text)
        self.assertNotIn("License ID", text)
        self.assertNotIn("LTF Dojang Hub", text)

        fee_order = Order.objects.create(club=self.club, ledger=Order.Ledger.FEDERATION, status=Order.Status.PENDING)
        OrderItem.objects.create(
            order=fee_order,
            description="Club management 2026",
            price_snapshot=Decimal("80.00"),
            quantity=1,
            charged_amount=Decimal("80.00"),
        )
        fee_invoice = Invoice.objects.create(
            order=fee_order,
            club=self.club,
            status=Invoice.Status.ISSUED,
            subtotal=Decimal("80.00"),
            total=Decimal("80.00"),
            issued_at=timezone.now(),
        )
        fee_context = build_invoice_context(fee_invoice)
        self.assertFalse(fee_context["module_invoice"])
        self.assertFalse(fee_context["license_invoice"])
        fee_pdf = render_invoice_pdf(fee_invoice, base_url="http://localhost")
        fee_text = "\n".join((page.extract_text() or "") for page in PdfReader(BytesIO(fee_pdf)).pages)
        self.assertIn("LTF Dojang Hub", fee_text)
