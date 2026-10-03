from __future__ import annotations

from datetime import date
from decimal import Decimal

from django.db import transaction
from django.db.models import Exists, OuterRef, Q
from django.http import HttpResponse
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.status import HTTP_400_BAD_REQUEST, HTTP_404_NOT_FOUND
from rest_framework.views import APIView

from licenses.models import Invoice, Order, OrderItem
from licenses.services import cancel_pending_payments_for_invoice
from members.models import Member

from .access import can_manage_club_records
from .guardians import needs_explicit_recipient, ordered_memberships, resolve_ledger_member
from .models import (
    ClubLicenseFee,
    ClubLicenseFeePrice,
    Family,
    FamilyRebateRule,
    MemberRecord,
    MembershipBilling,
    MembershipFee,
    MembershipFeePrice,
    MembershipYearConfirmation,
)

LICENSE_FEE_NAME = "License fee"


def invoice_emails(member) -> list[str]:
    preferred = [
        email.strip()
        for email in member.club_emails.filter(use_for_invoice=True).values_list("email", flat=True)
        if email and str(email).strip()
    ]
    if preferred:
        return list(dict.fromkeys(preferred))
    fallback = [
        email.strip()
        for email in member.club_emails.values_list("email", flat=True)
        if email and str(email).strip()
    ]
    member_email = str(getattr(member, "email", "") or "").strip()
    if member_email:
        fallback.append(member_email)
    return list(dict.fromkeys(fallback))


def invoice_address(member) -> dict | None:
    address = member.club_addresses.filter(use_for_invoice=True).first() or member.club_addresses.first()
    if address is None:
        return None
    if not any([address.street, address.house_number, address.postal_code, address.locality]):
        return None
    return {
        "street": address.street,
        "house_number": address.house_number,
        "line2": address.line2,
        "postal_code": address.postal_code,
        "locality": address.locality,
        "country": address.country,
        "formatted": format_address(address),
    }


def format_address(address) -> str:
    line1 = " ".join(part for part in [address.street, address.house_number] if part).strip()
    lines = [line1, address.line2, " ".join(part for part in [address.postal_code, address.locality] if part).strip(), address.country]
    return "\n".join(part for part in lines if part)


def _pdf_name(first_name: str, last_name: str) -> str:
    last = str(last_name or "").strip().upper()
    first = str(first_name or "").strip()
    return " ".join(part for part in (last, first) if part)


def _pdf_address_lines(address: dict | None) -> list[str]:
    if not address:
        return []
    number = str(address.get("house_number") or "").strip()
    street = str(address.get("street") or "").strip()
    if number and street:
        line1 = f"{number}, {street}"
    else:
        line1 = street or number
    lines = [line for line in (line1, str(address.get("line2") or "").strip()) if line]
    postal = str(address.get("postal_code") or "").strip()
    locality = str(address.get("locality") or "").strip()
    if len(postal) == 4 and postal.isdigit():
        postal = f"L-{postal}"
    postal_line = " ".join(part for part in (postal, locality) if part)
    if postal_line:
        lines.append(postal_line)
    return lines


def person_invoice_emails(person) -> list[str]:
    preferred = [
        email.strip()
        for email in person.emails.filter(use_for_invoice=True).values_list("email", flat=True)
        if email and str(email).strip()
    ]
    if preferred:
        return list(dict.fromkeys(preferred))
    fallback = [
        email.strip()
        for email in person.emails.values_list("email", flat=True)
        if email and str(email).strip()
    ]
    return list(dict.fromkeys(fallback))


def person_invoice_address(person) -> dict | None:
    address = person.addresses.filter(use_for_invoice=True).first() or person.addresses.first()
    if address is None:
        return None
    if not any([address.street, address.house_number, address.postal_code, address.locality]):
        return None
    return {
        "street": address.street,
        "house_number": address.house_number,
        "line2": address.line2,
        "postal_code": address.postal_code,
        "locality": address.locality,
        "country": address.country,
        "formatted": format_address(address),
    }


def resolve_person_delivery(person, override: str = "") -> str:
    emails = person_invoice_emails(person)
    address = person_invoice_address(person)
    preferred = override or ""
    if preferred == MemberRecord.InvoiceDelivery.EMAIL and emails:
        return MemberRecord.InvoiceDelivery.EMAIL
    if preferred == MemberRecord.InvoiceDelivery.POST and address:
        return MemberRecord.InvoiceDelivery.POST
    if preferred == MemberRecord.InvoiceDelivery.HAND:
        return MemberRecord.InvoiceDelivery.HAND
    if emails:
        return MemberRecord.InvoiceDelivery.EMAIL
    if address:
        return MemberRecord.InvoiceDelivery.POST
    return MemberRecord.InvoiceDelivery.HAND


def _contact_label(delivery: str, emails: list[str], address: dict | None, fallback: str) -> str:
    if delivery == MemberRecord.InvoiceDelivery.EMAIL and emails:
        return emails[0]
    if delivery == MemberRecord.InvoiceDelivery.POST and address:
        return address["formatted"].replace("\n", ", ")
    return fallback


def member_recipient(member) -> dict:
    address = invoice_address(member)
    emails = invoice_emails(member)
    delivery = resolve_delivery(member)
    name = f"{member.first_name} {member.last_name}".strip()
    return {
        "needs_recipient": False,
        "kind": "member",
        "id": member.id,
        "member_id": member.id,
        "ledger_member": member,
        "name": name,
        "pdf_name": _pdf_name(member.first_name, member.last_name),
        "emails": emails,
        "address": address,
        "address_lines": _pdf_address_lines(address),
        "delivery": delivery,
        "contact_label": _contact_label(delivery, emails, address, member.first_name),
    }


def describe_bill_to(family, members) -> dict:
    if family.bill_to_person_id and family.bill_to_person is not None:
        person = family.bill_to_person
        address = person_invoice_address(person)
        emails = person_invoice_emails(person)
        delivery = resolve_person_delivery(person, family.bill_to_delivery)
        name = f"{person.first_name} {person.last_name}".strip()
        return {
            "needs_recipient": False,
            "kind": "person",
            "id": person.id,
            "member_id": None,
            "ledger_member": members[0].member,
            "name": name,
            "pdf_name": _pdf_name(person.first_name, person.last_name),
            "emails": emails,
            "address": address,
            "address_lines": _pdf_address_lines(address),
            "delivery": delivery,
            "contact_label": _contact_label(delivery, emails, address, person.first_name),
        }
    if needs_explicit_recipient(family, members):
        return {
            "needs_recipient": True,
            "kind": "missing",
            "id": None,
            "member_id": None,
            "ledger_member": members[0].member,
            "name": "",
            "pdf_name": "",
            "emails": [],
            "address": None,
            "address_lines": [],
            "delivery": MemberRecord.InvoiceDelivery.HAND,
            "contact_label": "",
        }
    return member_recipient(resolve_ledger_member(family, members))


