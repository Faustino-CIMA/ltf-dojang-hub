from __future__ import annotations

import calendar
from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from django.db import IntegrityError, transaction
from django.db.models import Q
from django.utils import timezone

from clubs.models import Club
from members.models import Member

from .models import (
    ClubFeeBillingSchedule,
    ClubFeePrice,
    ClubFeeType,
    FinanceAuditLog,
    Invoice,
    Order,
    OrderItem,
)
from .module_fees import (
    active_member_count,
    module_fee_line_description,
    quote_price,
)
from .services import cancel_pending_payments_for_invoice


class ClubFeeBillingError(Exception):
    def __init__(self, detail: str, status_code: int = 400):
        super().__init__(detail)
        self.detail = detail
        self.status_code = status_code


OPEN_INVOICE_STATUSES = (Invoice.Status.ISSUED, Invoice.Status.PAID)


def advance_schedule_date(value: date, recurrence: str) -> date:
    if recurrence == ClubFeeBillingSchedule.Recurrence.MONTHLY:
        month = value.month + 1
        year = value.year + (month - 1) // 12
        month = ((month - 1) % 12) + 1
    else:
        year = value.year + 1
        month = value.month
    day = min(value.day, calendar.monthrange(year, month)[1])
    return date(year, month, day)


def _quantity_for_fee(fee_type: ClubFeeType, club: Club) -> int:
    if fee_type.cadence == ClubFeeType.Cadence.PER_MEMBER:
        return Member.objects.filter(club=club, is_active=True).count()
    return 1


def period_month_for(_fee_type: ClubFeeType, billed_on: date, recurrence: str | None) -> int | None:
    if recurrence == ClubFeeBillingSchedule.Recurrence.MONTHLY:
        return billed_on.month
    return None


def period_key_for(year: int, month: int | None) -> str:
    if month:
        return f"{year}-{int(month):02d}"
    return str(year)


def existing_charge(*, club: Club, fee_type: ClubFeeType, year: int, month: int | None):
    return (
        OrderItem.objects.select_for_update(of=("self",))
        .select_related("order")
        .filter(
            charge_active=True,
            fee_type=fee_type,
            billing_club=club,
            period_key=period_key_for(year, month),
        )
        .order_by("id")
        .first()
    )


def _line_description(fee_type: ClubFeeType, year: int, month: int | None) -> str:
    if month:
        return f"{fee_type.name} {year}-{month:02d}"
    return f"{fee_type.name} {year}"


def _void_unpaid_invoice(invoice: Invoice) -> None:
    invoice.status = Invoice.Status.VOID
    invoice.save(update_fields=["status", "updated_at"])
    order = invoice.order
    order.status = Order.Status.CANCELLED
    order.save(update_fields=["status", "updated_at"])
    OrderItem.objects.filter(order=order, charge_active=True).update(charge_active=False)
    cancel_pending_payments_for_invoice(invoice)


def _skip_row(*, club: Club, fee_type: ClubFeeType, reason: str, invoice_number: str) -> dict:
    return {
        "club_id": club.id,
        "club_name": club.name,
        "fee_type_id": fee_type.id,
        "fee_name": fee_type.name,
        "reason": reason,
        "invoice_number": invoice_number,
    }


@dataclass
class PlannedLine:
    fee_type: ClubFeeType
    price: ClubFeePrice
    quantity: int
    month: int | None
    year: int
    description: str
    price_snapshot: Decimal
    charged_amount: Decimal
    active_member_count: int | None = None
    minimum_applied: bool = False


