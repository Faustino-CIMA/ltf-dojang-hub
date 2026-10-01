from __future__ import annotations

import base64
import re
from decimal import Decimal
from io import BytesIO
from pathlib import Path

from django.conf import settings
from django.template.loader import render_to_string

from .models import Invoice, Order

_MONTHS = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")
_ZERO_FAMILY_REBATE = re.compile(
    r"\s*\((?:0+(?:[.,]0+)?\s*%|0+(?:[.,]0+)?\s*EUR)\s+family rebate\)",
    re.IGNORECASE,
)
_LTF_LETTERHEAD = {
    "name": "Luxembourg Taekwondo Federation",
    "lines": ["3, Route d'Arlon", "L-8009 Strassen", "LUXEMBOURG"],
    "iban": "LU86 0019 7555 4777 2000",
    "bic": "BCEELULL",
    "email": "secretariat@luxembourgtaekwondo.lu",
    "website": "https://www.luxembourgtaekwondo.lu",
}

try:
    from weasyprint import HTML
except Exception:  # pragma: no cover - handled at runtime
    HTML = None

try:
    import qrcode
except Exception:  # pragma: no cover - handled at runtime
    qrcode = None


def license_product_label(name: str, year) -> str:
    """Annual Standard 2026 is printed as Annual St 2026. Standard is always St."""
    label = re.sub(r"\bstandard\b", "St", (name or "License").strip(), flags=re.IGNORECASE)
    label = re.sub(r"\s+", " ", label).strip() or "License"
    year_text = str(year or "").strip()
    if year_text and year_text not in label.split():
        return f"{label} {year_text}"
    return label


def euro_amount(amount) -> str:
    value = Decimal(amount or 0).quantize(Decimal("0.01"))
    sign = "-" if value < 0 else ""
    return f"{sign}{abs(value):.2f}".replace(".", ",") + " €"


def _short_date(value) -> str:
    if not value:
        return ""
    day = value.date() if hasattr(value, "hour") else value
    return f"{day.day} {_MONTHS[day.month - 1]} {day.year}"


def _postal_locality(postal_code: str, locality: str) -> str:
    postal = (postal_code or "").strip()
    place = (locality or "").strip()
    if re.fullmatch(r"\d{4}", postal):
        postal = f"L-{postal}"
    return " ".join(part for part in (postal, place) if part)


def _club_lines(club) -> list[str]:
    if club is None:
        return []
    lines = [line for line in (getattr(club, "address_line1", ""), getattr(club, "address_line2", "")) if str(line or "").strip()]
    if not lines and getattr(club, "address", ""):
        lines.append(str(club.address).strip())
    postal = _postal_locality(
        getattr(club, "postal_code", ""),
        getattr(club, "locality", "") or getattr(club, "city", ""),
    )
    if postal:
        lines.append(postal)
    return lines


_QR_BLUE = "#0081b0"


def _asset_file_uri(asset) -> str:
    if asset is None or not getattr(asset, "file", None):
        return ""
    try:
        path = Path(asset.file.path)
    except (NotImplementedError, ValueError, OSError):
        return ""
    if path.suffix.lower() == ".svg":
        try:
            text = path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            return ""
        embedded = re.search(r'href="(data:image/png;base64,[^"]+)"', text)
        if embedded:
            return embedded.group(1)
    try:
        return path.resolve().as_uri()
    except (OSError, ValueError):
        return ""


def _selected_logo_uri(logos, preferred) -> str:
    chosen = None
    for usage in preferred:
        chosen = next((row for row in logos if row.usage_type == usage), None)
        if chosen:
            break
    if chosen is None and logos:
        chosen = logos[0]
    return _asset_file_uri(chosen)


def _club_logo_uri(club) -> str:
    if club is None:
        return ""
    from clubs.models import BrandingAsset

    logos = list(
        BrandingAsset.objects.filter(
            club=club,
            asset_type=BrandingAsset.AssetType.LOGO,
            is_selected=True,
        )
    )
    return _selected_logo_uri(
        logos,
        (
            BrandingAsset.UsageType.INVOICE,
            BrandingAsset.UsageType.PRINT,
            BrandingAsset.UsageType.GENERAL,
            BrandingAsset.UsageType.DIGITAL,
        ),
    )