def persist_default_recipient(family, members) -> None:
    if needs_explicit_recipient(family, members):
        raise ValidationError({"bill_to": "Choose who receives the bill."})
    if family.invoice_member_id or family.bill_to_person_id:
        return
    family.invoice_member = resolve_ledger_member(family, members)
    family.bill_to_person = None
    family.save(update_fields=["invoice_member", "bill_to_person"])


def payer_payload_from_description(described: dict) -> dict:
    return {
        "id": described["id"],
        "kind": described["kind"],
        "member_id": described["member_id"],
        "name": described["name"],
        "delivery": described["delivery"],
        "emails": described["emails"],
        "address": described["address"],
        "contact_label": described["contact_label"],
    }


def resolve_delivery(member) -> str:
    record = getattr(member, "club_record", None)
    preferred = getattr(record, "invoice_delivery", None) or MemberRecord.InvoiceDelivery.EMAIL
    emails = invoice_emails(member)
    address = invoice_address(member)
    if preferred == MemberRecord.InvoiceDelivery.EMAIL and emails:
        return MemberRecord.InvoiceDelivery.EMAIL
    if preferred == MemberRecord.InvoiceDelivery.POST and address:
        return MemberRecord.InvoiceDelivery.POST
    if preferred == MemberRecord.InvoiceDelivery.HAND:
        return MemberRecord.InvoiceDelivery.HAND
    if emails:
        return MemberRecord.InvoiceDelivery.EMAIL
    if address:
        return MemberRecord.InvoiceDelivery.POST
    return MemberRecord.InvoiceDelivery.HAND


def _club_id(request) -> int | None:
    raw = request.query_params.get("club") or request.query_params.get("club_id") or request.data.get("club")
    try:
        return int(raw) if raw not in (None, "") else None
    except (TypeError, ValueError):
        return None


def _require_club(request) -> int:
    club_id = _club_id(request)
    if club_id is None:
        raise ValidationError({"club": "Select a club."})
    if not can_manage_club_records(request.user, club_id):
        raise PermissionDenied(detail="This module is not available.")
    return club_id


def membership_fee_for_club(club):
    return MembershipFee.objects.filter(club=club, is_active=True).order_by("id").first()


def active_fees_for_club(club, year: int) -> list[dict]:
    rows = []
    for fee in MembershipFee.objects.filter(club=club, is_active=True).order_by("name", "id"):
        rows.append(
            {
                "id": fee.id,
                "name": fee.name,
                "amount": str(MembershipFeePrice.amount_for_year(fee, year)),
            }
        )
    return rows


def fee_for_member(club, member):
    record = getattr(member, "club_record", None)
    assigned = getattr(record, "membership_fee", None) if record is not None else None
    if assigned is not None and assigned.is_active and assigned.club_id == club.id:
        return assigned
    return membership_fee_for_club(club)


def member_pays_license_fee(member) -> bool:
    record = getattr(member, "club_record", None)
    if record is None:
        return True
    return bool(record.pays_license_fee)


def _line_payload(*, member, fee, year: int, rank: int, rule=None) -> dict:
    unit = MembershipFeePrice.amount_for_year(fee, year)
    amount_off = None
    if rule is not None and rule.amount_off is not None:
        amount_off = Decimal(rule.amount_off)
        amount = max(Decimal("0.00"), unit - amount_off).quantize(Decimal("0.01"))
        percent = Decimal("0")
    else:
        percent = Decimal(rule.percent_off) if rule is not None else Decimal("0")
        amount = (unit * (Decimal("100") - percent) / Decimal("100")).quantize(Decimal("0.01"))
    return {
        "member_id": member.id,
        "member_name": f"{member.first_name} {member.last_name}",
        "rank": rank,
        "percent_off": f"{percent:.2f}",
        "amount_off": f"{amount_off:.2f}" if amount_off is not None else "",
        "amount": str(amount),
        "fee_id": fee.id,
        "fee_name": fee.name,
        "unit_amount": str(unit),
        "rebate_carried": bool(rule is not None and rule.member_rank != rank),
        "pays_license_fee": member_pays_license_fee(member),
    }


def billing_sequences(club, year: int) -> list[int]:
    rows = list(
        MembershipBilling.objects.filter(club=club, year=year).order_by("sequence", "id").values_list("sequence", flat=True)
    )
    return rows or [1]


def license_fee_sequence(club, year: int) -> int:
    rows = list(MembershipBilling.objects.filter(club=club, year=year).order_by("sequence", "id"))
    if not rows:
        return 1
    for row in rows:
        if row.charges_license_fee:
            return row.sequence
    return rows[0].sequence


def license_fee_amount_for_year(club, year: int) -> Decimal:
    fee = ClubLicenseFee.objects.filter(club=club).first()
    if fee is None:
        return Decimal("0.00")
    return Decimal(ClubLicenseFeePrice.amount_for_year(fee, year)).quantize(Decimal("0.01"))


def _installment_filter(installment: int):
    if int(installment) == 1:
        return Q(billing_installment__isnull=True) | Q(billing_installment=1)
    return Q(billing_installment=installment)


def _member_name(member) -> str:
    return f"{member.first_name} {member.last_name}".strip()


def _installment_names(club_id: int, year: int, installment: int) -> set[str]:
    descriptions = (
        OrderItem.objects.filter(
            order__club_id=club_id,
            order__ledger=Order.Ledger.CLUB,
            fee_type__isnull=True,
            license__isnull=True,
            is_license_fee=False,
            order__invoice__status__in=[Invoice.Status.ISSUED, Invoice.Status.PAID],
        )
        .filter(Q(billing_year=year) | Q(billing_year__isnull=True, description__startswith=f"Membership {year}"))
        .filter(_installment_filter(installment))
        .values_list("description", flat=True)
    )
    return {_name_on_invoice_line(description).casefold() for description in descriptions if _name_on_invoice_line(description)}


def _license_fee_names(club_id: int, year: int) -> set[str]:
    descriptions = OrderItem.objects.filter(
        order__club_id=club_id,
        order__ledger=Order.Ledger.CLUB,
        is_license_fee=True,
        billing_year=year,
        order__invoice__status__in=[Invoice.Status.ISSUED, Invoice.Status.PAID],
    ).values_list("description", flat=True)
    return {_name_on_invoice_line(description).casefold() for description in descriptions if _name_on_invoice_line(description)}


