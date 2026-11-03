from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch
from urllib.parse import parse_qs, urlparse

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import User
from clubs.models import Club
from members.models import Member
from modules.codes import build_payload, sign_payload
from modules.entitlements import install_id_str, redeem_product_code, set_club_assignment
from modules.models import ClubModuleAssignment
from modules.registry import CLUB_MANAGEMENT_MODULE_ID, COMPETITION_MODULE_ID

from .models import ClubFeePrice, ClubFeeType, Invoice, ModulePurchase, ModuleRenewalJournal
from .module_orders import add_subscription_months
from .module_renewals import choice_url, run_module_renewal_job


class ModuleRenewalJobTests(APITestCase):
    def setUp(self):
        self.finance = User.objects.create_user(
            username="renew-finance",
            password="pass12345",
            role=User.Roles.LTF_FINANCE,
            email="finance@example.com",
        )
        self.club_admin = User.objects.create_user(
            username="renew-club",
            password="pass12345",
            role=User.Roles.CLUB_ADMIN,
            email="admin@example.com",
        )
        self.member_user = User.objects.create_user(
            username="renew-member",
            password="pass12345",
            role=User.Roles.MEMBER,
            email="member@example.com",
        )
        self.club = Club.objects.create(
            name="Renew Club",
            created_by=self.finance,
            is_active=True,
            email="club@example.com",
        )
        self.club.admins.add(self.club_admin)
        self.member = Member.objects.create(
            club=self.club,
            first_name="Anne",
            last_name="Reding",
            email="athlete@example.com",
            user=self.member_user,
        )
        token = sign_payload(
            build_payload(
                module_ids=[CLUB_MANAGEMENT_MODULE_ID, COMPETITION_MODULE_ID],
                install_id=install_id_str(),
            )
        )
        redeem_product_code(token, user=self.finance)
        self.today = timezone.localdate()
        self.fee = ClubFeeType.objects.create(
            name="Club management",
            code="club-management-renew",
            module_id=CLUB_MANAGEMENT_MODULE_ID,
            cadence=ClubFeeType.Cadence.ANNUAL,
        )
        ClubFeePrice.objects.create(
            fee_type=self.fee,
            amount=Decimal("80.00"),
            currency="EUR",
            effective_from=self.today - timedelta(days=10),
        )
        self.client.force_authenticate(user=self.club_admin)

    def _purchase(self, *, ends_in, choice="unanswered", club=None, module_id=CLUB_MANAGEMENT_MODULE_ID, fee=None):
        club = club or self.club
        return ModulePurchase.objects.create(
            club=club,
            fee_type=fee or self.fee,
            module_ids=[module_id],
            description="Club management",
            price_snapshot=Decimal("80.00"),
            status=ModulePurchase.Status.ACTIVE,
            renewal_choice=choice,
            activated_at=timezone.now(),
            ends_at=self.today + timedelta(days=ends_in),
            source=ModulePurchase.Source.ORDER,
        )

    def _token(self, purchase, choice):
        return parse_qs(urlparse(choice_url(purchase, choice)).query)["token"][0]

    @patch("licenses.module_renewals.send_resend_email", return_value=(True, ""))
    def test_notice_emails_the_club_once_and_not_the_member(self, send):
        purchase = self._purchase(ends_in=30)
        self.assertEqual(run_module_renewal_job(self.today), 1)
        self.assertEqual(send.call_count, 1)
        self.assertEqual(send.call_args.args[0], "club@example.com")
        self.assertNotIn("athlete@example.com", send.call_args.args[2])
        self.assertIn("Continue:", send.call_args.args[3])
        self.assertEqual(run_module_renewal_job(self.today), 0)
        self.assertEqual(send.call_count, 1)
        self.assertTrue(
            ModuleRenewalJournal.objects.filter(
                purchase=purchase,
                stage=ModuleRenewalJournal.Stage.RENEWAL_NOTICE,
            ).exists()
        )

    @patch("licenses.module_renewals.send_resend_email", return_value=(True, ""))
    def test_club_admin_can_choose_continue_in_the_app(self, send):
        purchase = self._purchase(ends_in=10)
        chosen = self.client.post(
            f"/api/clubs/{self.club.id}/module-purchases/{purchase.id}/choice/",
            {"choice": "continue"},
            format="json",
        )
        self.assertEqual(chosen.status_code, status.HTTP_200_OK, chosen.content)
        purchase.refresh_from_db()
        self.assertEqual(purchase.renewal_choice, ModulePurchase.RenewalChoice.CONTINUE)
        self.client.force_authenticate(user=self.member_user)
        denied = self.client.post(
            f"/api/clubs/{self.club.id}/module-purchases/{purchase.id}/choice/",
            {"choice": "stop"},
            format="json",
        )
        self.assertIn(denied.status_code, {status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND})

    @patch("licenses.module_renewals.send_resend_email", return_value=(True, ""))
    def test_missing_club_email_uses_club_admins_only(self, send):
        self.club.email = ""
        self.club.save(update_fields=["email"])
        self._purchase(ends_in=30)
        run_module_renewal_job(self.today)
        self.assertEqual(send.call_args.args[0], "admin@example.com")

    @patch("licenses.module_renewals.send_resend_email", return_value=(True, ""))
    def test_signed_link_records_the_later_choice_until_the_invoice_exists(self, send):
        purchase = self._purchase(ends_in=30)
        run_module_renewal_job(self.today)
        stop = self._token(purchase, "stop")
        continued = self._token(purchase, "continue")
        preview = self.client.get("/api/module-renewals/", {"token": continued})
        self.assertEqual(preview.status_code, status.HTTP_200_OK)
        self.assertFalse(preview.data["done"])
        first = self.client.post("/api/module-renewals/", {"token": continued}, format="json")
        self.assertEqual(first.status_code, status.HTTP_200_OK, first.content)
        self.assertTrue(first.data["done"])
        purchase.refresh_from_db()
        self.assertEqual(purchase.renewal_choice, ModulePurchase.RenewalChoice.CONTINUE)
        second = self.client.post("/api/module-renewals/", {"token": stop}, format="json")
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        purchase.refresh_from_db()
        self.assertEqual(purchase.renewal_choice, ModulePurchase.RenewalChoice.STOP)
        purchase.renewal_choice = ModulePurchase.RenewalChoice.CONTINUE
        purchase.ends_at = self.today + timedelta(days=1)
        purchase.save(update_fields=["renewal_choice", "ends_at"])
        run_module_renewal_job(self.today)
        purchase.refresh_from_db()
        self.assertIsNotNone(purchase.renewal_order_item_id)
        blocked = self.client.post("/api/module-renewals/", {"token": self._token(purchase, "stop")}, format="json")
        self.assertEqual(blocked.status_code, status.HTTP_200_OK)
        self.assertTrue(blocked.data["closed"])
        purchase.refresh_from_db()
        self.assertEqual(purchase.renewal_choice, ModulePurchase.RenewalChoice.CONTINUE)

    def test_an_old_or_tampered_link_is_rejected(self):
        purchase = self._purchase(ends_in=30)
        expired = self.client.post("/api/module-renewals/", {"token": "not-a-token"}, format="json")
        self.assertEqual(expired.status_code, status.HTTP_400_BAD_REQUEST)
        purchase.ends_at = self.today - timedelta(days=1)
        purchase.save(update_fields=["ends_at"])
        stale = self.client.post("/api/module-renewals/", {"token": self._token(purchase, "continue")}, format="json")
        self.assertEqual(stale.status_code, status.HTTP_400_BAD_REQUEST)

    @patch("licenses.tasks.send_resend_email", return_value=(True, ""))
    @patch("licenses.module_renewals.send_resend_email", return_value=(True, ""))
    def test_continue_shares_one_invoice_and_payment_extends_the_old_end_date(self, send, invoice_send):
        other = ClubFeeType.objects.create(
            name="Competition",
            code="competition-renew",
            module_id=COMPETITION_MODULE_ID,
            cadence=ClubFeeType.Cadence.ANNUAL,
        )
        ClubFeePrice.objects.create(
            fee_type=other,
            amount=Decimal("40.00"),
            currency="EUR",
            effective_from=self.today - timedelta(days=10),
        )
        first = self._purchase(ends_in=1, choice="continue")
        second = self._purchase(ends_in=1, choice="continue", module_id=COMPETITION_MODULE_ID, fee=other)
        second.description = "Competition"
        second.save(update_fields=["description"])
        run_module_renewal_job(self.today)
        self.assertEqual(Invoice.objects.count(), 1)
        invoice = Invoice.objects.get()
        self.assertEqual(invoice.order.items.count(), 2)
        self.assertEqual(invoice.total, Decimal("120.00"))
        self.assertTrue(invoice_send.called)
        _to, subject, _html, text = invoice_send.call_args[0]
        attachments = invoice_send.call_args.kwargs["attachments"]
        self.assertIn(invoice.invoice_number, subject)
        self.assertIn("Pay by", text)
        self.assertIn("The PDF is attached", text)
        self.assertEqual(attachments[0]["filename"], f"invoice_{invoice.invoice_number}.pdf")
        self.assertTrue(attachments[0]["content"])
        old_end = first.ends_at
        self.client.force_authenticate(user=self.finance)
        with patch("licenses.tasks.send_invoice_email.delay"):
            paid = self.client.post(
                f"/api/orders/{invoice.order_id}/confirm-payment/",
                {"payment_method": "bank_transfer", "payment_provider": "manual", "payment_reference": "REN"},
                format="json",
            )
        self.assertEqual(paid.status_code, status.HTTP_200_OK, paid.content)
        first.refresh_from_db()
        self.assertEqual(first.ends_at, add_subscription_months(old_end, 12))
        self.assertIsNone(first.switched_off_at)
        self.assertIsNone(first.renewal_order_item_id)

    @patch("licenses.module_renewals.send_resend_email", return_value=(True, ""))
    def test_silence_switches_off_at_the_end_and_a_legacy_module_stays_on(self, send):
        set_club_assignment(club=self.club, module_id=COMPETITION_MODULE_ID, enabled=True, user=self.finance)
        run_module_renewal_job(self.today)
        legacy = ModulePurchase.objects.get(source=ModulePurchase.Source.LEGACY, club=self.club)
        self.assertIsNone(legacy.ends_at)
        self.assertEqual(legacy.automation_hold, "grandfathered")
        purchase = self._purchase(ends_in=0)
        set_club_assignment(club=self.club, module_id=CLUB_MANAGEMENT_MODULE_ID, enabled=True, user=self.finance)
        run_module_renewal_job(self.today)
        purchase.refresh_from_db()
        self.assertEqual(purchase.status, ModulePurchase.Status.STOPPED)
        self.assertFalse(
            ClubModuleAssignment.objects.filter(
                club=self.club,
                module_id=CLUB_MANAGEMENT_MODULE_ID,
                enabled=True,
            ).exists()
        )
        self.assertTrue(
            ClubModuleAssignment.objects.filter(
                club=self.club,
                module_id=COMPETITION_MODULE_ID,
                enabled=True,
            ).exists()
        )
        self.assertEqual(Invoice.objects.count(), 0)
        self.assertFalse(send.called or any("athlete@example.com" in str(call) for call in send.call_args_list))

    @patch("licenses.module_renewals.send_resend_email", return_value=(True, ""))
    def test_unpaid_window_switches_off_and_a_late_payment_starts_today(self, send):
        purchase = self._purchase(ends_in=40, choice="continue")
        purchase.ends_at = self.today - timedelta(days=20)
        purchase.save(update_fields=["ends_at"])
        invoice = Invoice.objects.create(
            order=__import__("licenses.models", fromlist=["Order"]).Order.objects.create(
                club=self.club,
                ledger="federation",
                status="pending",
                currency="EUR",
                subtotal=Decimal("80.00"),
                total=Decimal("80.00"),
            ),
            club=self.club,
            status=Invoice.Status.ISSUED,
            currency="EUR",
            subtotal=Decimal("80.00"),
            total=Decimal("80.00"),
            issued_at=timezone.now() - timedelta(days=31),
        )
        from licenses.models import OrderItem

        item = OrderItem.objects.create(
            order=invoice.order,
            fee_type=self.fee,
            description="Club management",
            billing_club=self.club,
            price_snapshot=Decimal("80.00"),
            quantity=1,
            charged_amount=Decimal("80.00"),
        )
        purchase.renewal_order_item = item
        purchase.save(update_fields=["renewal_order_item"])
        run_module_renewal_job(self.today)
        purchase.refresh_from_db()
        self.assertIsNotNone(purchase.switched_off_at)
        self.assertFalse(
            ClubModuleAssignment.objects.filter(
                club=self.club,
                module_id=CLUB_MANAGEMENT_MODULE_ID,
                enabled=True,
            ).exists()
        )
        self.client.force_authenticate(user=self.finance)
        with patch("licenses.tasks.send_invoice_email.delay"):
            paid = self.client.post(
                f"/api/orders/{invoice.order_id}/confirm-payment/",
                {"payment_method": "bank_transfer", "payment_provider": "manual", "payment_reference": "LATE"},
                format="json",
            )
        self.assertEqual(paid.status_code, status.HTTP_200_OK, paid.content)
        purchase.refresh_from_db()
        self.assertEqual(purchase.ends_at, add_subscription_months(self.today, 12))
        self.assertIsNone(purchase.switched_off_at)
        self.assertTrue(
            ClubModuleAssignment.objects.filter(
                club=self.club,
                module_id=CLUB_MANAGEMENT_MODULE_ID,
                enabled=True,
            ).exists()
        )
        self.assertTrue(
            ModuleRenewalJournal.objects.filter(
                purchase=purchase,
                stage=ModuleRenewalJournal.Stage.LATE_REACTIVATED,
            ).exists()
        )

    @patch("licenses.module_renewals.send_resend_email", return_value=(True, ""))
    def test_the_job_stops_after_one_hundred_purchases(self, send):
        for _index in range(101):
            self._purchase(ends_in=30)
        self.assertEqual(run_module_renewal_job(self.today), 100)
        self.assertEqual(
            ModuleRenewalJournal.objects.filter(stage=ModuleRenewalJournal.Stage.RENEWAL_NOTICE).count(),
            100,
        )
        run_module_renewal_job(self.today)
        self.assertEqual(
            ModuleRenewalJournal.objects.filter(stage=ModuleRenewalJournal.Stage.RENEWAL_NOTICE).count(),
            101,
        )
