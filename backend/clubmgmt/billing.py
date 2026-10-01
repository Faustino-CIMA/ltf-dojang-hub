from __future__ import annotations

from decimal import Decimal

from django.db import transaction
from django.db.models import Q
from django.http import HttpResponse
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.status import HTTP_400_BAD_REQUEST
from rest_framework.views import APIView

from licenses.models import Invoice, Order, OrderItem
from licenses.services import cancel_pending_payments_for_invoice
from members.models import Member

from .access import can_manage_club_records
from .guardians import needs_explicit_recipient, ordered_memberships, resolve_ledger_member
from .models import (
    Family,
    FamilyRebateRule,
    MemberRecord,
    MembershipFee,
    MembershipFeePrice,
    MembershipYearConfirmation,
)


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
    }


def household_plan(*, club, year: int, family=None, member=None):
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
            line = _line_payload(member=link.member, fee=fee, year=year, rank=index, rule=rules.get(index))
            lines.append(line)
            total += Decimal(line["amount"])
        return default_fee, None, payer, lines, total
    if member is None:
        raise ValidationError({"member": "Choose a member or family."})
    fee = fee_for_member(club, member) or default_fee
    line = _line_payload(member=member, fee=fee, year=year, rank=1)
    return fee, Decimal(line["unit_amount"]), member, [line], Decimal(line["amount"])


def _membership_invoices_q(club_id: int, year: int, member_ids: list[int]):
    if not member_ids:
        return OrderItem.objects.none()
    return (
        OrderItem.objects.filter(
            order__club_id=club_id,
            order__ledger=Order.Ledger.CLUB,
            fee_type__isnull=True,
            license__isnull=True,
            order__invoice__status__in=[Invoice.Status.ISSUED, Invoice.Status.PAID],
            order__member_id__in=member_ids,
        ).filter(
            Q(billing_year=year)
            | Q(billing_year__isnull=True, description__startswith=f"Membership {year}")
        )
    )


def membership_invoices(club_id: int, year: int, member_ids: list[int]) -> list[Invoice]:
    if not member_ids:
        return []
    invoice_ids = _membership_invoices_q(club_id, year, member_ids).values_list("order__invoice__id", flat=True)
    return list(
        Invoice.objects.filter(id__in=invoice_ids)
        .select_related("member", "order")
        .prefetch_related("order__items")
        .order_by("-id")
    )


def existing_membership_invoice(club_id: int, year: int, member_ids: list[int]) -> Invoice | None:
    found = membership_invoices(club_id, year, member_ids)
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