def _installment_started(club_id: int, year: int, installment: int) -> bool:
    return (
        OrderItem.objects.filter(
            order__club_id=club_id,
            order__ledger=Order.Ledger.CLUB,
            fee_type__isnull=True,
            license__isnull=True,
            is_license_fee=False,
            billing_year=year,
            order__invoice__status__in=[Invoice.Status.ISSUED, Invoice.Status.PAID],
        )
        .filter(_installment_filter(installment))
        .exists()
    )


def _include_license_fee(
    *,
    club,
    year: int,
    installment: int,
    member,
    sequences: list[int],
    charged: set[str],
    target: int,
) -> bool:
    if not member_pays_license_fee(member):
        return False
    name = _member_name(member).casefold()
    if not name or name in charged:
        return False
    if int(installment) < int(target):
        return False
    for earlier in sequences:
        if earlier < target or earlier >= installment:
            continue
        if name in _installment_names(club.id, year, earlier):
            return False
        if not _installment_started(club.id, year, earlier):
            return False
    return True


def _license_fee_line(member, amount: Decimal, name: str) -> dict:
    return {
        "member_id": member.id,
        "member_name": _member_name(member),
        "rank": 0,
        "percent_off": "0.00",
        "amount_off": "",
        "amount": str(amount),
        "fee_id": None,
        "fee_name": name,
        "unit_amount": str(amount),
        "supplementary": True,
    }


def _append_license_fees(*, club, year: int, installment: int, members, lines: list[dict], total: Decimal):
    amount = license_fee_amount_for_year(club, year)
    if amount <= 0:
        return lines, total
    fee = ClubLicenseFee.objects.filter(club=club).first()
    name = fee.name.strip() if fee is not None and str(fee.name).strip() else LICENSE_FEE_NAME
    sequences = billing_sequences(club, year)
    target = license_fee_sequence(club, year)
    charged = _license_fee_names(club.id, year)
    for member in members:
        if _include_license_fee(
            club=club,
            year=year,
            installment=installment,
            member=member,
            sequences=sequences,
            charged=charged,
            target=target,
        ):
            line = _license_fee_line(member, amount, name)
            lines.append(line)
            total += amount
    return lines, total


def resolve_installment(club, year: int, raw) -> int:
    sequences = billing_sequences(club, year)
    if raw in (None, ""):
        return sequences[0]
    try:
        number = int(raw)
    except (TypeError, ValueError) as error:
        raise ValidationError({"installment": "Enter a billing number."}) from error
    if number not in sequences:
        raise ValidationError({"installment": "That billing is not defined for this year."})
    return number


def billing_catalog(club, year: int) -> list[dict]:
    return [
        {"id": row.id, "sequence": row.sequence, "label": row.label, "charges_license_fee": bool(row.charges_license_fee)}
        for row in MembershipBilling.objects.filter(club=club, year=year).order_by("sequence", "id")
    ]


def license_fee_snapshot(club, year: int) -> dict:
    fee = ClubLicenseFee.objects.filter(club=club).first()
    amount = license_fee_amount_for_year(club, year)
    return {
        "name": fee.name if fee is not None and str(fee.name).strip() else LICENSE_FEE_NAME,
        "amount": f"{amount:.2f}",
    }


def _license_fee_record(club) -> ClubLicenseFee | None:
    return ClubLicenseFee.objects.filter(club=club).prefetch_related("prices").first()


def license_fee_detail(club) -> dict:
    fee = _license_fee_record(club)
    if fee is None:
        return {"id": None, "club": club.id, "name": LICENSE_FEE_NAME, "amount": "0.00", "prices": []}
    return {
        "id": fee.id,
        "club": club.id,
        "name": fee.name,
        "amount": f"{Decimal(fee.amount):.2f}",
        "prices": [
            {
                "id": row.id,
                "amount": f"{Decimal(row.amount):.2f}",
                "effective_from": row.effective_from.isoformat(),
                "created_at": row.created_at.isoformat(),
            }
            for row in fee.prices.all()
        ],
    }


def _parse_money(raw, field: str) -> Decimal:
    try:
        amount = Decimal(str(raw)).quantize(Decimal("0.01"))
    except Exception as error:
        raise ValidationError({field: "Enter an amount."}) from error
    if amount < 0:
        raise ValidationError({field: "Amount cannot be negative."})
    return amount


def save_license_fee(*, club, name: str | None = None, amount: Decimal | None = None, effective_from=None, as_new_price: bool = False) -> ClubLicenseFee:
    fee = ClubLicenseFee.objects.filter(club=club).first()
    if fee is None:
        fee = ClubLicenseFee(club=club, name=LICENSE_FEE_NAME, amount=Decimal("0.00"))
    if name is not None:
        cleaned = str(name).strip()
        if not cleaned:
            raise ValidationError({"name": "Name is required."})
        fee.name = cleaned[:120]
    if amount is not None:
        fee.amount = amount
    fee.save()
    if amount is None:
        return fee
    if as_new_price:
        when = effective_from or timezone.localdate()
        ClubLicenseFeePrice.objects.create(fee=fee, amount=amount, effective_from=when)
        return fee
    latest = fee.prices.order_by("-effective_from", "-id").first()
    if latest is None:
        ClubLicenseFeePrice.objects.create(
            fee=fee,
            amount=amount,
            effective_from=effective_from or date(timezone.now().year, 1, 1),
        )
        return fee
    latest.amount = amount
    latest.save(update_fields=["amount"])
    return fee


def add_membership_billing(*, club, year: int, label: str = "") -> list[MembershipBilling]:
    label = str(label or "").strip()[:80]
    existing = list(MembershipBilling.objects.filter(club=club, year=year).order_by("sequence", "id"))
    if not existing:
        MembershipBilling.objects.create(club=club, year=year, sequence=1, label="", charges_license_fee=True)
        MembershipBilling.objects.create(club=club, year=year, sequence=2, label=label)
    else:
        nxt = max(row.sequence for row in existing) + 1
        MembershipBilling.objects.create(club=club, year=year, sequence=nxt, label=label)
    return list(MembershipBilling.objects.filter(club=club, year=year).order_by("sequence", "id"))


def installment_has_activity(club_id: int, year: int, installment: int) -> bool:
    invoiced = (
        OrderItem.objects.filter(
            order__club_id=club_id,
            order__ledger=Order.Ledger.CLUB,
            billing_year=year,
            order__invoice__status__in=[Invoice.Status.ISSUED, Invoice.Status.PAID],
        )
        .filter(_installment_filter(installment))
        .exists()
    )
    if invoiced:
        return True
    return MembershipYearConfirmation.objects.filter(club_id=club_id, year=year, installment=installment).exists()


