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

from .models import ClubFeePrice, ClubFeeType, Invoice, License, LicenseType
from .module_fees import active_member_count, module_fee_quote, quote_price
from .pdf_utils import build_invoice_context, invoice_item_label


class ActiveMemberCountTests(APITestCase):
    def setUp(self):
        self.finance = User.objects.create_user(
            username="module-fee-finance",
            password="pass12345",
            role=User.Roles.LTF_FINANCE,
        )
        self.club = Club.objects.create(name="Counting Club", created_by=self.finance, is_active=True)
        self.other = Club.objects.create(name="Other Club", created_by=self.finance, is_active=True)
        self.license_type = LicenseType.objects.create(name="Module Annual", code="module-annual")
        self.year = timezone.localdate().year

    def _member(self, club, first, last, *, active=True):
        return Member.objects.create(
            club=club,
            first_name=first,
            last_name=last,
            is_active=active,
        )

    def _licence(self, member, club, *, year=None, status=License.Status.ACTIVE):
        return License.objects.create(
            member=member,
            club=club,
            license_type=self.license_type,
            year=year or self.year,
            status=status,
        )

    def test_counts_only_this_clubs_valid_licenses_for_the_year(self):
        counted = self._member(self.club, "Anne", "Reding")
        pending = self._member(self.club, "Jeff", "Lorang")
        inactive_record = self._member(self.club, "Mia", "Hoffmann", active=False)
        self._licence(counted, self.club, status=License.Status.ACTIVE)
        self._licence(pending, self.club, status=License.Status.PENDING)
        self._licence(inactive_record, self.club, status=License.Status.ACTIVE)

        expired = self._member(self.club, "Lea", "Weber")
        self._licence(expired, self.club, status=License.Status.EXPIRED)
        revoked = self._member(self.club, "Paul", "Schmit")
        self._licence(revoked, self.club, status=License.Status.REVOKED)
        other_year = self._member(self.club, "Nora", "Klein")
        self._licence(other_year, self.club, year=self.year - 1)
        moved = self._member(self.other, "Tom", "Meyer")
        self._licence(moved, self.club, status=License.Status.ACTIVE)
        away_licence = self._member(self.club, "Eva", "Simon")
        self._licence(away_licence, self.other, status=License.Status.ACTIVE)

        self.assertEqual(active_member_count(self.club.id, self.year), 3)
        self.assertEqual(active_member_count(self.other.id, self.year), 0)

    def test_staff_without_a_club_are_not_club_active_members(self):
        from members.models import LtfStaffFunction

        staff = Member.objects.create(club=None, first_name="Alex", last_name="Nagornyi", is_active=True)
        LtfStaffFunction.objects.create(member=staff, function=LtfStaffFunction.Function.MEDIA)
        License.objects.create(
            member=staff,
            club=None,
            license_type=self.license_type,
            year=self.year,
            status=License.Status.ACTIVE,
        )
        club_staff = self._member(self.club, "Andrea", "Secretary")
        LtfStaffFunction.objects.create(member=club_staff, function=LtfStaffFunction.Function.SECRETARY)
        self._licence(club_staff, self.club)

        self.assertEqual(active_member_count(self.club.id, self.year), 1)

    def test_flat_per_member_and_minimum(self):
        flat = quote_price(
            amount=Decimal("80.00"),
            pricing_type=ClubFeePrice.PricingType.FLAT,
            minimum_amount=None,
            active_members=10,
        )
        self.assertEqual(flat["charged_amount"], Decimal("80.00"))
        self.assertFalse(flat["minimum_applied"])
        self.assertIsNone(flat["active_member_count"])

        per_member = quote_price(
            amount=Decimal("2.00"),
            pricing_type=ClubFeePrice.PricingType.PER_ACTIVE_MEMBER,
            minimum_amount=None,
            active_members=48,
        )
        self.assertEqual(per_member["calculated_amount"], Decimal("96.00"))
        self.assertEqual(per_member["charged_amount"], Decimal("96.00"))
        self.assertEqual(per_member["active_member_count"], 48)
        self.assertFalse(per_member["minimum_applied"])

        with_minimum = quote_price(
            amount=Decimal("2.00"),
            pricing_type=ClubFeePrice.PricingType.PER_ACTIVE_MEMBER,
            minimum_amount=Decimal("150.00"),
            active_members=48,
        )
        self.assertEqual(with_minimum["calculated_amount"], Decimal("96.00"))
        self.assertEqual(with_minimum["charged_amount"], Decimal("150.00"))
        self.assertTrue(with_minimum["minimum_applied"])

        above_minimum = quote_price(
            amount=Decimal("2.00"),
            pricing_type=ClubFeePrice.PricingType.PER_ACTIVE_MEMBER,
            minimum_amount=Decimal("50.00"),
            active_members=48,
        )
        self.assertEqual(above_minimum["charged_amount"], Decimal("96.00"))
        self.assertFalse(above_minimum["minimum_applied"])


