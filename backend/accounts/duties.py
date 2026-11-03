"""Separation of duties. Read-only desks cannot write, so they are not approvers or payers."""

from __future__ import annotations

from datetime import timedelta

from django.db.models import Q
from django.utils import timezone

from .models import DeskGrant

OWN_CLUB = "own_club_override"
OWN_INVOICE = "own_invoice_payment"
MAX_EXCEPTION_DAYS = 90


def _today():
    return timezone.localdate()


def acting_full(request, desk: str) -> bool:
    grant = getattr(request, "desk_grant", None)
    if grant is not None:
        return grant.desk == desk and grant.level == DeskGrant.Level.FULL
    if str(request.META.get("HTTP_X_DESK") or "").strip():
        return False
    return getattr(request.user, "role", "") == desk


def exception_open(*, user_id: int, rule: str, club_id: int | None = None, invoice_id: int | None = None) -> bool:
    from licenses.models import DutyException

    today = _today()
    qs = DutyException.objects.filter(user_id=user_id, rule=rule, valid_from__lte=today).filter(
        Q(valid_until__isnull=True) | Q(valid_until__gt=today)
    )
    if rule == OWN_CLUB:
        qs = qs.filter(club_id=club_id)
    else:
        qs = qs.filter(invoice_id=invoice_id)
    return qs.exists()


def _finance_refusal(request, action: str, message: str, *, club_id=None, invoice=None, order=None) -> None:
    from licenses.models import FinanceAuditLog
    from ops.models import OpsAuditLog

    FinanceAuditLog.objects.create(
        action=action,
        message=message,
        actor=request.user if getattr(request.user, "is_authenticated", False) else None,
        club_id=club_id,
        invoice=invoice,
        order=order,
        metadata={"rule": action},
    )
    OpsAuditLog.objects.create(
        actor=request.user if getattr(request.user, "is_authenticated", False) else None,
        action=action,
        target_type="invoice" if invoice is not None else "club",
        target_id=str(getattr(invoice, "id", None) or club_id or ""),
        message=message,
        metadata={"club_id": club_id, "invoice_id": getattr(invoice, "id", None)},
    )


def refuse_own_club_override(request, club_id: int | None) -> str | None:
    if club_id is None or not acting_full(request, DeskGrant.Desk.LTF_ADMIN):
        return None
    from clubs.admin_assignment import home_club_id

    if home_club_id(request.user) != club_id:
        return None
    if exception_open(user_id=request.user.id, rule=OWN_CLUB, club_id=club_id):
        return None
    _finance_refusal(
        request,
        "duty.own_club_refused",
        "Own-club module override refused.",
        club_id=club_id,
    )
    return OWN_CLUB


def refuse_own_invoice_payment(request, order) -> str | None:
    if not acting_full(request, DeskGrant.Desk.LTF_FINANCE):
        return None
    invoice = getattr(order, "invoice", None)
    if invoice is None:
        return None
    from licenses.models import FinanceAuditLog

    creator_id = (
        FinanceAuditLog.objects.filter(invoice_id=invoice.id, action="invoice.created")
        .order_by("id")
        .values_list("actor_id", flat=True)
        .first()
    )
    if creator_id is None or creator_id != request.user.id:
        return None
    if exception_open(user_id=request.user.id, rule=OWN_INVOICE, invoice_id=invoice.id):
        return None
    _finance_refusal(
        request,
        "duty.payment_refused",
        "The person who created the invoice cannot record its payment.",
        club_id=invoice.club_id,
        invoice=invoice,
        order=order,
    )
    return OWN_INVOICE


def exception_span_ok(valid_from, valid_until) -> bool:
    if valid_until is None:
        return False
    return valid_until > valid_from and (valid_until - valid_from) <= timedelta(days=MAX_EXCEPTION_DAYS)