def rebate_rule_for_rank(rules: dict, rank: int):
    """Exact rank wins. Otherwise the nearest earlier rule applies only when it stays."""

    exact = rules.get(rank)
    if exact is not None:
        return exact
    earlier = [rule for rule_rank, rule in rules.items() if rule_rank < rank]
    if not earlier:
        return None
    nearest = max(earlier, key=lambda rule: rule.member_rank)
    if nearest.applies_to_later:
        return nearest
    return None


def household_plan(*, club, year: int, family=None, member=None, installment: int = 1):
    default_fee = membership_fee_for_club(club)
    if default_fee is None:
        raise ValidationError({"fee": "Set a membership fee first."})
    if family is not None:
        members = ordered_memberships(family)
        if not members:
            raise ValidationError({"family": "Add members to the family first."})
        payer = resolve_ledger_member(family, members)
        rules = {row.member_rank: row for row in FamilyRebateRule.objects.filter(club=club)}
        lines = []
        total = Decimal("0.00")
        for index, link in enumerate(members, start=1):
            fee = fee_for_member(club, link.member) or default_fee
            line = _line_payload(
                member=link.member,
                fee=fee,
                year=year,
                rank=index,
                rule=rebate_rule_for_rank(rules, index),
            )
            lines.append(line)
            total += Decimal(line["amount"])
        lines, total = _append_license_fees(
            club=club,
            year=year,
            installment=installment,
            members=[link.member for link in members],
            lines=lines,
            total=total,
        )
        return default_fee, None, payer, lines, total
    if member is None:
        raise ValidationError({"member": "Choose a member or family."})
    fee = fee_for_member(club, member) or default_fee
    line = _line_payload(member=member, fee=fee, year=year, rank=1)
    lines, total = _append_license_fees(
        club=club,
        year=year,
        installment=installment,
        members=[member],
        lines=[line],
        total=Decimal(line["amount"]),
    )
    return fee, Decimal(line["unit_amount"]), member, lines, total


def _membership_invoices_q(club_id: int, year: int, member_ids: list[int], installment: int = 1):
    if not member_ids:
        return OrderItem.objects.none()
    return (
        OrderItem.objects.filter(
            order__club_id=club_id,
            order__ledger=Order.Ledger.CLUB,
            fee_type__isnull=True,
            license__isnull=True,
            is_license_fee=False,
            order__invoice__status__in=[Invoice.Status.ISSUED, Invoice.Status.PAID],
            order__member_id__in=member_ids,
        )
        .filter(
            Q(billing_year=year)
            | Q(billing_year__isnull=True, description__startswith=f"Membership {year}")
        )
        .filter(_installment_filter(installment))
    )


def membership_invoices(club_id: int, year: int, member_ids: list[int], installment: int = 1) -> list[Invoice]:
    if not member_ids:
        return []
    invoice_ids = _membership_invoices_q(club_id, year, member_ids, installment).values_list("order__invoice__id", flat=True)
    return list(
        Invoice.objects.filter(id__in=invoice_ids)
        .select_related("member", "order")
        .prefetch_related("order__items")
        .order_by("-id")
    )


def existing_membership_invoice(club_id: int, year: int, member_ids: list[int], installment: int = 1) -> Invoice | None:
    found = membership_invoices(club_id, year, member_ids, installment)
    return found[0] if found else None


def _name_on_invoice_line(description: str) -> str:
    if " — " not in (description or ""):
        return ""
    return description.split(" — ", 1)[1].split(" (", 1)[0].strip()


def invoice_covers_members(invoice: Invoice, members) -> bool:
    """A family invoice names every current member. A one-person bill does not cover the family."""
    expected = {f"{member.first_name} {member.last_name}".strip().casefold() for member in members}
    expected.discard("")
    if not expected:
        return False
    billed = {
        _name_on_invoice_line(item.description).casefold()
        for item in invoice.order.items.all()
        if _name_on_invoice_line(item.description)
    }
    return expected <= billed


def _fee_name_on_invoice_line(description: str) -> str:
    head = (description or "").split(" — ", 1)[0].strip()
    parts = head.rsplit(" ", 1)
    if len(parts) == 2 and parts[1].isdigit():
        return parts[0]
    return head


def _lines_from_invoice(invoice: Invoice) -> list[dict]:
    rows = []
    for index, item in enumerate(invoice.order.items.all(), start=1):
        amount = (Decimal(item.price_snapshot) * item.quantity).quantize(Decimal("0.01"))
        rows.append(
            {
                "member_id": item.id,
                "member_name": _name_on_invoice_line(item.description) or item.description,
                "rank": 0 if item.is_license_fee else index,
                "percent_off": "0.00",
                "amount_off": "",
                "amount": f"{amount:.2f}",
                "fee_id": None,
                "fee_name": _fee_name_on_invoice_line(item.description),
                "unit_amount": f"{amount:.2f}",
                "supplementary": bool(item.is_license_fee),
            }
        )
    return rows


def _member_invoice_payload(invoice: Invoice) -> dict:
    member = invoice.member
    name = f"{member.first_name} {member.last_name}".strip() if member is not None else (invoice.bill_to_name or "")
    return {
        "id": invoice.id,
        "invoice_number": invoice.invoice_number,
        "total": f"{invoice.total:.2f}",
        "status": invoice.status,
        "member_name": name,
    }


def _family_rebate_note(line: dict) -> str:
    amount_text = str(line.get("amount_off") or "").strip()
    if amount_text:
        try:
            if Decimal(amount_text) > 0:
                return f"{amount_text} EUR family rebate"
        except Exception:
            return f"{amount_text} EUR family rebate"
        return ""
    percent_text = str(line.get("percent_off") or "").strip()
    if not percent_text:
        return ""
    try:
        if Decimal(percent_text) > 0:
            return f"{percent_text}% family rebate"
    except Exception:
        return f"{percent_text}% family rebate"
    return ""


def create_membership_invoice(*, club, year: int, payer, lines, total, actor=None, recipient=None, installment: int = 1) -> Invoice:
    if recipient is None:
        recipient = member_recipient(payer)
    delivery = recipient["delivery"]
    emails = [str(email).strip() for email in (recipient.get("emails") or []) if str(email).strip()]
    amount = Decimal(total)
    settled = amount <= Decimal("0.00")
    now = timezone.now()
    with transaction.atomic():
        order = Order.objects.create(
            club=club,
            member=payer,
            ledger=Order.Ledger.CLUB,
            status=Order.Status.PAID if settled else Order.Status.PENDING,
            currency="EUR",
            subtotal=total,
            tax_total=Decimal("0.00"),
            total=total,
        )
        for line in lines:
            fee_name = line.get("fee_name") or "Membership"
            description = f"{fee_name} {year} — {line['member_name']}"
            rebate_note = _family_rebate_note(line)
            if rebate_note:
                description = f"{description} ({rebate_note})"
            OrderItem.objects.create(
                order=order,
                description=description,
                billing_year=year,
                billing_installment=installment,
                is_license_fee=bool(line.get("supplementary")),
                billing_club=club,
                price_snapshot=line["amount"],
                quantity=1,
            )
        invoice = Invoice.objects.create(
            order=order,
            club=club,
            member=payer,
            status=Invoice.Status.PAID if settled else Invoice.Status.ISSUED,
            currency="EUR",
            subtotal=total,
            tax_total=Decimal("0.00"),
            total=total,
            issued_at=now,
            paid_at=now if settled else None,
            delivery_method=delivery,
            bill_to_name=recipient.get("pdf_name") or "",
            bill_to_email="\n".join(emails),
            bill_to_address="\n".join(recipient.get("address_lines") or []),
        )
    if delivery == MemberRecord.InvoiceDelivery.EMAIL and emails:
        from licenses.tasks import send_invoice_email

        send_invoice_email.delay(invoice.id, emails)
    return invoice