def _plan_module_line(fee_type: ClubFeeType, club: Club, price: ClubFeePrice, period_year: int):
    from modules.entitlements import is_club_assigned

    if not fee_type.module_id or not is_club_assigned(fee_type.module_id, club.id):
        return None
    count = active_member_count(club.id, period_year)
    quoted = quote_price(
        amount=price.amount,
        pricing_type=price.pricing_type,
        minimum_amount=price.minimum_amount,
        active_members=count,
    )
    if quoted["charged_amount"] <= 0:
        return None
    per_member = price.pricing_type == ClubFeePrice.PricingType.PER_ACTIVE_MEMBER
    quantity = count if per_member and count > 0 else 1
    return PlannedLine(
        fee_type=fee_type,
        price=price,
        quantity=quantity,
        month=None,
        year=period_year,
        description=module_fee_line_description(
            name=fee_type.name,
            year=period_year,
            pricing_type=price.pricing_type,
            amount=price.amount,
            active_members=count if per_member else None,
            minimum_applied=quoted["minimum_applied"],
        ),
        price_snapshot=price.amount,
        charged_amount=quoted["charged_amount"],
        active_member_count=quoted["active_member_count"],
        minimum_applied=quoted["minimum_applied"],
    )


def _plan_line(fee_type: ClubFeeType, club: Club, billed_on: date, period_year: int, month: int | None):
    price = ClubFeePrice.get_active_price(fee_type=fee_type, as_of=billed_on)
    if price is None:
        return None
    if fee_type.module_id:
        return _plan_module_line(fee_type, club, price, period_year)
    quantity = _quantity_for_fee(fee_type, club)
    if quantity <= 0:
        return None
    return PlannedLine(
        fee_type=fee_type,
        price=price,
        quantity=quantity,
        month=month,
        year=period_year,
        description=_line_description(fee_type, period_year, month),
        price_snapshot=price.amount,
        charged_amount=price.amount * quantity,
    )