def _lines_from_invoice(invoice: Invoice) -> list[dict]:
    rows = []
    for index, item in enumerate(invoice.order.items.all(), start=1):
        amount = (Decimal(item.price_snapshot) * item.quantity).quantize(Decimal("0.01"))
        rows.append(
            {
                "member_id": item.id,
                "member_name": _name_on_invoice_line(item.description) or item.description,
                "rank": index,
                "percent_off": "0.00",
                "amount_off": "",
                "amount": f"{amount:.2f}",
                "fee_id": None,
                "fee_name": "",
                "unit_amount": f"{amount:.2f}",
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


def create_membership_invoice(*, club, year: int, payer, lines, total, actor=None, recipient=None) -> Invoice:
    if recipient is None:
        recipient = member_recipient(payer)
    delivery = recipient["delivery"]
    emails = [str(email).strip() for email in (recipient.get("emails") or []) if str(email).strip()]
    with transaction.atomic():
        order = Order.objects.create(
            club=club,
            member=payer,
            ledger=Order.Ledger.CLUB,
            status=Order.Status.PENDING,
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
                billing_club=club,
                price_snapshot=line["amount"],
                quantity=1,
            )
        invoice = Invoice.objects.create(
            order=order,
            club=club,
            member=payer,
            status=Invoice.Status.ISSUED,
            currency="EUR",
            subtotal=total,
            tax_total=Decimal("0.00"),
            total=total,
            issued_at=timezone.now(),
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


def list_households(club, year: int) -> list[dict]:
    fee = membership_fee_for_club(club)
    confirmed_keys = set(
        MembershipYearConfirmation.objects.filter(club=club, year=year).values_list("household_key", flat=True)
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
            _fee, unit, payer, lines, total = household_plan(club=club, year=year, family=family)
        except ValidationError:
            if fee is None:
                payer = family.invoice_member or members[0].member
                lines = []
                total = Decimal("0.00")
            else:
                continue
        described = describe_bill_to(family, members)
        member_ids = [link.member_id for link in members] + ([family.invoice_member_id] if family.invoice_member_id else [])
        found = membership_invoices(club.id, year, member_ids)
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
            _fee, _unit, payer, lines, total = household_plan(club=club, year=year, member=member)
        invoice = existing_membership_invoice(club.id, year, [member.id])
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
    elif Decimal(str(total)) <= Decimal("0.00"):
        status = "confirmed" if confirmed else "complimentary"
    if payer_payload is None:
        payer_payload = _payer_payload(payer)
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
        "fee_id": lines[0]["fee_id"] if len(lines) == 1 else None,
        "fee_name": (
            lines[0]["fee_name"]
            if lines and len({line.get("fee_id") for line in lines}) == 1
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


def _void_zero_invoice(invoice: Invoice) -> None:
    invoice.status = Invoice.Status.VOID
    invoice.save(update_fields=["status", "updated_at"])
    order = invoice.order
    order.status = Order.Status.CANCELLED
    order.save(update_fields=["status", "updated_at"])
    OrderItem.objects.filter(order=order, charge_active=True).update(charge_active=False)
    cancel_pending_payments_for_invoice(invoice)


def confirm_households(*, club, year: int, household_ids: list[str], actor=None) -> dict:
    confirmed = []
    skipped = []
    for household_id in household_ids:
        family, member, member_ids, error = _resolve_household(club, household_id)
        if error:
            skipped.append({"id": household_id, "reason": error})
            continue
        if existing_membership_invoice(club.id, year, member_ids):
            skipped.append({"id": household_id, "reason": "Already invoiced."})
            continue
        try:
            _fee, _unit, _payer, _lines, total = household_plan(club=club, year=year, family=family, member=member)
        except ValidationError as error:
            skipped.append({"id": household_id, "reason": str(error.detail if hasattr(error, "detail") else error)})
            continue
        if total > Decimal("0.00"):
            skipped.append({"id": household_id, "reason": "This household has an amount to invoice."})
            continue
        MembershipYearConfirmation.objects.get_or_create(
            club=club,
            year=year,
            household_key=household_id,
            defaults={
                "confirmed_by": actor if actor and getattr(actor, "is_authenticated", False) else None,
            },
        )
        confirmed.append({"id": household_id})
    return {
        "year": year,
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
                    household_key=household["id"],
                    defaults={
                        "confirmed_by": actor if actor and getattr(actor, "is_authenticated", False) else None,
                    },
                )
            settled += 1
    return settled


def issue_households(*, club, year: int, household_ids: list[str], actor=None) -> dict:
    if membership_fee_for_club(club) is None:
        raise ValidationError({"fee": "Set a membership fee first."})
    created = []
    skipped = []
    for household_id in household_ids:
        family, member, member_ids, error = _resolve_household(club, household_id)
        if error:
            skipped.append({"id": household_id, "reason": error})
            continue
        if existing_membership_invoice(club.id, year, member_ids):
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
        _fee, _unit, _payer, lines, total = household_plan(club=club, year=year, family=family, member=member)
        if total <= Decimal("0.00"):
            skipped.append({"id": household_id, "reason": "Complimentary membership is confirmed, not invoiced."})
            continue
        invoice = create_membership_invoice(
            club=club,
            year=year,
            payer=recipient["ledger_member"],
            lines=lines,
            total=total,
            actor=actor,
            recipient=recipient,
        )
        created.append(
            {
                "id": household_id,
                "invoice_id": invoice.id,
                "invoice_number": invoice.invoice_number,
                "delivery": invoice.delivery_method,
                "total": str(invoice.total),
            }
        )
    return {
        "year": year,
        "created": created,
        "skipped": skipped,
        "created_count": len(created),
        "email_count": sum(1 for row in created if row["delivery"] == MemberRecord.InvoiceDelivery.EMAIL),
        "post_count": sum(1 for row in created if row["delivery"] == MemberRecord.InvoiceDelivery.POST),
        "hand_count": sum(1 for row in created if row["delivery"] == MemberRecord.InvoiceDelivery.HAND),
    }


def paper_invoices(club_id: int, year: int, methods: list[str]):
    return (
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
        .select_related("order", "club", "member")
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
        households = list_households(club, year)
        ready = [row for row in households if row["status"] == "ready"]
        complimentary = [row for row in households if row["status"] == "complimentary"]
        print_pack_count = paper_invoices(
            club_id,
            year,
            [MemberRecord.InvoiceDelivery.POST, MemberRecord.InvoiceDelivery.HAND],
        ).count()
        return Response(
            {
                "year": year,
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
        result = issue_households(club=club, year=year, household_ids=ids, actor=request.user)
        return Response(result, status=201)


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
        result = confirm_households(club=club, year=year, household_ids=ids, actor=request.user)
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
        invoices = list(paper_invoices(club_id, year, methods))
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