def _payer_payload(member) -> dict:
    delivery = resolve_delivery(member)
    emails = invoice_emails(member)
    address = invoice_address(member)
    return {
        "id": member.id,
        "kind": "member",
        "member_id": member.id,
        "name": f"{member.first_name} {member.last_name}",
        "delivery": delivery,
        "emails": emails,
        "address": address,
        "contact_label": _contact_label(delivery, emails, address, member.first_name),
    }


def list_households(club, year: int, installment: int = 1) -> list[dict]:
    fee = membership_fee_for_club(club)
    confirmed_keys = set(
        MembershipYearConfirmation.objects.filter(club=club, year=year, installment=installment).values_list(
            "household_key", flat=True
        )
    )
    families = list(
        Family.objects.filter(club=club)
        .select_related("bill_to_person", "invoice_member", "invoice_member__club_record")
        .prefetch_related(
            "memberships__member__club_record__membership_fee",
            "memberships__member__club_emails",
            "memberships__member__club_addresses",
            "bill_to_person__emails",
            "bill_to_person__addresses",
            "invoice_member__club_emails",
            "invoice_member__club_addresses",
        )
    )
    in_family: set[int] = set()
    rows = []
    for family in families:
        members = ordered_memberships(family)
        if not members:
            continue
        for link in members:
            in_family.add(link.member_id)
        try:
            _fee, unit, payer, lines, total = household_plan(club=club, year=year, family=family, installment=installment)
        except ValidationError:
            if fee is None:
                payer = family.invoice_member or members[0].member
                lines = []
                total = Decimal("0.00")
            else:
                continue
        described = describe_bill_to(family, members)
        member_ids = [link.member_id for link in members] + ([family.invoice_member_id] if family.invoice_member_id else [])
        found = membership_invoices(club.id, year, member_ids, installment)
        member_objs = [link.member for link in members]
        covered = next((inv for inv in found if invoice_covers_members(inv, member_objs)), None)
        separate = [inv for inv in found if covered is None or inv.id != covered.id]
        if covered is not None:
            invoiced_lines = _lines_from_invoice(covered)
            if invoiced_lines:
                lines = invoiced_lines
            total = covered.total
        rows.append(_household_row(
            household_id=f"family-{family.id}",
            kind="family",
            name=family.name,
            member_count=len(members),
            payer=payer,
            payer_payload=payer_payload_from_description(described),
            needs_recipient=described["needs_recipient"],
            lines=lines,
            total=total,
            invoice=covered,
            separate_invoices=separate,
            fee_missing=fee is None,
            confirmed=f"family-{family.id}" in confirmed_keys,
        ))
    members = (
        Member.objects.filter(club=club, is_active=True)
        .exclude(id__in=in_family)
        .select_related("club_record__membership_fee")
        .prefetch_related("club_emails", "club_addresses")
    )
    for member in members:
        if fee is None:
            lines = []
            total = Decimal("0.00")
            payer = member
        else:
            _fee, _unit, payer, lines, total = household_plan(club=club, year=year, member=member, installment=installment)
        invoice = existing_membership_invoice(club.id, year, [member.id], installment)
        if invoice is not None:
            invoiced_lines = _lines_from_invoice(invoice)
            if invoiced_lines:
                lines = invoiced_lines
            total = invoice.total
        rows.append(_household_row(
            household_id=f"member-{member.id}",
            kind="member",
            name=f"{member.first_name} {member.last_name}",
            member_count=1,
            payer=payer,
            lines=lines,
            total=total,
            invoice=invoice,
            fee_missing=fee is None,
            confirmed=f"member-{member.id}" in confirmed_keys,
        ))
    return rows


def _household_row(*, household_id, kind, name, member_count, payer, lines, total, invoice, fee_missing, confirmed=False, payer_payload=None, needs_recipient=False, separate_invoices=None):
    separate_invoices = list(separate_invoices or [])
    status = "ready"
    blocker = ""
    shown_total = invoice.total if invoice is not None else total
    if fee_missing:
        status = "blocked"
        blocker = "Set a membership fee first."
    elif invoice is not None:
        status = "paid" if invoice.status == Invoice.Status.PAID else "invoiced"
    elif separate_invoices:
        status = "separate"
    elif needs_recipient:
        status = "blocked"
        blocker = "Choose who receives the bill."
    elif Decimal(str(total)) <= Decimal("0.00") and confirmed:
        status = "confirmed"
    if payer_payload is None:
        payer_payload = _payer_payload(payer)
    membership_lines = [line for line in lines if not line.get("supplementary")]
    return {
        "id": household_id,
        "kind": kind,
        "name": name,
        "member_count": member_count,
        "payer": payer_payload,
        "lines": lines,
        "total": f"{Decimal(shown_total):.2f}",
        "status": status,
        "invoice_id": invoice.id if invoice else None,
        "invoice_number": invoice.invoice_number if invoice else None,
        "invoice_status": invoice.status if invoice else None,
        "member_invoices": [_member_invoice_payload(row) for row in separate_invoices],
        "delivery": payer_payload["delivery"] if invoice is None else (invoice.delivery_method or payer_payload["delivery"]),
        "needs_recipient": bool(needs_recipient and invoice is None and not separate_invoices and not fee_missing),
        "blocker": blocker,
        "fee_id": membership_lines[0]["fee_id"] if len(membership_lines) == 1 else None,
        "fee_name": (
            membership_lines[0]["fee_name"]
            if membership_lines and len({line.get("fee_id") for line in membership_lines}) == 1
            else ""
        ),
        "confirmed": bool(confirmed),
    }


def parse_household_id(value: str) -> tuple[str, int]:
    kind, _, raw_id = str(value or "").partition("-")
    try:
        return kind, int(raw_id)
    except (TypeError, ValueError) as error:
        raise ValidationError({"household": "Unknown household."}) from error


