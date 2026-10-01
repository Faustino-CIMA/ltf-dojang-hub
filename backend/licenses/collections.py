from datetime import timedelta
from decimal import Decimal

from django.utils import timezone
from rest_framework.exceptions import ValidationError

from .models import CreditNote, FinanceAuditLog, Invoice, Order

REMINDER_COOLDOWN = timedelta(days=3)


def create_credit_note(invoice: Invoice, *, amount: Decimal, reason: str, actor=None) -> CreditNote:
    if invoice.status not in {Invoice.Status.DRAFT, Invoice.Status.ISSUED}:
        raise ValidationError({"detail": "Credit notes can only be added to unpaid invoices."})
    outstanding = invoice.outstanding()
    if amount <= 0:
        raise ValidationError({"amount": "Enter an amount greater than zero."})
    if amount > outstanding:
        raise ValidationError({"amount": "Credit cannot exceed the outstanding balance."})
    note = CreditNote.objects.create(
        invoice=invoice,
        amount=amount,
        reason=reason.strip(),
        created_by=actor if actor and getattr(actor, "is_authenticated", False) else None,
    )
    FinanceAuditLog.objects.create(
        action="invoice.credited",
        message=f"Credit note {note.credit_number} for {note.amount} {invoice.currency}.",
        actor=note.created_by,
        club=invoice.club,
        member=invoice.member,
        order=invoice.order,
        invoice=invoice,
        metadata={
            "credit_note_id": note.id,
            "amount": str(note.amount),
            "reason": note.reason,
            "outstanding": str(invoice.outstanding()),
        },
    )
    settle_invoice_if_cleared(invoice, actor=actor)
    return note


def settle_invoice_if_cleared(invoice: Invoice, *, actor=None) -> Invoice:
    """When credits (and payments) cover the total, close the invoice and activate licenses."""
    invoice = reload_invoice(invoice)
    if invoice.status == Invoice.Status.VOID:
        return invoice
    if invoice.outstanding() > 0:
        return invoice
    if invoice.status == Invoice.Status.PAID and invoice.order.status == Order.Status.PAID:
        return invoice
    from .services import apply_payment_and_activate

    apply_payment_and_activate(
        invoice.order,
        actor=actor,
        message="Invoice settled by credit note.",
        record_payment=False,
    )
    return reload_invoice(invoice)


def can_send_reminder(invoice: Invoice) -> tuple[bool, str]:
    if invoice.status != Invoice.Status.ISSUED:
        return False, "Reminders can only be sent for issued invoices."
    if invoice.outstanding() <= 0:
        return False, "This invoice has no outstanding balance."
    if invoice.last_reminded_at and timezone.now() - invoice.last_reminded_at < REMINDER_COOLDOWN:
        return False, "A reminder was already sent recently."
    return True, ""


def mark_invoice_reminded(invoice: Invoice, actor=None) -> None:
    invoice.last_reminded_at = timezone.now()
    invoice.save(update_fields=["last_reminded_at", "updated_at"])
    FinanceAuditLog.objects.create(
        action="invoice.reminder_queued",
        message=f"Payment reminder queued for {invoice.invoice_number}.",
        actor=actor if actor and getattr(actor, "is_authenticated", False) else None,
        club=invoice.club,
        member=invoice.member,
        order=invoice.order,
        invoice=invoice,
    )


def reload_invoice(invoice: Invoice) -> Invoice:
    return (
        Invoice.objects.select_related("club", "member", "order")
        .prefetch_related("credit_notes", "payments")
        .get(pk=invoice.pk)
    )


def assert_ledger_for_actor(invoice: Invoice, *, club_side: bool) -> None:
    ledger = invoice.order.ledger if invoice.order_id else Order.Ledger.FEDERATION
    if club_side and ledger != Order.Ledger.CLUB:
        raise ValidationError({"detail": "Federation invoices are managed in LTF Finance."})
    if not club_side and ledger != Order.Ledger.FEDERATION:
        raise ValidationError({"detail": "Club invoices are confidential to the club."})
