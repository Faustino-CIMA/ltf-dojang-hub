from decimal import Decimal

from django.utils import timezone
from rest_framework.test import APITestCase

from accounts.models import DeskGrant, User
from clubs.models import Club
from licenses.models import (
    CardFormatPreset,
    CardTemplate,
    CardTemplateVersion,
    Invoice,
    License,
    LicenseHistoryEvent,
    LicenseType,
    Order,
    OrderItem,
    Payment,
    PrintJob,
    PrintJobItem,
)
from members.models import Member


class LicenseDeleteTests(APITestCase):
    def setUp(self):
        self.ltf = User.objects.create_user(
            username="license-delete-ltf",
            password="pass12345",
            role=User.Roles.LTF_ADMIN,
        )
        self.club_admin = User.objects.create_user(
            username="license-delete-club",
            password="pass12345",
            role=User.Roles.CLUB_ADMIN,
        )
        self.club_a = Club.objects.create(name="Delete Club A", created_by=self.ltf)
        self.club_b = Club.objects.create(name="Delete Club B", created_by=self.ltf)
        self.club_a.admins.add(self.club_admin)
        self.club_a.admins.add(self.ltf)
        self.license_type = LicenseType.objects.create(name="Delete Annual", code="delete-annual")
        self.member_a = Member.objects.create(club=self.club_a, first_name="Ada", last_name="Sample")
        self.member_b = Member.objects.create(club=self.club_b, first_name="Bea", last_name="Sample")

    def _license(self, member, club):
        return License.objects.create(
            member=member,
            club=club,
            license_type=self.license_type,
            year=2026,
            status=License.Status.ACTIVE,
        )

    def test_plain_license_deletes_and_leaves_the_member(self):
        license_record = self._license(self.member_a, self.club_a)
        LicenseHistoryEvent.objects.create(
            member=self.member_a,
            license=license_record,
            club=self.club_a,
            actor=self.ltf,
            event_type=LicenseHistoryEvent.EventType.ISSUED,
            license_year=2026,
            status_after=license_record.status,
            club_name_snapshot=self.club_a.name,
        )
        self.client.force_authenticate(user=self.ltf)
        response = self.client.delete(f"/api/licenses/{license_record.id}/")
        self.assertEqual(response.status_code, 204)
        self.assertFalse(License.objects.filter(id=license_record.id).exists())
        self.assertFalse(LicenseHistoryEvent.objects.filter(license_id=license_record.id).exists())
        self.assertTrue(Member.objects.filter(id=self.member_a.id).exists())

    def test_invoiced_license_stays_with_its_invoice_and_payment(self):
        license_record = self._license(self.member_a, self.club_a)
        order = Order.objects.create(
            club=self.club_a,
            member=self.member_a,
            ledger=Order.Ledger.FEDERATION,
            status=Order.Status.PAID,
            currency="EUR",
            subtotal=Decimal("40.00"),
            tax_total=Decimal("0.00"),
            total=Decimal("40.00"),
        )
        OrderItem.objects.create(
            order=order,
            license=license_record,
            description="Annual license",
            price_snapshot=Decimal("40.00"),
            quantity=1,
        )
        invoice = Invoice.objects.create(
            order=order,
            club=self.club_a,
            member=self.member_a,
            status=Invoice.Status.PAID,
            currency="EUR",
            subtotal=Decimal("40.00"),
            tax_total=Decimal("0.00"),
            total=Decimal("40.00"),
            issued_at=timezone.now(),
            paid_at=timezone.now(),
        )
        payment = Payment.objects.create(
            invoice=invoice,
            order=order,
            amount=Decimal("40.00"),
            currency="EUR",
            status=Payment.Status.PAID,
            paid_at=timezone.now(),
        )
        self.client.force_authenticate(user=self.ltf)
        response = self.client.delete(f"/api/licenses/{license_record.id}/")
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["detail"], "license_in_use")
        self.assertTrue(License.objects.filter(id=license_record.id).exists())
        self.assertTrue(Order.objects.filter(id=order.id).exists())
        self.assertTrue(OrderItem.objects.filter(license=license_record).exists())
        self.assertTrue(Invoice.objects.filter(id=invoice.id).exists())
        self.assertTrue(Payment.objects.filter(id=payment.id).exists())

    def test_print_job_keeps_the_license(self):
        license_record = self._license(self.member_a, self.club_a)
        template = CardTemplate.objects.create(name="Delete cards", created_by=self.ltf)
        version = CardTemplateVersion.objects.create(
            template=template,
            version_number=1,
            status=CardTemplateVersion.Status.PUBLISHED,
            card_format=CardFormatPreset.objects.get(code="3c"),
            design_payload={"elements": []},
            created_by=self.ltf,
            published_by=self.ltf,
            published_at=timezone.now(),
        )
        job = PrintJob.objects.create(
            club=self.club_a,
            template_version=version,
            total_items=1,
            requested_by=self.ltf,
        )
        PrintJobItem.objects.create(print_job=job, member=self.member_a, license=license_record)
        self.client.force_authenticate(user=self.ltf)
        response = self.client.delete(f"/api/licenses/{license_record.id}/")
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["detail"], "license_in_use")
        self.assertTrue(License.objects.filter(id=license_record.id).exists())
        self.assertTrue(PrintJob.objects.filter(id=job.id).exists())
        self.assertTrue(PrintJobItem.objects.filter(license=license_record).exists())

    def test_club_desk_cannot_delete_another_clubs_license(self):
        own = self._license(self.member_a, self.club_a)
        other = self._license(self.member_b, self.club_b)
        DeskGrant.objects.create(
            user=self.ltf,
            desk=DeskGrant.Desk.CLUB_ADMIN,
            club=self.club_a,
            level=DeskGrant.Level.FULL,
            source=DeskGrant.Source.LEGACY,
            valid_from=timezone.localdate(),
        )
        self.client.force_authenticate(user=self.ltf)
        refused = self.client.delete(
            f"/api/licenses/{other.id}/",
            HTTP_X_DESK=f"club_admin:{self.club_a.id}",
        )
        self.assertEqual(refused.status_code, 404)
        self.assertTrue(License.objects.filter(id=other.id).exists())
        allowed = self.client.delete(
            f"/api/licenses/{own.id}/",
            HTTP_X_DESK=f"club_admin:{self.club_a.id}",
        )
        self.assertEqual(allowed.status_code, 204)
        self.assertFalse(License.objects.filter(id=own.id).exists())

    def test_club_admin_still_cannot_delete(self):
        license_record = self._license(self.member_a, self.club_a)
        self.client.force_authenticate(user=self.club_admin)
        response = self.client.delete(
            f"/api/licenses/{license_record.id}/",
            HTTP_X_DESK=f"club_admin:{self.club_a.id}",
        )
        self.assertEqual(response.status_code, 403)
        self.assertTrue(License.objects.filter(id=license_record.id).exists())