def _resolve_household(club, household_id: str):
    kind, pk = parse_household_id(household_id)
    family = None
    member = None
    if kind == "family":
        family = Family.objects.filter(pk=pk, club=club).first()
        if family is None:
            return None, None, None, "Family not found."
        member_ids = list(family.memberships.values_list("member_id", flat=True))
        if family.invoice_member_id:
            member_ids.append(family.invoice_member_id)
        return family, member, member_ids, None
    if kind == "member":
        member = Member.objects.filter(pk=pk, club=club).first()
        if member is None:
            return None, None, None, "Member not found."
        return family, member, [member.id], None
    return None, None, None, "Unknown household."


def preview_household(*, club, year: int, household_id: str, installment: int):
    family, member, member_ids, error = _resolve_household(club, household_id)
    if error:
        return None
    if family is not None:
        members = ordered_memberships(family)
        described = describe_bill_to(family, members)
        name = family.name
        kind = "family"
    else:
        described = member_recipient(member)
        name = described["name"]
        kind = "member"
    fee, unit, _payer, lines, total = household_plan(
        club=club, year=year, family=family, member=member, installment=installment
    )
    already_invoiced = existing_membership_invoice(club.id, year, member_ids, installment) is not None
    already_confirmed = (
        not already_invoiced
        and Decimal(total) <= Decimal("0.00")
        and MembershipYearConfirmation.objects.filter(
            club=club,
            year=year,
            installment=installment,
            household_key=household_id,
        ).exists()
    )
    return {
        "household_id": household_id,
        "kind": kind,
        "name": name,
        "year": year,
        "installment": installment,
        "billings": billing_catalog(club, year),
        "fee_id": fee.id,
        "fee_name": fee.name,
        "unit_amount": str(unit) if unit is not None else "",
        "payer_id": described["id"],
        "payer_name": described["name"],
        "payer_kind": described["kind"],
        "needs_recipient": described["needs_recipient"],
        "lines": lines,
        "total": str(total),
        "license_fee": license_fee_snapshot(club, year),
        "already_invoiced": already_invoiced,
        "already_confirmed": already_confirmed,
    }


def _void_zero_invoice(invoice: Invoice) -> None:
    invoice.status = Invoice.Status.VOID
    invoice.save(update_fields=["status", "updated_at"])
    order = invoice.order
    order.status = Order.Status.CANCELLED
    order.save(update_fields=["status", "updated_at"])
    OrderItem.objects.filter(order=order, charge_active=True).update(charge_active=False)
    cancel_pending_payments_for_invoice(invoice)


def confirm_households(*, club, year: int, household_ids: list[str], actor=None, installment: int = 1) -> dict:
    confirmed = []
    skipped = []
    for household_id in household_ids:
        family, member, member_ids, error = _resolve_household(club, household_id)
        if error:
            skipped.append({"id": household_id, "reason": error})
            continue
        if existing_membership_invoice(club.id, year, member_ids, installment):
            skipped.append({"id": household_id, "reason": "Already invoiced."})
            continue
        try:
            _fee, _unit, _payer, _lines, total = household_plan(
                club=club, year=year, family=family, member=member, installment=installment
            )
        except ValidationError as error:
            skipped.append({"id": household_id, "reason": str(error.detail if hasattr(error, "detail") else error)})
            continue
        if total > Decimal("0.00"):
            skipped.append({"id": household_id, "reason": "This household has an amount to invoice."})
            continue
        MembershipYearConfirmation.objects.get_or_create(
            club=club,
            year=year,
            installment=installment,
            household_key=household_id,
            defaults={
                "confirmed_by": actor if actor and getattr(actor, "is_authenticated", False) else None,
            },
        )
        confirmed.append({"id": household_id})
    return {
        "year": year,
        "installment": installment,
        "confirmed": confirmed,
        "skipped": skipped,
        "confirmed_count": len(confirmed),
    }


def settle_zero_euro_membership_invoices(*, club=None, actor=None) -> int:
    invoices = (
        Invoice.objects.filter(
            status=Invoice.Status.ISSUED,
            total=Decimal("0.00"),
            order__ledger=Order.Ledger.CLUB,
        )
        .filter(
            Q(order__items__fee_type__isnull=True, order__items__license__isnull=True)
            & (
                Q(order__items__billing_year__isnull=False)
                | Q(order__items__description__icontains="membership")
            )
        )
        .select_related("order", "club")
        .distinct()
    )
    if club is not None:
        invoices = invoices.filter(club=club)
    settled = 0
    clubs_years: dict[tuple[int, int], list[Invoice]] = {}
    for invoice in invoices:
        year = (
            invoice.order.items.filter(billing_year__isnull=False).values_list("billing_year", flat=True).first()
        )
        if year is None:
            continue
        clubs_years.setdefault((invoice.club_id, year), []).append(invoice)
    from clubs.models import Club

    for (club_id, year), rows in clubs_years.items():
        target = Club.objects.filter(pk=club_id).first()
        if target is None:
            continue
        households = {row["invoice_id"]: row for row in list_households(target, year) if row.get("invoice_id")}
        for invoice in rows:
            household = households.get(invoice.id)
            _void_zero_invoice(invoice)
            if household:
                MembershipYearConfirmation.objects.get_or_create(
                    club=target,
                    year=year,
                    installment=1,
                    household_key=household["id"],
                    defaults={
                        "confirmed_by": actor if actor and getattr(actor, "is_authenticated", False) else None,
                    },
                )
            settled += 1
    return settled


def issue_households(*, club, year: int, household_ids: list[str], actor=None, installment: int = 1) -> dict:
    if membership_fee_for_club(club) is None:
        raise ValidationError({"fee": "Set a membership fee first."})
    created = []
    skipped = []
    for household_id in household_ids:
        family, member, member_ids, error = _resolve_household(club, household_id)
        if error:
            skipped.append({"id": household_id, "reason": error})
            continue
        if existing_membership_invoice(club.id, year, member_ids, installment):
            skipped.append({"id": household_id, "reason": "Already invoiced."})
            continue
        if family is not None:
            family_members = ordered_memberships(family)
            try:
                persist_default_recipient(family, family_members)
            except ValidationError:
                skipped.append({"id": household_id, "reason": "Choose who receives the bill."})
                continue
            family.refresh_from_db()
            recipient = describe_bill_to(family, ordered_memberships(family))
        else:
            recipient = member_recipient(member)
        _fee, _unit, _payer, lines, total = household_plan(
            club=club, year=year, family=family, member=member, installment=installment
        )
        if total <= Decimal("0.00") and MembershipYearConfirmation.objects.filter(
            club=club,
            year=year,
            installment=installment,
            household_key=household_id,
        ).exists():
            skipped.append({"id": household_id, "reason": "Already confirmed for this year."})
            continue
        invoice = create_membership_invoice(
            club=club,
            year=year,
            payer=recipient["ledger_member"],
            lines=lines,
            total=total,
            actor=actor,
            recipient=recipient,
            installment=installment,
        )
        created.append(
            {
                "id": household_id,
                "order_id": invoice.order_id,
                "invoice_id": invoice.id,
                "invoice_number": invoice.invoice_number,
                "delivery": invoice.delivery_method,
                "total": str(invoice.total),
            }
        )
    return {
        "year": year,
        "installment": installment,
        "created": created,
        "skipped": skipped,
        "created_count": len(created),
        "email_count": sum(1 for row in created if row["delivery"] == MemberRecord.InvoiceDelivery.EMAIL),
        "post_count": sum(1 for row in created if row["delivery"] == MemberRecord.InvoiceDelivery.POST),
        "hand_count": sum(1 for row in created if row["delivery"] == MemberRecord.InvoiceDelivery.HAND),
    }