def _bundled_logo_uri(filename: str) -> str:
    path = Path(__file__).resolve().parents[1] / "templates" / "finance" / filename
    if not path.is_file():
        return ""
    try:
        return path.resolve().as_uri()
    except (OSError, ValueError):
        return ""


def _invoice_sans_uris() -> dict[str, str]:
    """Arial-metric faces so club invoices match the model letterhead."""
    names = {
        "regular": "fonts/LiberationSans-Regular.ttf",
        "bold": "fonts/LiberationSans-Bold.ttf",
        "italic": "fonts/LiberationSans-Italic.ttf",
        "bold_italic": "fonts/LiberationSans-BoldItalic.ttf",
    }
    return {key: _bundled_logo_uri(filename) for key, filename in names.items()}


def _grouped_iban(value: str) -> str:
    compact = re.sub(r"\s+", "", value or "")
    return " ".join(compact[index : index + 4] for index in range(0, len(compact), 4))


def _federation_logo_uri() -> str:
    bundled = Path(__file__).resolve().parents[1] / "templates" / "finance" / "ltf-letterhead-logo.jpg"
    if bundled.is_file():
        return bundled.resolve().as_uri()
    from clubs.models import BrandingAsset

    logos = list(
        BrandingAsset.objects.filter(
            scope_type=BrandingAsset.ScopeType.FEDERATION,
            asset_type=BrandingAsset.AssetType.LOGO,
            is_selected=True,
        )
    )
    preferred = (
        BrandingAsset.UsageType.INVOICE,
        BrandingAsset.UsageType.PRINT,
        BrandingAsset.UsageType.GENERAL,
        BrandingAsset.UsageType.DIGITAL,
    )
    chosen = None
    for usage in preferred:
        chosen = next((row for row in logos if row.usage_type == usage), None)
        if chosen:
            break
    if chosen is None and logos:
        chosen = logos[0]
    if chosen is None or not chosen.file:
        return ""
    try:
        path = Path(chosen.file.path)
        if path.suffix.lower() == ".svg":
            text = path.read_text(encoding="utf-8", errors="ignore")
            embedded = re.search(r'href="(data:image/png;base64,[^"]+)"', text)
            if embedded:
                return embedded.group(1)
        return path.resolve().as_uri()
    except (NotImplementedError, ValueError, OSError):
        return ""


def _issuer() -> dict:
    from clubs.models import FederationProfile

    profile = FederationProfile.objects.order_by("id").first()
    lines = []
    if profile is not None:
        lines = [
            line
            for line in (profile.address_line1, profile.address_line2)
            if str(line or "").strip()
        ]
        postal = _postal_locality(profile.postal_code, profile.locality)
        if postal:
            lines.append(postal)
        if lines and not any("luxembourg" in line.casefold() for line in lines):
            lines.append("LUXEMBOURG")
    iban = ""
    if profile is not None and str(profile.iban or "").strip():
        compact = re.sub(r"\s+", "", profile.iban)
        iban = " ".join(compact[index : index + 4] for index in range(0, len(compact), 4))
    return {
        "name": (profile.name if profile is not None and profile.name else _LTF_LETTERHEAD["name"]),
        "lines": lines or list(_LTF_LETTERHEAD["lines"]),
        "iban": iban or _LTF_LETTERHEAD["iban"],
        "bic": _LTF_LETTERHEAD["bic"],
        "email": _LTF_LETTERHEAD["email"],
        "website": _LTF_LETTERHEAD["website"],
        "logo_uri": _federation_logo_uri(),
    }


def _member_name(member) -> str:
    if member is None:
        return ""
    last = str(member.last_name or "").strip().upper()
    first = str(member.first_name or "").strip()
    return " ".join(part for part in (last, first) if part)