def bill_club_fees(
    *,
    fee_types: list[ClubFeeType],
    clubs: list[Club],
    billed_on: date,
    period_year: int,
    actor=None,
    schedule: ClubFeeBillingSchedule | None = None,
    rebill: bool = False,
    recurrence: str | None = None,
) -> dict:
    if not fee_types:
        raise ClubFeeBillingError("Select at least one club fee.")
    invoices: list[Invoice] = []
    skipped: list[dict] = []
    rebilled: list[dict] = []

    with transaction.atomic():
        for club in clubs:
            if not club.is_active:
                continue
            try:
                with transaction.atomic():
                    planned: dict[int, PlannedLine] = {}
                    to_void: dict[int, Invoice] = {}
                    from .module_orders import active_purchase_module_ids

                    covered_modules = (
                        active_purchase_module_ids(club)
                        if any(fee_type.module_id for fee_type in fee_types)
                        else set()
                    )
                    for fee_type in fee_types:
                        if not fee_type.is_active:
                            continue
                        if fee_type.module_id and fee_type.module_id in covered_modules:
                            skipped.append(
                                _skip_row(
                                    club=club,
                                    fee_type=fee_type,
                                    reason="covered",
                                    invoice_number="",
                                )
                            )
                            continue
                        month = (
                            None
                            if fee_type.module_id
                            else period_month_for(fee_type, billed_on, recurrence)
                        )
                        existing = existing_charge(
                            club=club, fee_type=fee_type, year=period_year, month=month
                        )
                        if existing is not None:
                            try:
                                invoice = existing.order.invoice
                            except Invoice.DoesNotExist:
                                existing.charge_active = False
                                existing.save(update_fields=["charge_active"])
                                existing = None
                        if existing is not None:
                            if invoice.status == Invoice.Status.PAID:
                                skipped.append(
                                    _skip_row(
                                        club=club,
                                        fee_type=fee_type,
                                        reason="paid",
                                        invoice_number=invoice.invoice_number,
                                    )
                                )
                                continue
                            if not rebill:
                                skipped.append(
                                    _skip_row(
                                        club=club,
                                        fee_type=fee_type,
                                        reason="already_billed",
                                        invoice_number=invoice.invoice_number,
                                    )
                                )
                                continue
                            line = _plan_line(fee_type, club, billed_on, period_year, month)
                            if line is None:
                                skipped.append(
                                    _skip_row(
                                        club=club,
                                        fee_type=fee_type,
                                        reason="already_billed",
                                        invoice_number=invoice.invoice_number,
                                    )
                                )
                                continue
                            to_void[invoice.id] = invoice
                            planned[fee_type.id] = line
                        else:
                            line = _plan_line(fee_type, club, billed_on, period_year, month)
                            if line is not None:
                                planned[fee_type.id] = line

                    if rebill and to_void:
                        for invoice in to_void.values():
                            sibling_items = invoice.order.items.filter(
                                fee_type__isnull=False
                            ).select_related("fee_type")
                            for item in sibling_items:
                                if item.fee_type_id in planned:
                                    continue
                                fee_type = item.fee_type
                                if fee_type is None or not fee_type.is_active:
                                    continue
                                month = item.billing_month
                                line = _plan_line(fee_type, club, billed_on, period_year, month)
                                if line is not None:
                                    planned[fee_type.id] = line

                    if not planned:
                        continue

                    for invoice in to_void.values():
                        _void_unpaid_invoice(invoice)
                        rebilled.append(
                            {
                                "club_id": club.id,
                                "club_name": club.name,
                                "invoice_number": invoice.invoice_number,
                            }
                        )

                    items = list(planned.values())
                    currency = items[0].price.currency
                    subtotal = sum((line.charged_amount for line in items), Decimal("0.00"))
                    order = Order.objects.create(
                        club=club,
                        member=None,
                        ledger=Order.Ledger.FEDERATION,
                        status=Order.Status.PENDING,
                        currency=currency,
                        subtotal=subtotal,
                        tax_total=Decimal("0.00"),
                        total=subtotal,
                    )
                    OrderItem.objects.bulk_create(
                        [
                            OrderItem(
                                order=order,
                                license=None,
                                fee_type=line.fee_type,
                                description=line.description,
                                billing_year=line.year,
                                billing_month=line.month,
                                billing_club=club,
                                period_key=period_key_for(line.year, line.month),
                                charge_active=True,
                                price_snapshot=line.price_snapshot,
                                quantity=line.quantity,
                                active_member_count=line.active_member_count,
                                minimum_applied=line.minimum_applied,
                                charged_amount=line.charged_amount,
                            )
                            for line in items
                        ]
                    )
                    invoice = Invoice.objects.create(
                        order=order,
                        club=club,
                        member=None,
                        status=Invoice.Status.ISSUED,
                        currency=currency,
                        subtotal=subtotal,
                        tax_total=Decimal("0.00"),
                        total=subtotal,
                        issued_at=timezone.now(),
                    )
                    FinanceAuditLog.objects.create(
                        action="club_fee.billed",
                        message="Club fee invoice created.",
                        actor=actor,
                        club=club,
                        order=order,
                        invoice=invoice,
                        metadata={
                            "billed_on": billed_on.isoformat(),
                            "period_year": period_year,
                            "rebill": rebill,
                            "fee_type_ids": [line.fee_type.id for line in items],
                            "schedule_id": schedule.id if schedule else None,
                            "total": str(subtotal),
                        },
                    )
                    invoices.append(invoice)
            except IntegrityError:
                skipped.append(
                    {
                        "club_id": club.id,
                        "club_name": club.name,
                        "fee_type_id": None,
                        "fee_name": "",
                        "reason": "already_billed",
                        "invoice_number": "",
                    }
                )
    return {
        "invoices": invoices,
        "skipped": skipped,
        "rebilled": rebilled,
    }


