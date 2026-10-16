"""Prices the federation charges a club for a software module.

An active member is a member of that club who holds a valid licence for the
billing year. Valid means the licence is active or pending, the same rule the
member lists already use, and the licence belongs to this club for that year.
"""

from __future__ import annotations

from decimal import Decimal

from django.utils import timezone

from members.models import Member
from modules.entitlements import is_club_assigned
from modules.registry import (
    CLUB_MANAGEMENT_MODULE_ID,
    EVENT_CALENDAR_MODULE_ID,
    get_spec,
)

from .models import ClubFeePrice, ClubFeeType, License

BILLABLE_MODULE_IDS: tuple[str, ...] = (
    CLUB_MANAGEMENT_MODULE_ID,
    EVENT_CALENDAR_MODULE_ID,
)
VALID_LICENSE_STATUSES = (License.Status.ACTIVE, License.Status.PENDING)


def active_member_count(club_id: int, year: int) -> int:
    """Members of this club with a valid licence for the year."""
    return (
        Member.objects.filter(
            club_id=club_id,
            licenses__club_id=club_id,
            licenses__year=year,
            licenses__status__in=VALID_LICENSE_STATUSES,
        )
        .distinct()
        .count()
    )


def _money(value: Decimal) -> Decimal:
    return Decimal(value).quantize(Decimal("0.01"))


def quote_price(
    *,
    amount: Decimal,
    pricing_type: str,
    minimum_amount: Decimal | None,
    active_members: int,
) -> dict:
    unit = _money(amount)
    per_member = pricing_type == ClubFeePrice.PricingType.PER_ACTIVE_MEMBER
    calculated = _money(unit * active_members) if per_member else unit
    minimum = None if minimum_amount is None else _money(minimum_amount)
    minimum_applied = minimum is not None and minimum > calculated
    charged = minimum if minimum_applied else calculated
    return {
        "calculated_amount": calculated,
        "charged_amount": charged,
        "minimum_applied": minimum_applied,
        "active_member_count": active_members if per_member else None,
    }


def module_fee_line_description(
    *,
    name: str,
    year: int,
    pricing_type: str,
    amount: Decimal,
    active_members: int | None,
    minimum_applied: bool,
) -> str:
    if pricing_type == ClubFeePrice.PricingType.PER_ACTIVE_MEMBER:
        count = 0 if active_members is None else active_members
        text = f"{name}: {count} active members × €{_money(amount)}"
    else:
        text = f"{name} {year}"
    if minimum_applied:
        text = f"{text}. Minimum fee applied"
    return text[:255]


def module_fee_quote(club, *, as_of=None, year: int | None = None) -> dict:
    """Read-only price list for one club. No module has to be switched on."""
    as_of = as_of or timezone.localdate()
    billing_year = year or as_of.year
    count = active_member_count(club.id, billing_year)
    fees = {
        fee.module_id: fee
        for fee in ClubFeeType.objects.filter(module_id__in=BILLABLE_MODULE_IDS).prefetch_related(
            "prices"
        )
    }
    modules = []
    for module_id in BILLABLE_MODULE_IDS:
        spec = get_spec(module_id)
        fee = fees.get(module_id)
        price = None
        if fee is not None and fee.is_active:
            price = ClubFeePrice.get_active_price(fee_type=fee, as_of=as_of)
        row = {
            "module_id": module_id,
            "name": spec.label if spec else module_id,
            "enabled": is_club_assigned(module_id, club.id),
            "has_price": price is not None,
            "pricing_type": price.pricing_type if price else None,
            "amount": f"{_money(price.amount)}" if price else None,
            "currency": price.currency if price else "EUR",
            "minimum_amount": (
                f"{_money(price.minimum_amount)}" if price and price.minimum_amount is not None else None
            ),
            "effective_from": price.effective_from.isoformat() if price else None,
            "active_member_count": count,
            "calculated_amount": None,
            "estimated_amount": None,
            "minimum_applied": False,
        }
        if price is not None:
            quoted = quote_price(
                amount=price.amount,
                pricing_type=price.pricing_type,
                minimum_amount=price.minimum_amount,
                active_members=count,
            )
            row["calculated_amount"] = f"{quoted['calculated_amount']}"
            row["estimated_amount"] = f"{quoted['charged_amount']}"
            row["minimum_applied"] = quoted["minimum_applied"]
        modules.append(row)
    return {
        "club_id": club.id,
        "year": billing_year,
        "active_member_count": count,
        "estimate": True,
        "modules": modules,
    }