def _club_issuer(club) -> dict:
    lines = _club_lines(club)
    if lines and not any("luxembourg" in line.casefold() for line in lines):
        lines.append("LUXEMBOURG")
    return {
        "name": club.name if club is not None else "",
        "lines": lines,
        "iban": _grouped_iban(getattr(club, "iban", "") or ""),
        "email": str(getattr(club, "email", "") or "").strip(),
        "website": str(getattr(club, "website", "") or "").strip(),
        "logo_uri": _club_logo_uri(club),
    }


def _member_invoice_lines(member) -> list[str]:
    if member is None:
        return []
    try:
        from clubmgmt.billing import invoice_address

        address = invoice_address(member) or {}
    except Exception:
        return []
    number = str(address.get("house_number") or "").strip()
    street = str(address.get("street") or "").strip()
    if number and street:
        line1 = f"{number}, {street}"
    else:
        line1 = street or number
    lines = [line for line in (line1, str(address.get("line2") or "").strip()) if line]
    postal = _postal_locality(str(address.get("postal_code") or ""), str(address.get("locality") or ""))
    if postal:
        lines.append(postal)
    return lines


def _club_item_rows(items) -> list[dict]:
    rows = []
    for item in items:
        label = _ZERO_FAMILY_REBATE.sub("", invoice_item_label(item)).strip()
        size = ""
        if " · " in label:
            label, size = label.rsplit(" · ", 1)
            size = size.strip()
            label = _ZERO_FAMILY_REBATE.sub("", label).strip()
        rows.append(
            {
                "label": label,
                "size": size,
                "quantity": item.quantity,
                "unit_price": euro_amount(item.price_snapshot),
                "line_total": euro_amount(item.price_snapshot * item.quantity),
            }
        )
    return rows


def _license_rows(items) -> list[dict]:
    rows = []
    for item in items:
        license_row = item.license if item.license_id else None
        member = license_row.member if license_row is not None else None
        type_name = ""
        year = item.billing_year
        license_id = ""
        if license_row is not None:
            type_name = license_row.license_type.name if license_row.license_type_id else ""
            year = license_row.year or year
            if member is not None:
                license_id = str(member.ltf_licenseid or "").strip()
        rows.append(
            {
                "name": _member_name(member) or (item.description or ""),
                "license": license_product_label(type_name or item.description or "License", year),
                "license_id": license_id,
                "quantity": item.quantity,
                "unit_price": euro_amount(item.price_snapshot),
                "line_total": euro_amount(item.price_snapshot * item.quantity),
                "sort_name": _member_name(member).casefold(),
            }
        )
    rows.sort(key=lambda row: row["sort_name"])
    return rows


def _is_ltf_license_invoice(invoice: Invoice) -> bool:
    order = invoice.order
    if order.ledger != Order.Ledger.FEDERATION:
        return False
    return order.items.filter(license__isnull=False).exists()


def invoice_item_label(item) -> str:
    if item.license_id and item.license is not None:
        license_type = item.license.license_type
        name = license_type.name if license_type is not None else (item.description or "License")
        year = item.license.year
        return f"{name} {year}" if year else name
    description = (item.description or "").strip()
    year = item.billing_year
    if description:
        if year and str(year) not in description:
            return f"{description} {year}"
        return description
    fee_name = item.fee_type.name if item.fee_type_id else "Fee"
    return f"{fee_name} {year}" if year else fee_name