def paper_invoices(club_id: int, year: int, methods: list[str], installment: int | None = None):
    invoices = (
        Invoice.objects.filter(
            club_id=club_id,
            order__ledger=Order.Ledger.CLUB,
            delivery_method__in=methods,
            status__in=[Invoice.Status.ISSUED, Invoice.Status.PAID],
            total__gt=Decimal("0.00"),
        )
        .filter(
            Q(order__items__billing_year=year)
            | Q(order__items__billing_year__isnull=True, order__items__description__startswith=f"Membership {year}")
        )
    )
    if installment is not None:
        invoices = invoices.filter(
            Exists(
                OrderItem.objects.filter(order_id=OuterRef("order_id")).filter(_installment_filter(installment))
            )
        )
    return (
        invoices.select_related("order", "club", "member")
        .prefetch_related("order__items", "credit_notes", "payments", "member__club_addresses")
        .distinct()
        .order_by("member__last_name", "member__first_name", "id")
    )


class ClubBillingView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from clubs.models import Club

        club_id = _require_club(request)
        try:
            year = int(request.query_params.get("year") or timezone.now().year)
        except (TypeError, ValueError):
            year = timezone.now().year
        club = Club.objects.filter(pk=club_id).first()
        installment = resolve_installment(club, year, request.query_params.get("installment"))
        households = list_households(club, year, installment)
        ready = [row for row in households if row["status"] == "ready"]
        complimentary = [row for row in households if row["status"] == "complimentary"]
        print_pack_count = paper_invoices(
            club_id,
            year,
            [MemberRecord.InvoiceDelivery.POST, MemberRecord.InvoiceDelivery.HAND],
            installment,
        ).count()
        return Response(
            {
                "year": year,
                "installment": installment,
                "billings": billing_catalog(club, year),
                "license_fee": license_fee_snapshot(club, year),
                "fee_set": membership_fee_for_club(club) is not None,
                "fees": active_fees_for_club(club, year),
                "households": households,
                "summary": {
                    "ready_count": len(ready),
                    "ready_total": str(sum((Decimal(row["total"]) for row in ready), Decimal("0.00"))),
                    "email_count": sum(1 for row in ready if row["delivery"] == "email"),
                    "post_count": sum(1 for row in ready if row["delivery"] == "post"),
                    "hand_count": sum(1 for row in ready if row["delivery"] == "hand"),
                    "complimentary_count": len(complimentary),
                    "confirmed_count": sum(1 for row in households if row["status"] == "confirmed"),
                    "invoiced_count": sum(1 for row in households if row["status"] in {"invoiced", "paid"}),
                    "print_pack_count": print_pack_count,
                },
            }
        )

    def post(self, request):
        from clubs.models import Club

        club_id = _require_club(request)
        try:
            year = int(request.data.get("year") or timezone.now().year)
        except (TypeError, ValueError):
            return Response({"year": "Enter a valid year."}, status=HTTP_400_BAD_REQUEST)
        ids = request.data.get("household_ids") or []
        if not isinstance(ids, list) or not ids:
            return Response({"household_ids": "Select at least one household."}, status=HTTP_400_BAD_REQUEST)
        club = Club.objects.filter(pk=club_id).first()
        installment = resolve_installment(club, year, request.data.get("installment"))
        result = issue_households(
            club=club, year=year, household_ids=ids, actor=request.user, installment=installment
        )
        return Response(result, status=201)


class ClubBillingHouseholdView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from clubs.models import Club

        club_id = _require_club(request)
        try:
            year = int(request.query_params.get("year") or timezone.now().year)
        except (TypeError, ValueError):
            year = timezone.now().year
        household_id = str(request.query_params.get("household") or "").strip()
        if not household_id:
            return Response({"detail": "Choose a household."}, status=HTTP_400_BAD_REQUEST)
        club = Club.objects.filter(pk=club_id).first()
        if club is None:
            return Response({"detail": "Club not found."}, status=HTTP_404_NOT_FOUND)
        installment = resolve_installment(club, year, request.query_params.get("installment"))
        payload = preview_household(
            club=club, year=year, household_id=household_id, installment=installment
        )
        if payload is None:
            return Response({"detail": "Household not found."}, status=HTTP_404_NOT_FOUND)
        return Response(payload)


class ClubBillingConfirmView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        from clubs.models import Club

        club_id = _require_club(request)
        try:
            year = int(request.data.get("year") or timezone.now().year)
        except (TypeError, ValueError):
            return Response({"year": "Enter a valid year."}, status=HTTP_400_BAD_REQUEST)
        ids = request.data.get("household_ids") or []
        if not isinstance(ids, list) or not ids:
            return Response({"household_ids": "Select at least one household."}, status=HTTP_400_BAD_REQUEST)
        club = Club.objects.filter(pk=club_id).first()
        installment = resolve_installment(club, year, request.data.get("installment"))
        result = confirm_households(
            club=club, year=year, household_ids=ids, actor=request.user, installment=installment
        )
        return Response(result, status=200)