class ModuleFeeBillingTests(APITestCase):
    def setUp(self):
        self.client = APIClient()
        self.finance = User.objects.create_user(
            username="module-bill-finance",
            password="pass12345",
            role=User.Roles.LTF_FINANCE,
        )
        self.admin = User.objects.create_user(
            username="module-bill-admin",
            password="pass12345",
            role=User.Roles.LTF_ADMIN,
        )
        self.club = Club.objects.create(name="Billed Club", created_by=self.finance, is_active=True)
        self.plain = Club.objects.create(name="No Module Club", created_by=self.finance, is_active=True)
        self.inactive = Club.objects.create(name="Inactive Module Club", created_by=self.finance, is_active=False)
        self.license_type = LicenseType.objects.create(name="Billing Annual", code="billing-annual")
        self.year = timezone.localdate().year
        self.client.force_authenticate(user=self.finance)
        token = sign_payload(
            build_payload(
                module_ids=[CLUB_MANAGEMENT_MODULE_ID, EVENT_CALENDAR_MODULE_ID],
                install_id=install_id_str(),
            )
        )
        redeem_product_code(token, user=self.finance)
        set_club_assignment(club=self.club, module_id=CLUB_MANAGEMENT_MODULE_ID, enabled=True, user=self.finance)
        set_club_assignment(club=self.inactive, module_id=CLUB_MANAGEMENT_MODULE_ID, enabled=True, user=self.finance)

    def _licence(self, first, last, *, status=License.Status.ACTIVE, club=None):
        club = club or self.club
        member = Member.objects.create(club=club, first_name=first, last_name=last)
        return License.objects.create(
            member=member,
            club=club,
            license_type=self.license_type,
            year=self.year,
            status=status,
        )

    def _create_fee(self, **extra):
        payload = {
            "module_id": CLUB_MANAGEMENT_MODULE_ID,
            "initial_amount": "2.00",
            "initial_pricing_type": "per_active_member",
            "initial_effective_from": f"{self.year}-01-01",
        }
        payload.update(extra)
        response = self.client.post("/api/club-fee-types/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        return response.data

    def _bill(self, fee_id):
        with patch("licenses.tasks.send_invoice_email.delay"):
            return self.client.post(
                "/api/club-fee-billings/",
                {
                    "fee_type_ids": [fee_id],
                    "billed_on": str(timezone.localdate()),
                    "period_year": self.year,
                },
                format="json",
            )

    def test_bills_flat_and_skips_a_second_run(self):
        created = self._create_fee(initial_amount="100.00", initial_pricing_type="flat", initial_minimum_amount=None)
        response = self._bill(created["id"])
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data["invoice_count"], 1)
        self.assertEqual(Invoice.objects.filter(club=self.club).count(), 1)
        self.assertEqual(Invoice.objects.filter(club=self.plain).count(), 0)
        self.assertEqual(Invoice.objects.filter(club=self.inactive).count(), 0)
        invoice = Invoice.objects.get(club=self.club)
        item = invoice.order.items.get()
        self.assertEqual(invoice.total, Decimal("100.00"))
        self.assertEqual(item.description, f"Club management {self.year}")
        self.assertFalse(item.minimum_applied)
        self.assertIsNone(item.active_member_count)

        again = self._bill(created["id"])
        self.assertEqual(again.status_code, status.HTTP_201_CREATED)
        self.assertEqual(again.data["invoice_count"], 0)
        self.assertEqual(again.data["skipped"][0]["reason"], "already_billed")
        self.assertEqual(Invoice.objects.filter(club=self.club).count(), 1)

    def test_per_member_line_snapshots_the_count(self):
        self._licence("Anne", "Reding")
        self._licence("Jeff", "Lorang", status=License.Status.PENDING)
        self._licence("Lea", "Weber", status=License.Status.EXPIRED)
        created = self._create_fee()
        response = self._bill(created["id"])
        self.assertEqual(response.data["invoice_count"], 1)
        item = Invoice.objects.get(club=self.club).order.items.get()
        self.assertEqual(item.active_member_count, 2)
        self.assertEqual(item.quantity, 2)
        self.assertEqual(item.price_snapshot, Decimal("2.00"))
        self.assertEqual(item.charged_amount, Decimal("4.00"))
        self.assertEqual(item.description, "Club management: 2 active members × €2.00")
        self.assertEqual(invoice_item_label(item), item.description)
        self.assertFalse(item.minimum_applied)
        context = build_invoice_context(item.order.invoice)
        self.assertEqual(context["items"][0]["line_total"], Decimal("4.00"))

    def test_minimum_fee_replaces_a_lower_calculated_amount(self):
        self._licence("Anne", "Reding")
        created = self._create_fee(initial_minimum_amount="150.00")
        response = self._bill(created["id"])
        self.assertEqual(response.data["invoice_count"], 1)
        invoice = Invoice.objects.get(club=self.club)
        item = invoice.order.items.get()
        self.assertEqual(invoice.total, Decimal("150.00"))
        self.assertTrue(item.minimum_applied)
        self.assertEqual(item.active_member_count, 1)
        self.assertEqual(item.charged_amount, Decimal("150.00"))
        self.assertIn("1 active members × €2.00", item.description)
        self.assertIn("Minimum fee applied", item.description)
        context = build_invoice_context(invoice)
        self.assertEqual(context["items"][0]["line_total"], Decimal("150.00"))
        self.assertEqual(context["items"][0]["label"], item.description)

    def test_zero_members_without_a_minimum_creates_no_invoice(self):
        created = self._create_fee()
        response = self._bill(created["id"])
        self.assertEqual(response.data["invoice_count"], 0)
        self.assertEqual(Invoice.objects.count(), 0)

    def test_zero_members_with_a_minimum_charges_the_minimum(self):
        created = self._create_fee(initial_minimum_amount="40.00")
        response = self._bill(created["id"])
        self.assertEqual(response.data["invoice_count"], 1)
        item = Invoice.objects.get(club=self.club).order.items.get()
        self.assertEqual(item.active_member_count, 0)
        self.assertEqual(item.charged_amount, Decimal("40.00"))
        self.assertTrue(item.minimum_applied)

    def test_payment_leaves_the_module_switched_on(self):
        created = self._create_fee(initial_amount="100.00", initial_pricing_type="flat")
        billed = self._bill(created["id"])
        self.assertEqual(billed.data["invoice_count"], 1)
        invoice = Invoice.objects.get(club=self.club)
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
        self.assertEqual(paid.status_code, status.HTTP_200_OK, paid.data)
        invoice.refresh_from_db()
        self.assertEqual(invoice.status, Invoice.Status.PAID)
        self.assertFalse(License.objects.filter(order_items__order_id=invoice.order_id).exists())
        assignment = ClubModuleAssignment.objects.get(club=self.club, module_id=CLUB_MANAGEMENT_MODULE_ID)
        self.assertTrue(assignment.enabled)

    def test_preview_is_rejected_and_a_module_can_have_only_one_fee(self):
        preview = self.client.post(
            "/api/club-fee-types/",
            {"module_id": "preview", "initial_amount": "10.00"},
            format="json",
        )
        self.assertEqual(preview.status_code, status.HTTP_400_BAD_REQUEST)
        first = self._create_fee(initial_amount="10.00", initial_pricing_type="flat")
        self.assertEqual(first["name"], "Club management")
        self.assertEqual(first["cadence"], "annual")
        second = self.client.post(
            "/api/club-fee-types/",
            {"module_id": CLUB_MANAGEMENT_MODULE_ID, "initial_amount": "12.00"},
            format="json",
        )
        self.assertEqual(second.status_code, status.HTTP_400_BAD_REQUEST)

    def test_invoiced_fee_is_switched_off_instead_of_deleted(self):
        created = self._create_fee(initial_amount="100.00", initial_pricing_type="flat")
        self._bill(created["id"])
        removed = self.client.delete(f"/api/club-fee-types/{created['id']}/")
        self.assertEqual(removed.status_code, status.HTTP_200_OK)
        self.assertFalse(removed.data["is_active"])
        self.assertTrue(ClubFeeType.objects.filter(id=created["id"]).exists())
        self.assertEqual(Invoice.objects.filter(club=self.club).count(), 1)

        fresh = self._create_fee(
            module_id=EVENT_CALENDAR_MODULE_ID,
            initial_amount="20.00",
            initial_pricing_type="flat",
        )
        deleted = self.client.delete(f"/api/club-fee-types/{fresh['id']}/")
        self.assertEqual(deleted.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(ClubFeeType.objects.filter(id=fresh["id"]).exists())

    def test_only_finance_can_edit_and_club_admin_can_read_without_a_module(self):
        created = self._create_fee(initial_amount="80.00", initial_pricing_type="flat", initial_minimum_amount="100.00")
        self._licence("Anne", "Reding")
        club_admin = User.objects.create_user(
            username="module-club-admin",
            password="pass12345",
            role=User.Roles.CLUB_ADMIN,
        )
        self.club.admins.add(club_admin)
        other_admin = User.objects.create_user(
            username="module-other-admin",
            password="pass12345",
            role=User.Roles.CLUB_ADMIN,
        )
        self.plain.admins.add(other_admin)
        coach = User.objects.create_user(
            username="module-coach",
            password="pass12345",
            role=User.Roles.COACH,
        )
        self.club.trainers.add(coach)

        self.client.force_authenticate(user=club_admin)
        quote = self.client.get(f"/api/clubs/{self.club.id}/module-fees/")
        self.assertEqual(quote.status_code, status.HTTP_200_OK, quote.data)
        by_id = {row["module_id"]: row for row in quote.data["modules"]}
        self.assertEqual(set(by_id), {CLUB_MANAGEMENT_MODULE_ID, COMPETITION_MODULE_ID, EVENT_CALENDAR_MODULE_ID})
        self.assertTrue(by_id[CLUB_MANAGEMENT_MODULE_ID]["enabled"])
        self.assertFalse(by_id[EVENT_CALENDAR_MODULE_ID]["enabled"])
        self.assertEqual(by_id[CLUB_MANAGEMENT_MODULE_ID]["pricing_type"], "flat")
        self.assertEqual(by_id[CLUB_MANAGEMENT_MODULE_ID]["amount"], "80.00")
        self.assertEqual(by_id[CLUB_MANAGEMENT_MODULE_ID]["minimum_amount"], "100.00")
        self.assertEqual(by_id[CLUB_MANAGEMENT_MODULE_ID]["estimated_amount"], "100.00")
        self.assertTrue(by_id[CLUB_MANAGEMENT_MODULE_ID]["minimum_applied"])
        self.assertEqual(quote.data["active_member_count"], 1)
        self.assertTrue(quote.data["estimate"])

        bare = Club.objects.create(name="Bare Club", created_by=self.finance, is_active=True)
        bare.admins.add(club_admin)
        bare_quote = self.client.get(f"/api/clubs/{bare.id}/module-fees/")
        self.assertEqual(bare_quote.status_code, status.HTTP_200_OK)
        self.assertTrue(all(not row["enabled"] for row in bare_quote.data["modules"]))

        forbidden = self.client.post(
            "/api/club-fee-types/",
            {"module_id": EVENT_CALENDAR_MODULE_ID, "initial_amount": "5.00"},
            format="json",
        )
        self.assertEqual(forbidden.status_code, status.HTTP_403_FORBIDDEN)
        price_forbidden = self.client.post(
            "/api/club-fee-prices/",
            {"fee_type": created["id"], "amount": "9.00", "effective_from": f"{self.year}-02-01"},
            format="json",
        )
        self.assertEqual(price_forbidden.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(user=other_admin)
        hidden = self.client.get(f"/api/clubs/{self.club.id}/module-fees/")
        self.assertEqual(hidden.status_code, status.HTTP_404_NOT_FOUND)

        self.client.force_authenticate(user=coach)
        coach_quote = self.client.get(f"/api/clubs/{self.club.id}/module-fees/")
        self.assertEqual(coach_quote.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(user=self.admin)
        admin_price = self.client.post(
            "/api/club-fee-prices/",
            {
                "fee_type": created["id"],
                "amount": "9.00",
                "pricing_type": "flat",
                "effective_from": f"{self.year}-02-01",
            },
            format="json",
        )
        self.assertEqual(admin_price.status_code, status.HTTP_403_FORBIDDEN)

        direct = module_fee_quote(self.club, as_of=date(self.year, 6, 1), year=self.year)
        self.assertEqual(direct["modules"][0]["module_id"], CLUB_MANAGEMENT_MODULE_ID)
