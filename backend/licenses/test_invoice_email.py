from decimal import Decimal
from unittest.mock import patch

from django.test import TestCase

from accounts.models import User
from clubs.models import Club
from members.models import Member

from .models import CreditNote, Invoice, Order, Payment
from .pdf_utils import build_invoice_context
from .tasks import send_invoice_email, send_invoice_reminder_email


class InvoiceEmailAmountTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            username="invoice-mail-admin",
            password="pass12345",
            role=User.Roles.LTF_ADMIN,
        )
        self.club = Club.objects.create(
            name="North Crane Club",
            created_by=self.admin,
            email="office@northcrane.example",
        )
        self.member = Member.objects.create(
            club=self.club,
            first_name="Nora",
            last_name="Keller",
            email="nora@example.com",
        )

    def _invoice(self, *, total, ledger=Order.Ledger.FEDERATION, status=Invoice.Status.ISSUED, **extra):
        order = Order.objects.create(
            club=self.club,
            member=self.member,
            ledger=ledger,
            status=Order.Status.PENDING,
            subtotal=total,
            tax_total=Decimal("0.00"),
            total=total,
        )
        return Invoice.objects.create(
            order=order,
            club=self.club,
            member=self.member,
            status=status,
            subtotal=total,
            tax_total=Decimal("0.00"),
            total=total,
            **extra,
        )

    def _sent_text(self, send):
        self.assertTrue(send.called)
        return send.call_args.args[3]

    @patch("licenses.tasks.render_invoice_pdf", return_value=b"%PDF-test")
    @patch("licenses.tasks.send_resend_email", return_value=(True, ""))
    def test_paid_licence_invoice_email_matches_the_pdf_total(self, send, _pdf):
        invoice = self._invoice(total=Decimal("80.00"), status=Invoice.Status.PAID)
        Payment.objects.create(
            invoice=invoice,
            order=invoice.order,
            amount=Decimal("80.00"),
            status=Payment.Status.PAID,
        )
        self.assertEqual(invoice.outstanding(), Decimal("0.00"))
        printed = build_invoice_context(invoice)["total_amount"]

        send_invoice_email(invoice.id)

        text = self._sent_text(send)
        self.assertIn(f"Total due: {printed}", text)
        self.assertIn("80,00 €", text)
        self.assertNotIn("Total due: 0,00 €", text)
        self.assertNotIn("0.00", text)

    @patch("licenses.tasks.render_invoice_pdf", return_value=b"%PDF-test")
    @patch("licenses.tasks.send_resend_email", return_value=(True, ""))
    def test_club_invoice_email_matches_the_pdf_total(self, send, _pdf):
        invoice = self._invoice(
            total=Decimal("45.50"),
            ledger=Order.Ledger.CLUB,
            delivery_method=Invoice.DeliveryMethod.EMAIL,
            bill_to_email="payer@example.com",
        )
        printed = build_invoice_context(invoice)["total_amount"]

        send_invoice_email(invoice.id, ["payer@example.com"])

        text = self._sent_text(send)
        self.assertIn(f"Total due: {printed}", text)
        self.assertIn("45,50 €", text)
        self.assertEqual(send.call_args.args[0], "payer@example.com")

    @patch("licenses.tasks.render_invoice_pdf", return_value=b"%PDF-test")
    @patch("licenses.tasks.send_resend_email", return_value=(True, ""))
    def test_reminder_uses_the_balance_after_payments_and_credits(self, send, _pdf):
        invoice = self._invoice(total=Decimal("100.00"))
        Payment.objects.create(
            invoice=invoice,
            order=invoice.order,
            amount=Decimal("40.00"),
            status=Payment.Status.PAID,
        )
        CreditNote.objects.create(invoice=invoice, amount=Decimal("10.00"), reason="Goodwill")

        send_invoice_reminder_email(invoice.id)

        text = self._sent_text(send)
        self.assertIn("Amount still due: 50,00 €", text)
        self.assertNotIn("100,00 €", text)
        self.assertNotIn("Amount still due: 0,00 €", text)

    @patch("licenses.tasks.render_invoice_pdf", return_value=b"%PDF-test")
    @patch("licenses.tasks.send_resend_email", return_value=(True, ""))
    def test_amount_is_translated_and_keeps_the_pdf_format(self, send, _pdf):
        invoice = self._invoice(total=Decimal("80.00"), status=Invoice.Status.PAID)
        Payment.objects.create(
            invoice=invoice,
            order=invoice.order,
            amount=Decimal("80.00"),
            status=Payment.Status.PAID,
        )
        Club.objects.filter(pk=self.club.pk).update(communication_language="lb")

        send_invoice_email(invoice.id)
        self.assertIn("Total ze bezuelen: 80,00 €", self._sent_text(send))

        send.reset_mock()
        Club.objects.filter(pk=self.club.pk).update(communication_language="fr")
        send_invoice_email(invoice.id)
        self.assertIn("Montant dû : 80,00 €", self._sent_text(send))

        send.reset_mock()
        Club.objects.filter(pk=self.club.pk).update(communication_language="de")
        send_invoice_email(invoice.id)
        self.assertIn("Fälliger Betrag: 80,00 €", self._sent_text(send))