class ClubBillingPrintPackView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from licenses.pdf_utils import render_billing_print_pack_pdf

        club_id = _require_club(request)
        try:
            year = int(request.query_params.get("year") or timezone.now().year)
        except (TypeError, ValueError):
            year = timezone.now().year
        method = (request.query_params.get("method") or "paper").strip()
        methods = (
            [MemberRecord.InvoiceDelivery.POST, MemberRecord.InvoiceDelivery.HAND]
            if method == "paper"
            else [method]
        )
        from clubs.models import Club

        club = Club.objects.filter(pk=club_id).first()
        installment = None
        if request.query_params.get("installment") not in (None, ""):
            installment = resolve_installment(club, year, request.query_params.get("installment"))
        invoices = list(paper_invoices(club_id, year, methods, installment))
        if not invoices:
            return Response(
                {
                    "detail": "There are no postal or in-person invoices to print yet. Issue invoices first, then print this pack."
                },
                status=HTTP_400_BAD_REQUEST,
            )
        pdf = render_billing_print_pack_pdf(invoices, year=year, base_url=request.build_absolute_uri("/"))
        if not pdf:
            return Response({"detail": "PDF generation is not available."}, status=500)
        now = timezone.now()
        Invoice.objects.filter(id__in=[invoice.id for invoice in invoices], delivered_at__isnull=True).update(
            delivered_at=now
        )
        response = HttpResponse(pdf, content_type="application/pdf")
        response["Content-Disposition"] = f'inline; filename="membership_pack_{year}.pdf"'
        return response


class ClubBillingAssignFeeView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        club_id = _require_club(request)
        try:
            member_id = int(request.data.get("member"))
            fee_id = int(request.data.get("fee"))
        except (TypeError, ValueError):
            return Response({"detail": "Choose a member and a membership fee."}, status=HTTP_400_BAD_REQUEST)
        member = Member.objects.filter(pk=member_id, club_id=club_id).first()
        if member is None:
            return Response({"member": "Member not found in this club."}, status=HTTP_400_BAD_REQUEST)
        fee = MembershipFee.objects.filter(pk=fee_id, club_id=club_id, is_active=True).first()
        if fee is None:
            return Response({"fee": "Membership fee not found."}, status=HTTP_400_BAD_REQUEST)
        record, _created = MemberRecord.objects.get_or_create(member=member)
        record.membership_fee = fee
        record.save(update_fields=["membership_fee"])
        return Response({"member": member.id, "fee": fee.id, "fee_name": fee.name})


class ClubBillingMemberLicenseFeeView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        club_id = _require_club(request)
        try:
            member_id = int(request.data.get("member"))
        except (TypeError, ValueError):
            return Response({"detail": "Choose a member."}, status=HTTP_400_BAD_REQUEST)
        pays = request.data.get("pays_license_fee")
        if not isinstance(pays, bool):
            return Response({"detail": "Choose whether this member pays the license fee."}, status=HTTP_400_BAD_REQUEST)
        member = Member.objects.filter(pk=member_id, club_id=club_id).first()
        if member is None:
            return Response({"detail": "Member not found in this club."}, status=HTTP_400_BAD_REQUEST)
        record, _created = MemberRecord.objects.get_or_create(member=member)
        record.pays_license_fee = pays
        record.save(update_fields=["pays_license_fee"])
        return Response({"member": member.id, "pays_license_fee": record.pays_license_fee})


def _request_year(raw) -> int:
    try:
        return int(raw if raw not in (None, "") else timezone.now().year)
    except (TypeError, ValueError) as error:
        raise ValidationError({"year": "Enter a valid year."}) from error


def _club_for_request(request):
    from clubs.models import Club

    club_id = _require_club(request)
    club = Club.objects.filter(pk=club_id).first()
    if club is None:
        raise ValidationError({"club": "Select a club."})
    return club


class MembershipBillingListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        club = _club_for_request(request)
        year = _request_year(request.query_params.get("year"))
        return Response({"year": year, "billings": billing_catalog(club, year)})

    def post(self, request):
        club = _club_for_request(request)
        year = _request_year(request.data.get("year"))
        add_membership_billing(club=club, year=year, label=request.data.get("label") or "")
        return Response({"year": year, "billings": billing_catalog(club, year)}, status=201)


class MembershipBillingDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, billing_id: int):
        club = _club_for_request(request)
        billing = MembershipBilling.objects.filter(pk=billing_id, club=club).first()
        if billing is None:
            return Response({"detail": "Billing not found."}, status=HTTP_404_NOT_FOUND)
        if "label" in request.data:
            billing.label = str(request.data.get("label") or "").strip()[:80]
            billing.save(update_fields=["label"])
        if "charges_license_fee" in request.data:
            if request.data.get("charges_license_fee") is not True:
                return Response({"detail": "Choose one billing for the license fee."}, status=HTTP_400_BAD_REQUEST)
            with transaction.atomic():
                MembershipBilling.objects.filter(club=club, year=billing.year).exclude(pk=billing.pk).update(
                    charges_license_fee=False
                )
                billing.charges_license_fee = True
                billing.save(update_fields=["charges_license_fee"])
        return Response(
            {
                "id": billing.id,
                "sequence": billing.sequence,
                "label": billing.label,
                "year": billing.year,
                "charges_license_fee": billing.charges_license_fee,
            }
        )

    def delete(self, request, billing_id: int):
        club = _club_for_request(request)
        billing = MembershipBilling.objects.filter(pk=billing_id, club=club).first()
        if billing is None:
            return Response({"detail": "Billing not found."}, status=HTTP_404_NOT_FOUND)
        if installment_has_activity(club.id, billing.year, billing.sequence):
            return Response(
                {"detail": "This billing already has invoices or confirmations."},
                status=HTTP_400_BAD_REQUEST,
            )
        selected = billing.charges_license_fee
        year = billing.year
        billing.delete()
        if selected:
            successor = MembershipBilling.objects.filter(club=club, year=year).order_by("sequence", "id").first()
            if successor is not None and not successor.charges_license_fee:
                successor.charges_license_fee = True
                successor.save(update_fields=["charges_license_fee"])
        return Response(status=204)


class ClubLicenseFeeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        club = _club_for_request(request)
        return Response(license_fee_detail(club))

    def put(self, request):
        club = _club_for_request(request)
        amount = _parse_money(request.data.get("amount", "0"), "amount") if "amount" in request.data else None
        if amount is None and ClubLicenseFee.objects.filter(club=club).first() is None:
            amount = Decimal("0.00")
        save_license_fee(club=club, name=request.data.get("name"), amount=amount, as_new_price=False)
        return Response(license_fee_detail(club))


class ClubLicenseFeePriceView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        club = _club_for_request(request)
        if request.data.get("amount") in (None, ""):
            raise ValidationError({"amount": "Amount is required."})
        amount = _parse_money(request.data.get("amount"), "amount")
        raw_date = request.data.get("effective_from") or timezone.localdate().isoformat()
        try:
            effective_from = date.fromisoformat(str(raw_date))
        except ValueError as error:
            raise ValidationError({"effective_from": "Enter a valid date."}) from error
        save_license_fee(
            club=club,
            name=request.data.get("name"),
            amount=amount,
            effective_from=effective_from,
            as_new_price=True,
        )
        return Response(license_fee_detail(club), status=201)
