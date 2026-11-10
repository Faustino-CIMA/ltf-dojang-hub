from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

from django.utils import timezone
from rest_framework.test import APITestCase

from accounts.models import DeskGrant, User
from clubs.models import Club
from licenses.models import Invoice, Order


def _invoice(club, *, ledger, issued_at):
    order = Order.objects.create(
        club=club,
        ledger=ledger,
        status=Order.Status.PENDING,
        currency="EUR",
        subtotal=Decimal("25.00"),
        tax_total=Decimal("0.00"),
        total=Decimal("25.00"),
    )
    return Invoice.objects.create(
        order=order,
        club=club,
        status=Invoice.Status.ISSUED,
        currency="EUR",
        subtotal=Decimal("25.00"),
        tax_total=Decimal("0.00"),
        total=Decimal("25.00"),
        issued_at=issued_at,
    )


@patch("licenses.views.render_invoice_pdf", return_value=b"%PDF-1.4 test")
class InvoicePdfDeskTests(APITestCase):
    def setUp(self):
        self.finance = User.objects.create_user(
            username="pdf-finance",
            password="pass12345",
            role=User.Roles.LTF_FINANCE,
        )
        self.club_admin = User.objects.create_user(
            username="pdf-club-admin",
            password="pass12345",
            role=User.Roles.CLUB_ADMIN,
        )
        self.club_a = Club.objects.create(name="PDF Club A", created_by=self.finance)
        self.club_b = Club.objects.create(name="PDF Club B", created_by=self.finance)
        self.club_a.admins.add(self.club_admin)
        DeskGrant.objects.create(
            user=self.club_admin,
            desk=DeskGrant.Desk.LTF_FINANCE,
            level=DeskGrant.Level.FULL,
            source=DeskGrant.Source.LEGACY,
            valid_from=timezone.localdate(),
        )
        overdue = timezone.now() - timedelta(days=8)
        self.federation_a = _invoice(self.club_a, ledger=Order.Ledger.FEDERATION, issued_at=overdue)
        self.federation_b = _invoice(self.club_b, ledger=Order.Ledger.FEDERATION, issued_at=overdue)
        self.club_ledger_b = _invoice(self.club_b, ledger=Order.Ledger.CLUB, issued_at=overdue)

    def _listed_ids(self, user, **headers):
        self.client.force_authenticate(user=user)
        response = self.client.get("/api/invoices/?issue=overdue_7d", **headers)
        self.assertEqual(response.status_code, 200, getattr(response, "data", None))
        rows = response.data if isinstance(response.data, list) else response.data["results"]
        return {row["id"] for row in rows}

    def test_finance_role_opens_any_club_on_the_overdue_list(self, _pdf):
        listed = self._listed_ids(self.finance)
        self.assertIn(self.federation_a.id, listed)
        self.assertIn(self.federation_b.id, listed)
        self.assertNotIn(self.club_ledger_b.id, listed)
        for invoice in (self.federation_a, self.federation_b):
            pdf = self.client.get(f"/api/invoices/{invoice.id}/pdf/")
            self.assertEqual(pdf.status_code, 200, getattr(pdf, "data", pdf.content[:80]))
            self.assertTrue(pdf.content.startswith(b"%PDF"))
        refused = self.client.get(f"/api/invoices/{self.club_ledger_b.id}/pdf/")
        self.assertEqual(refused.status_code, 403)

    def test_finance_desk_opens_another_clubs_invoice(self, _pdf):
        header = {"HTTP_X_DESK": "ltf_finance"}
        listed = self._listed_ids(self.club_admin, **header)
        self.assertIn(self.federation_b.id, listed)
        pdf = self.client.get(f"/api/invoices/{self.federation_b.id}/pdf/", **header)
        self.assertEqual(pdf.status_code, 200, getattr(pdf, "data", pdf.content[:80]))
        self.assertTrue(pdf.content.startswith(b"%PDF"))

    def test_club_desk_cannot_open_another_clubs_invoice(self, _pdf):
        header = {"HTTP_X_DESK": f"club_admin:{self.club_a.id}"}
        self.client.force_authenticate(user=self.club_admin)
        other = self.client.get(f"/api/invoices/{self.federation_b.id}/pdf/", **header)
        self.assertIn(other.status_code, (403, 404))
        own = self.client.get(f"/api/invoices/{self.federation_a.id}/pdf/", **header)
        self.assertEqual(own.status_code, 200, getattr(own, "data", own.content[:80]))
        self.assertTrue(own.content.startswith(b"%PDF"))
