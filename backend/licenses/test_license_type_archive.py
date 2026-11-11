from decimal import Decimal

from django.utils import timezone
from rest_framework.test import APITestCase

from accounts.models import User
from clubs.models import Club
from licenses.models import Invoice, License, LicensePrice, LicenseType, LicenseTypePolicy, Order, OrderItem
from licenses.pdf_utils import build_invoice_context
from members.models import Member


class LicenseTypeArchiveTests(APITestCase):
    def setUp(self):
        self.finance = User.objects.create_user(
            username="archive-finance",
            password="pass12345",
            role=User.Roles.LTF_FINANCE,
        )
        self.ltf_admin = User.objects.create_user(
            username="archive-ltf",
            password="pass12345",
            role=User.Roles.LTF_ADMIN,
        )
        self.club_admin = User.objects.create_user(
            username="archive-club",
            password="pass12345",
            role=User.Roles.CLUB_ADMIN,
        )
        self.club = Club.objects.create(name="Archive Club", created_by=self.finance)
        self.club.admins.add(self.club_admin)
        self.member = Member.objects.create(club=self.club, first_name="Ada", last_name="Archive")

    def _type(self, name, code):
        return LicenseType.objects.create(name=name, code=code)

    def test_unused_type_is_removed(self):
        license_type = self._type("Unused Annual", "unused-annual")
        LicenseTypePolicy.objects.create(license_type=license_type)
        self.client.force_authenticate(user=self.finance)
        response = self.client.delete(f"/api/license-types/{license_type.id}/")
        self.assertEqual(response.status_code, 204)
        self.assertFalse(LicenseType.objects.filter(id=license_type.id).exists())

    def test_in_use_type_is_hidden_and_old_records_keep_the_name(self):
        license_type = self._type("Kept Annual", "kept-annual")
        license_record = License.objects.create(
            member=self.member,
            club=self.club,
            license_type=license_type,
            year=2026,
            status=License.Status.ACTIVE,
        )
        LicensePrice.objects.create(
            license_type=license_type,
            amount=Decimal("35.00"),
            currency="EUR",
            effective_from=timezone.localdate(),
        )
        order = Order.objects.create(
            club=self.club,
            member=self.member,
            ledger=Order.Ledger.FEDERATION,
            status=Order.Status.PAID,
            currency="EUR",
            subtotal=Decimal("35.00"),
            tax_total=Decimal("0.00"),
            total=Decimal("35.00"),
        )
        OrderItem.objects.create(
            order=order,
            license=license_record,
            description="Kept Annual",
            price_snapshot=Decimal("35.00"),
        )
        invoice = Invoice.objects.create(
            order=order,
            club=self.club,
            member=self.member,
            status=Invoice.Status.PAID,
            currency="EUR",
            subtotal=Decimal("35.00"),
            tax_total=Decimal("0.00"),
            total=Decimal("35.00"),
            issued_at=timezone.now(),
        )
        self.client.force_authenticate(user=self.finance)
        listed_before = self.client.get("/api/license-types/")
        self.assertTrue(any(row["id"] == license_type.id and row["in_use"] for row in listed_before.data))

        removed = self.client.delete(f"/api/license-types/{license_type.id}/")
        self.assertEqual(removed.status_code, 200)
        self.assertTrue(removed.data["archived"])

        listed = self.client.get("/api/license-types/")
        self.assertFalse(any(row["id"] == license_type.id for row in listed.data))
        license_type.refresh_from_db()
        self.assertIsNotNone(license_type.archived_at)
        self.assertEqual(license_type.name, "Kept Annual")

        self.client.force_authenticate(user=self.ltf_admin)
        license_row = self.client.get(f"/api/licenses/{license_record.id}/")
        self.assertEqual(license_row.status_code, 200)
        self.assertEqual(license_row.data["license_type_name"], "Kept Annual")
        self.client.force_authenticate(user=self.finance)
        self.assertTrue(LicensePrice.objects.filter(license_type=license_type, amount=Decimal("35.00")).exists())
        prices = self.client.get("/api/license-prices/")
        self.assertTrue(
            any(row["license_type"] == license_type.id and row["license_type_name"] == "Kept Annual" for row in prices.data)
        )
        context = build_invoice_context(invoice)
        self.assertIn("Kept Annual", str(context))
        self.assertTrue(Invoice.objects.filter(id=invoice.id).exists())
        self.assertTrue(Order.objects.filter(id=order.id).exists())

        self.client.force_authenticate(user=self.ltf_admin)
        new_license = self.client.post(
            "/api/licenses/",
            {
                "member": self.member.id,
                "club": self.club.id,
                "license_type": license_type.id,
                "year": 2027,
                "status": "pending",
            },
            format="json",
        )
        self.assertEqual(new_license.status_code, 400)
        self.client.force_authenticate(user=self.finance)
        new_price = self.client.post(
            "/api/license-prices/",
            {
                "license_type": license_type.id,
                "amount": "40.00",
                "currency": "EUR",
                "effective_from": "2026-11-11",
            },
            format="json",
        )
        self.assertEqual(new_price.status_code, 400)
        self.assertEqual(LicensePrice.objects.filter(license_type=license_type).count(), 1)

    def test_only_finance_can_remove_a_license_type(self):
        license_type = self._type("Guarded Annual", "guarded-annual")
        self.client.force_authenticate(user=self.ltf_admin)
        admin = self.client.delete(f"/api/license-types/{license_type.id}/")
        self.assertEqual(admin.status_code, 403)
        self.client.force_authenticate(user=self.club_admin)
        club = self.client.delete(
            f"/api/license-types/{license_type.id}/",
            HTTP_X_DESK=f"club_admin:{self.club.id}",
        )
        self.assertEqual(club.status_code, 403)
        self.assertTrue(LicenseType.objects.filter(id=license_type.id, archived_at__isnull=True).exists())