def build_invoice_context(invoice: Invoice) -> dict:
    order = invoice.order
    items = order.items.select_related(
        "license", "license__license_type", "license__member", "fee_type"
    ).all()
    item_rows = []
    for item in items:
        item_rows.append(
            {
                "label": invoice_item_label(item),
                "quantity": item.quantity,
                "unit_price": item.price_snapshot,
                "line_total": item.price_snapshot * item.quantity,
            }
        )
    payconiq_url = ""
    latest_payconiq = (
        invoice.payments.filter(provider="payconiq")
        .exclude(payconiq_payment_url="")
        .order_by("-created_at")
        .first()
    )
    if latest_payconiq:
        payconiq_url = latest_payconiq.payconiq_payment_url

    sepa_payload = build_sepa_payload(
        beneficiary=settings.INVOICE_SEPA_BENEFICIARY,
        iban=settings.INVOICE_SEPA_IBAN,
        bic=settings.INVOICE_SEPA_BIC,
        remittance=f"{settings.INVOICE_SEPA_REMITTANCE_PREFIX} {invoice.invoice_number}",
        amount=invoice.outstanding(),
        currency=invoice.currency,
    )

    payconiq_qr = build_qr_base64(payconiq_url) if payconiq_url else ""
    sepa_qr = build_qr_base64(sepa_payload) if sepa_payload else ""
    bill_to = None
    delivery_label = ""
    if invoice.member_id:
        try:
            from clubmgmt.billing import invoice_address, invoice_emails

            address = invoice_address(invoice.member)
            emails = invoice_emails(invoice.member)
            bill_to = {
                "name": f"{invoice.member.first_name} {invoice.member.last_name}",
                "email": emails[0] if emails else (invoice.member.email or ""),
                "address_lines": (address["formatted"].split("\n") if address else []),
            }
        except Exception:
            bill_to = {
                "name": f"{invoice.member.first_name} {invoice.member.last_name}",
                "email": invoice.member.email or "",
                "address_lines": [],
            }
        delivery_label = {
            Invoice.DeliveryMethod.EMAIL: "Email",
            Invoice.DeliveryMethod.POST: "Post",
            Invoice.DeliveryMethod.HAND: "In person",
        }.get(invoice.delivery_method, "")
    license_invoice = _is_ltf_license_invoice(invoice)
    club_invoice = order.ledger == Order.Ledger.CLUB and not license_invoice
    license_rows = _license_rows(items) if license_invoice else []
    club_rows = _club_item_rows(items) if club_invoice else []
    order_delivered = order.status == Order.Status.PAID
    invoice_paid = invoice.status == Invoice.Status.PAID
    if license_invoice:
        issuer = _issuer()
        recipient_name = invoice.club.name if invoice.club_id else ""
        recipient_lines = _club_lines(invoice.club)
        total_qty = sum(row["quantity"] for row in license_rows)
        sepa_slot_qr = build_qr_base64("SEPA", fill_color="#1d4e89")
        wero_slot_qr = build_qr_base64("WERO", fill_color="#1d4e89")
    elif club_invoice:
        issuer = _club_issuer(invoice.club)
        recipient_name = str(getattr(invoice, "bill_to_name", "") or "").strip() or _member_name(invoice.member)
        if not recipient_name and bill_to:
            recipient_name = bill_to["name"]
        snapshot_address = str(getattr(invoice, "bill_to_address", "") or "").strip()
        if snapshot_address:
            recipient_lines = [line.strip() for line in snapshot_address.splitlines() if line.strip()]
        else:
            recipient_lines = _member_invoice_lines(invoice.member)
        total_qty = sum(row["quantity"] for row in club_rows)
        due = invoice.outstanding()
        if due <= 0:
            due = invoice.total
        club_iban = re.sub(r"\s+", "", getattr(invoice.club, "iban", "") or "")
        club_sepa = build_sepa_payload(
            beneficiary=invoice.club.name if invoice.club_id else "",
            iban=club_iban,
            bic="",
            remittance=f"Invoice {invoice.invoice_number}",
            amount=due,
            currency=invoice.currency,
        )
        sepa_slot_qr = build_qr_base64(club_sepa or "SEPA", fill_color=_QR_BLUE, border=1, box_size=6)
        wero_slot_qr = build_qr_base64("WERO", fill_color=_QR_BLUE, border=1, box_size=6)
    else:
        issuer = None
        recipient_name = invoice.club.name if invoice.club_id else ""
        recipient_lines = []
        total_qty = 0
        sepa_slot_qr = ""
        wero_slot_qr = ""
    return {
        "invoice": invoice,
        "order": order,
        "club": invoice.club,
        "member": invoice.member,
        "bill_to": bill_to,
        "delivery_label": delivery_label,
        "items": item_rows,
        "payconiq_url": payconiq_url,
        "payconiq_qr": payconiq_qr,
        "sepa_payload": sepa_payload,
        "sepa_qr": sepa_qr,
        "sepa_slot_qr": sepa_slot_qr,
        "wero_slot_qr": wero_slot_qr,
        "credited_total": invoice.credited_total(),
        "outstanding": invoice.outstanding(),
        "license_invoice": license_invoice,
        "club_invoice": club_invoice,
        "license_rows": license_rows,
        "club_rows": club_rows,
        "issuer": issuer,
        "recipient_name": recipient_name,
        "recipient_lines": recipient_lines,
        "total_qty": total_qty,
        "total_amount": euro_amount(invoice.total),
        "issued_on": _short_date(invoice.issued_at),
        "paid_on": _short_date(invoice.paid_at),
        "ordered_on": _short_date(order.created_at),
        "fulfilled_on": _short_date(invoice.paid_at) if order_delivered else "",
        "invoice_status_label": invoice.get_status_display(),
        "order_status_label": "Delivered" if order_delivered else order.get_status_display(),
        "invoice_status_done": invoice_paid,
        "order_status_done": order_delivered,
        "pad_table": (len(license_rows) if license_invoice else len(club_rows)) <= 12,
        "footer_logos": {
            "world": _bundled_logo_uri("world-taekwondo.png"),
            "europe": _bundled_logo_uri("european-taekwondo.png"),
            "ltf": _bundled_logo_uri("ltf-letterhead-logo.jpg"),
        }
        if club_invoice
        else {},
        "invoice_fonts": _invoice_sans_uris() if club_invoice else {},
    }