def create_billing_run(
    *,
    fee_type_ids: list[int],
    club_ids: list[int] | None,
    billed_on: date,
    recurring: bool,
    recurrence: str | None,
    actor=None,
    period_year: int | None = None,
    rebill: bool = False,
) -> dict:
    fee_types = list(ClubFeeType.objects.filter(id__in=fee_type_ids, is_active=True))
    if not fee_types:
        raise ClubFeeBillingError("Select at least one active club fee.")
    if club_ids:
        clubs = list(Club.objects.filter(id__in=club_ids, is_active=True))
        all_active = False
    else:
        clubs = list(Club.objects.filter(is_active=True))
        all_active = True
    if not clubs:
        raise ClubFeeBillingError("No active clubs to bill.")

    year = period_year or billed_on.year
    billed = bill_club_fees(
        fee_types=fee_types,
        clubs=clubs,
        billed_on=billed_on,
        period_year=year,
        actor=actor,
        rebill=rebill,
        recurrence=recurrence,
    )

    schedules: list[ClubFeeBillingSchedule] = []
    if recurring:
        if recurrence not in {
            ClubFeeBillingSchedule.Recurrence.MONTHLY,
            ClubFeeBillingSchedule.Recurrence.ANNUAL,
        }:
            raise ClubFeeBillingError("Choose a monthly or annual recurrence.")
        next_run = advance_schedule_date(billed_on, recurrence)
        for fee_type in fee_types:
            schedule = ClubFeeBillingSchedule.objects.create(
                fee_type=fee_type,
                recurrence=recurrence,
                next_run_on=next_run,
                all_active_clubs=all_active,
                is_active=True,
                created_by=actor if getattr(actor, "is_authenticated", False) else None,
            )
            if not all_active:
                schedule.clubs.set(clubs)
            schedules.append(schedule)

    return {
        "invoice_ids": [invoice.id for invoice in billed["invoices"]],
        "invoice_count": len(billed["invoices"]),
        "skipped": billed["skipped"],
        "rebilled": billed["rebilled"],
        "schedule_ids": [schedule.id for schedule in schedules],
        "billed_on": billed_on.isoformat(),
        "period_year": year,
    }


def billing_status(*, year: int, month: int | None = None) -> list[dict]:
    items = (
        OrderItem.objects.filter(
            charge_active=True,
            fee_type__isnull=False,
            billing_year=year,
        )
        .select_related("fee_type", "order__club", "order__invoice", "billing_club")
        .order_by("billing_club__name", "fee_type__name", "id")
    )
    if month is None:
        items = items.filter(Q(billing_month__isnull=True))
    else:
        items = items.filter(billing_month=month)
    rows = []
    for item in items:
        try:
            invoice = item.order.invoice
        except Invoice.DoesNotExist:
            continue
        club = item.billing_club or item.order.club
        rows.append(
            {
                "club_id": club.id,
                "club_name": club.name,
                "fee_type_id": item.fee_type_id,
                "fee_name": item.fee_type.name,
                "invoice_number": invoice.invoice_number,
                "invoice_status": invoice.status,
                "period_year": item.billing_year,
            }
        )
    return rows


def run_due_schedules(*, as_of: date | None = None) -> list[int]:
    today = as_of or timezone.localdate()
    due = ClubFeeBillingSchedule.objects.filter(
        is_active=True,
        next_run_on__lte=today,
    ).select_related("fee_type")
    invoice_ids: list[int] = []
    for schedule in due:
        if schedule.end_on and schedule.end_on < today:
            schedule.is_active = False
            schedule.save(update_fields=["is_active", "updated_at"])
            continue
        if not schedule.fee_type.is_active:
            continue
        clubs = (
            list(Club.objects.filter(is_active=True))
            if schedule.all_active_clubs
            else list(schedule.clubs.filter(is_active=True))
        )
        billed = bill_club_fees(
            fee_types=[schedule.fee_type],
            clubs=clubs,
            billed_on=today,
            period_year=today.year,
            actor=schedule.created_by,
            schedule=schedule,
            rebill=False,
            recurrence=schedule.recurrence,
        )
        invoice_ids.extend(invoice.id for invoice in billed["invoices"])
        schedule.last_run_on = today
        schedule.next_run_on = advance_schedule_date(schedule.next_run_on, schedule.recurrence)
        schedule.save(update_fields=["last_run_on", "next_run_on", "updated_at"])
    return invoice_ids
