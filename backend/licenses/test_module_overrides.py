from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import User
from clubs.models import Club
from modules.codes import build_payload, sign_payload
from modules.entitlements import install_id_str, redeem_product_code, set_club_assignment
from modules.models import ClubModuleAssignment, InstallEntitlement
from modules.registry import CLUB_MANAGEMENT_MODULE_ID, COMPETITION_MODULE_ID

from .models import ClubFeeType, Invoice, ModulePurchase, ModulePurchaseOverride, ModuleRenewalJournal, Order, OrderItem
from .module_renewals import run_module_renewal_job


class ModuleOverrideTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            username="override-admin",
            password="pass12345",
            role=User.Roles.LTF_ADMIN,
        )
        self.finance = User.objects.create_user(
            username="override-finance",
            password="pass12345",
            role=User.Roles.LTF_FINANCE,
        )
        self.club_admin = User.objects.create_user(
            username="override-club",
            password="pass12345",
            role=User.Roles.CLUB_ADMIN,
            email="admin@example.com",
        )
        self.club = Club.objects.create(
            name="Override Club",
            created_by=self.admin,
            is_active=True,
            email="club@example.com",
        )
        self.club.admins.add(self.club_admin)
        self.today = timezone.localdate()
        token = sign_payload(
            build_payload(
                module_ids=[CLUB_MANAGEMENT_MODULE_ID],
                install_id=install_id_str(),
            )
        )
        redeem_product_code(token, user=self.admin)
        self.fee = ClubFeeType.objects.create(
            name="Override club management",
            code="override-club-management",
            module_id=CLUB_MANAGEMENT_MODULE_ID,
            cadence=ClubFeeType.Cadence.ANNUAL,
        )
        self.purchase = ModulePurchase.objects.create(
            club=self.club,
            fee_type=self.fee,
            module_ids=[CLUB_MANAGEMENT_MODULE_ID],
            description="Club management",
            price_snapshot=Decimal("80.00"),
            status=ModulePurchase.Status.ACTIVE,
            activated_at=timezone.now(),
            ends_at=self.today + timedelta(days=10),
            source=ModulePurchase.Source.ORDER,
        )
        set_club_assignment(
            club=self.club,
            module_id=CLUB_MANAGEMENT_MODULE_ID,
            enabled=True,
            user=self.admin,
        )
        self.client.force_authenticate(user=self.admin)

    def _override(self, action, **extra):
        return self.client.post(
            f"/api/module-purchases/{self.purchase.id}/override/",
            {"action": action, **extra},
            format="json",
        )

    def test_finance_and_club_admin_cannot_override(self):
        self.client.force_authenticate(user=self.finance)
        self.assertEqual(self._override("switch_off").status_code, status.HTTP_403_FORBIDDEN)
        self.client.force_authenticate(user=self.club_admin)
        self.assertEqual(self._override("switch_off").status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.client.get("/api/module-purchase-overrides/").status_code, status.HTTP_403_FORBIDDEN)

    def test_switch_off_is_audited_and_the_job_does_not_turn_it_back_on(self):
        saved = self._override("switch_off", reason="Closed for the season")
        self.assertEqual(saved.status_code, status.HTTP_200_OK, saved.content)
        self.purchase.refresh_from_db()
        self.assertIsNotNone(self.purchase.switched_off_at)
        self.assertEqual(self.purchase.automation_hold, "override")
        self.assertFalse(
            ClubModuleAssignment.objects.filter(
                club=self.club,
                module_id=CLUB_MANAGEMENT_MODULE_ID,
                enabled=True,
            ).exists()
        )
        audit = ModulePurchaseOverride.objects.get()
        self.assertEqual(audit.actor_id, self.admin.id)
        self.assertEqual(audit.previous_ends_at, self.today + timedelta(days=10))
        self.assertEqual(audit.reason, "Closed for the season")
        self.assertTrue(audit.before["switched_off"] is False)
        self.assertTrue(audit.after["switched_off"] is True)
        with patch("licenses.module_renewals.send_resend_email", return_value=(True, "")) as send:
            run_module_renewal_job(self.today)
        self.assertFalse(send.called)
        self.assertFalse(
            ClubModuleAssignment.objects.filter(
                club=self.club,
                module_id=CLUB_MANAGEMENT_MODULE_ID,
                enabled=True,
            ).exists()
        )
        listed = self.client.get("/api/module-purchase-overrides/", {"club": self.club.id})
        self.assertEqual(listed.status_code, status.HTTP_200_OK)
        self.assertEqual(listed.data[0]["action"], "switch_off")
        self.assertEqual(listed.data[0]["actor_name"], "override-admin")

    @patch("licenses.tasks.send_invoice_email.delay")
    def test_a_held_purchase_stays_off_when_the_renewal_invoice_is_paid(self, _email):
        self._override("switch_off")
        order = Order.objects.create(
            club=self.club,
            ledger=Order.Ledger.FEDERATION,
            status=Order.Status.PENDING,
            currency="EUR",
            subtotal=Decimal("80.00"),
            total=Decimal("80.00"),
        )
        item = OrderItem.objects.create(
            order=order,
            description="Club management",
            billing_club=self.club,
            price_snapshot=Decimal("80.00"),
            quantity=1,
            charged_amount=Decimal("80.00"),
        )
        Invoice.objects.create(
            order=order,
            club=self.club,
            status=Invoice.Status.ISSUED,
            currency="EUR",
            subtotal=Decimal("80.00"),
            total=Decimal("80.00"),
            issued_at=timezone.now(),
        )
        self.purchase.renewal_order_item = item
        self.purchase.save(update_fields=["renewal_order_item"])
        self.client.force_authenticate(user=self.finance)
        paid = self.client.post(
            f"/api/orders/{order.id}/confirm-payment/",
            {"payment_method": "bank_transfer", "payment_provider": "manual", "payment_reference": "HELD"},
            format="json",
        )
        self.assertEqual(paid.status_code, status.HTTP_200_OK, paid.content)
        self.purchase.refresh_from_db()
        self.assertIsNotNone(self.purchase.switched_off_at)
        self.assertEqual(self.purchase.ends_at, self.today + timedelta(days=10))
        self.assertFalse(
            ClubModuleAssignment.objects.filter(
                club=self.club,
                module_id=CLUB_MANAGEMENT_MODULE_ID,
                enabled=True,
            ).exists()
        )

    def test_keep_open_has_no_end_date_and_a_new_date_is_audited(self):
        kept = self._override("keep_open")
        self.assertEqual(kept.status_code, status.HTTP_200_OK, kept.content)
        self.purchase.refresh_from_db()
        self.assertIsNone(self.purchase.ends_at)
        self.assertTrue(
            ClubModuleAssignment.objects.filter(
                club=self.club,
                module_id=CLUB_MANAGEMENT_MODULE_ID,
                enabled=True,
            ).exists()
        )
        with patch("licenses.module_renewals.send_resend_email", return_value=(True, "")) as send:
            self.assertEqual(run_module_renewal_job(self.today), 0)
        self.assertFalse(send.called)
        new_end = (self.today + timedelta(days=40)).isoformat()
        changed = self._override("set_end", ends_at=new_end, reason="Season end")
        self.assertEqual(changed.status_code, status.HTTP_200_OK, changed.content)
        self.assertIsNone(changed.data["previous_ends_at"])
        self.assertEqual(changed.data["new_ends_at"], new_end)

    @patch("licenses.module_renewals.send_resend_email", return_value=(True, ""))
    def test_clearing_the_hold_does_not_send_a_missed_notice(self, send):
        self._override("switch_on")
        cleared = self._override("clear_hold")
        self.assertEqual(cleared.status_code, status.HTTP_200_OK, cleared.content)
        self.purchase.refresh_from_db()
        self.assertEqual(self.purchase.automation_hold, "")
        self.assertTrue(
            ModuleRenewalJournal.objects.filter(
                purchase=self.purchase,
                stage=ModuleRenewalJournal.Stage.RENEWAL_NOTICE,
            ).exists()
        )
        run_module_renewal_job(self.today)
        self.assertFalse(send.called)

    def test_cancel_leaves_a_module_that_another_purchase_still_grants(self):
        redeem_product_code(
            sign_payload(
                build_payload(module_ids=[COMPETITION_MODULE_ID], install_id=install_id_str())
            ),
            user=self.admin,
        )
        self.purchase.module_ids = [CLUB_MANAGEMENT_MODULE_ID, COMPETITION_MODULE_ID]
        self.purchase.save(update_fields=["module_ids"])
        set_club_assignment(club=self.club, module_id=COMPETITION_MODULE_ID, enabled=True, user=self.admin)
        ModulePurchase.objects.create(
            club=self.club,
            module_ids=[COMPETITION_MODULE_ID],
            description="Competition",
            price_snapshot=Decimal("40.00"),
            status=ModulePurchase.Status.ACTIVE,
            ends_at=None,
            automation_hold="grandfathered",
            source=ModulePurchase.Source.LEGACY,
            activated_at=timezone.now(),
        )
        cancelled = self._override("cancel")
        self.assertEqual(cancelled.status_code, status.HTTP_200_OK, cancelled.content)
        self.purchase.refresh_from_db()
        self.assertEqual(self.purchase.status, ModulePurchase.Status.CANCELLED)
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

    def test_switch_on_refuses_a_module_the_installation_does_not_have(self):
        InstallEntitlement.objects.filter(module_id=CLUB_MANAGEMENT_MODULE_ID).update(active=False)
        refused = self._override("switch_on")
        self.assertEqual(refused.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(ModulePurchaseOverride.objects.exists())