def render_billing_print_pack_pdf(invoices: list, *, year: int, base_url: str) -> bytes | None:
    if HTML is None:
        return None
    from pypdf import PdfWriter

    pages = [build_invoice_context(invoice) for invoice in invoices]
    cover_html = render_to_string(
        "finance/billing_print_pack.html",
        {"year": year, "pages": pages, "count": len(pages)},
    )
    writer = PdfWriter()
    writer.append(BytesIO(HTML(string=cover_html, base_url=base_url).write_pdf()))
    for invoice in invoices:
        pdf = render_invoice_pdf(invoice, base_url=base_url)
        if pdf:
            writer.append(BytesIO(pdf))
    buffer = BytesIO()
    writer.write(buffer)
    return buffer.getvalue()


def render_statement_pdf(context: dict, *, base_url: str) -> bytes | None:
    if HTML is None:
        return None
    html = render_to_string("finance/statement_pdf.html", context)
    return HTML(string=html, base_url=base_url).write_pdf()


def render_invoice_pdf(invoice: Invoice, *, base_url: str) -> bytes | None:
    if HTML is None:
        return None
    context = build_invoice_context(invoice)
    if context["license_invoice"]:
        template = "finance/ltf_license_invoice_pdf.html"
    elif context["club_invoice"]:
        template = "finance/club_member_invoice_pdf.html"
    else:
        template = "finance/invoice_pdf.html"
    html = render_to_string(template, context)
    return HTML(string=html, base_url=base_url).write_pdf()


def build_qr_base64(payload: str, fill_color: str = "black", border: int = 2, box_size: int = 4) -> str:
    if not payload or qrcode is None:
        return ""
    qr = qrcode.QRCode(box_size=box_size, border=border)
    qr.add_data(payload)
    qr.make(fit=True)
    img = qr.make_image(fill_color=fill_color, back_color="white")
    buffer = BytesIO()
    img.save(buffer, format="PNG")
    return base64.b64encode(buffer.getvalue()).decode("ascii")


def build_sepa_payload(
    *,
    beneficiary: str,
    iban: str,
    bic: str,
    remittance: str,
    amount,
    currency: str,
) -> str:
    if not beneficiary or not iban or not currency:
        return ""
    normalized_amount = f"{amount:.2f}" if amount is not None else ""
    lines = [
        "BCD",
        "001",
        "1",
        "SCT",
        bic or "",
        beneficiary,
        iban,
        f"{currency}{normalized_amount}" if normalized_amount else "",
        "",
        "",
        remittance,
    ]
    return "\n".join(lines).strip()
