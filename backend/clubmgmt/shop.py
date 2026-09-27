from __future__ import annotations

import base64
import secrets
from decimal import Decimal, InvalidOperation
from io import BytesIO
from pathlib import Path
from uuid import uuid4

from django.core.files.base import ContentFile
from django.db import transaction
from django.db.models import Sum
from django.template.loader import render_to_string
from django.utils import timezone
from rest_framework.exceptions import ValidationError

try:
    from PIL import Image, ImageOps, UnidentifiedImageError
except Exception:  # pragma: no cover
    Image = None
    ImageOps = None
    UnidentifiedImageError = OSError

from licenses.models import Income, IncomeCategory, Order

from .models import ShopItem, ShopMovement, ShopSale, ShopSaleLine, ShopSnapshot, ShopSnapshotLine, ShopVariant

try:
    from weasyprint import HTML
except Exception:  # pragma: no cover
    HTML = None

try:
    import qrcode
except Exception:  # pragma: no cover
    qrcode = None


def next_sku(club) -> str:
    last = (
        ShopItem.objects.filter(club=club)
        .order_by("-id")
        .values_list("sku", flat=True)
        .first()
    )
    sequence = 1
    if last and "-" in str(last):
        try:
            sequence = int(str(last).rsplit("-", 1)[-1]) + 1
        except ValueError:
            sequence = ShopItem.objects.filter(club=club).count() + 1
    elif last:
        sequence = ShopItem.objects.filter(club=club).count() + 1
    return f"SH-{sequence:04d}"


def next_sale_number(club) -> str:
    count = ShopSale.objects.filter(club=club).count() + 1
    return f"SS-{club.id:03d}-{count:05d}"


def new_qr_token() -> str:
    return secrets.token_urlsafe(9).replace("-", "").replace("_", "")[:16]


def qr_payload(variant: ShopVariant) -> str:
    return f"LTFSHOP:{variant.item.club_id}:{variant.id}:{variant.qr_token}"


def parse_scan(code: str) -> ShopVariant | None:
    raw = str(code or "").strip()
    if not raw:
        return None
    if raw.startswith("LTFSHOP:"):
        parts = raw.split(":")
        if len(parts) >= 4:
            token = parts[3]
            return ShopVariant.objects.select_related("item").filter(qr_token=token, is_active=True).first()
    return ShopVariant.objects.select_related("item").filter(qr_token=raw, is_active=True).first()


def parse_money(value):
    if value in (None, ""):
        return None
    text = str(value).strip().replace("€", "").replace(" ", "").replace(",", ".")
    if not text:
        return None
    try:
        amount = Decimal(text)
    except (InvalidOperation, ValueError) as exc:
        raise ValidationError("Enter a valid amount in euros.") from exc
    if amount < 0:
        raise ValidationError("Price cannot be negative.")
    return amount


def prepare_shop_photo(uploaded):
    if not uploaded:
        return None
    if Image is None:
        return uploaded
    try:
        if hasattr(uploaded, "seek"):
            uploaded.seek(0)
        with Image.open(uploaded) as img:
            normalized = ImageOps.exif_transpose(img)
            if normalized.mode not in {"RGB", "RGBA"}:
                normalized = normalized.convert("RGB")
            image = normalized.copy()
    except (UnidentifiedImageError, OSError) as exc:
        raise ValidationError({"photo": "Use a JPEG or PNG photo from the camera."}) from exc
    if image.mode == "RGBA":
        flattened = Image.new("RGB", image.size, (255, 255, 255))
        flattened.paste(image, mask=image.split()[3])
        image = flattened
    elif image.mode != "RGB":
        image = image.convert("RGB")
    max_edge = 1600
    if max(image.size) > max_edge:
        image.thumbnail((max_edge, max_edge), Image.Resampling.LANCZOS)
    stream = BytesIO()
    image.save(stream, format="JPEG", quality=86)
    return ContentFile(stream.getvalue(), name=f"{uuid4().hex}.jpg")


def sync_item_prices(item: ShopItem) -> ShopItem:
    active = list(item.variants.filter(is_active=True))
    if not active:
        return item
    sales = [row.resolved_sale_price() for row in active]
    item.sale_price = min(sales)
    costs = [row.resolved_cost_price() for row in active if row.resolved_cost_price() is not None]
    item.cost_price = min(costs) if costs else None
    item.save(update_fields=["sale_price", "cost_price", "updated_at"])
    return item


def _parse_qty(value, default: int | None = 0) -> int | None:
    if value in (None, ""):
        return default
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def upsert_variants(
    item: ShopItem,
    rows: list[dict],
    *,
    default_sale,
    default_cost,
    apply_opening: bool = False,
    actor=None,
) -> None:
    wanted: list[str] = []
    openings: list[tuple[ShopVariant, int]] = []
    for row in rows:
        label = str(row.get("label") or "").strip()
        if not label:
            continue
        wanted.append(label)
        sale = parse_money(row.get("sale_price"))
        if sale is None:
            sale = default_sale if default_sale is not None else Decimal("0.00")
        cost = parse_money(row.get("cost_price"))
        if cost is None:
            cost = default_cost
        reorder = _parse_qty(row.get("reorder_level"), 2)
        if reorder is None or reorder < 0:
            reorder = 2
        opening = _parse_qty(row.get("quantity"), 0) or 0
        if opening < 0:
            opening = 0
        existing = item.variants.filter(label=label).first()
        if existing:
            existing.is_active = True
            existing.sale_price = sale
            existing.cost_price = cost
            existing.reorder_level = reorder
            existing.save(update_fields=["is_active", "sale_price", "cost_price", "reorder_level"])
            if apply_opening and opening > 0 and existing.quantity == 0:
                openings.append((existing, opening))
        else:
            created = ShopVariant.objects.create(
                item=item,
                label=label,
                qr_token=new_qr_token(),
                quantity=0,
                reorder_level=reorder,
                sale_price=sale,
                cost_price=cost,
            )
            if apply_opening and opening > 0:
                openings.append((created, opening))
    if not wanted:
        variant = ensure_default_variant(item)
        variant.sale_price = default_sale if default_sale is not None else Decimal("0.00")
        variant.cost_price = default_cost
        variant.is_active = True
        variant.save(update_fields=["sale_price", "cost_price", "is_active"])
        wanted = [variant.label]
        opening = _parse_qty((rows[0] if rows else {}).get("quantity"), 0) or 0
        if apply_opening and opening > 0 and variant.quantity == 0:
            openings.append((variant, opening))
    for row in item.variants.exclude(label__in=wanted):
        if row.is_active:
            row.is_active = False
            row.save(update_fields=["is_active"])
    sync_item_prices(item)
    for variant, qty in openings:
        move_stock(
            variant,
            kind=ShopMovement.Kind.RECEIVE,
            delta=qty,
            note="Opening stock",
            actor=actor,
            force=True,
        )


def ensure_default_variant(item: ShopItem) -> ShopVariant:
    variant = item.variants.first()
    if variant:
        return variant
    return ShopVariant.objects.create(
        item=item,
        label="Standard",
        qr_token=new_qr_token(),
        quantity=0,
        sale_price=item.sale_price,
        cost_price=item.cost_price,
    )


@transaction.atomic
def move_stock(
    variant: ShopVariant, *, kind: str, delta: int, note: str = "", actor=None, sale=None, force: bool = False
) -> ShopVariant:
    locked = ShopVariant.objects.select_for_update().get(pk=variant.pk)
    if locked.item.track_stock or force:
        next_qty = locked.quantity + delta
        if next_qty < 0:
            raise ValidationError({"quantity": "Not enough stock for this item."})
        locked.quantity = next_qty
        locked.save(update_fields=["quantity"])
    else:
        next_qty = locked.quantity
    ShopMovement.objects.create(
        variant=locked,
        kind=kind,
        quantity_delta=delta,
        quantity_after=locked.quantity,
        note=note,
        sale=sale,
        created_by=actor if actor and getattr(actor, "is_authenticated", False) else None,
    )
    return locked


def shop_income_category(club):
    category, _created = IncomeCategory.objects.get_or_create(
        club=club,
        code="shop",
        defaults={"name": "Shop sales", "sort_order": 55, "is_active": True},
    )
    return category


@transaction.atomic
def complete_sale(*, club, member, walk_in_name: str, lines: list[dict], payment_method: str, actor=None) -> ShopSale:
    if not lines:
        raise ValidationError({"lines": "Add at least one item."})
    if payment_method not in ShopSale.PayMethod.values:
        raise ValidationError({"payment_method": "Choose how this was paid."})
    status = ShopSale.Status.UNPAID if payment_method == ShopSale.PayMethod.UNPAID else ShopSale.Status.COMPLETED
    sale = ShopSale.objects.create(
        club=club,
        sale_number=next_sale_number(club),
        member=member,
        walk_in_name=(walk_in_name or "").strip(),
        status=status,
        payment_method=payment_method,
        created_by=actor if actor and getattr(actor, "is_authenticated", False) else None,
        paid_at=timezone.now() if status == ShopSale.Status.COMPLETED else None,
    )
    total = Decimal("0.00")
    for row in lines:
        variant = ShopVariant.objects.select_related("item").filter(
            pk=row.get("variant"), item__club=club, is_active=True, item__is_active=True
        ).first()
        if variant is None:
            raise ValidationError({"lines": "An item in the basket is no longer available."})
        quantity = int(row.get("quantity") or 0)
        if quantity < 1:
            raise ValidationError({"quantity": "Quantity must be at least 1."})
        unit = Decimal(
            str(
                row.get("unit_price")
                if row.get("unit_price") not in (None, "")
                else variant.resolved_sale_price()
            )
        )
        if unit < 0:
            raise ValidationError({"unit_price": "Price cannot be negative."})
        label = f"{variant.item.name}" if variant.label in {"", "Standard"} else f"{variant.item.name} · {variant.label}"
        ShopSaleLine.objects.create(
            sale=sale,
            variant=variant,
            quantity=quantity,
            unit_price=unit,
            name_snapshot=label,
        )
        if variant.item.track_stock:
            move_stock(variant, kind=ShopMovement.Kind.SALE, delta=-quantity, actor=actor, sale=sale)
        total += unit * quantity
    sale.total = total
    sale.save(update_fields=["total"])
    if status == ShopSale.Status.COMPLETED and total > 0:
        from .access import can_record_club_payments

        if can_record_club_payments(actor, club.id):
            payer = ""
            if member:
                payer = f"{member.first_name} {member.last_name}".strip()
            elif sale.walk_in_name:
                payer = sale.walk_in_name
            income = Income(
                category=shop_income_category(club),
                club=club,
                description=f"Shop sale {sale.sale_number}",
                payer=payer,
                amount=total,
                income_date=timezone.localdate(),
                received_at=timezone.now(),
                status=Income.Status.RECEIVED,
                payment_method=payment_method if payment_method in {"cash", "card", "other"} else "cash",
                reference=sale.sale_number,
                ledger=Order.Ledger.CLUB,
                created_by=actor if actor and getattr(actor, "is_authenticated", False) else None,
            )
            income.save()
            sale.income = income
            sale.save(update_fields=["income"])
    return sale


@transaction.atomic
def mark_sale_paid(sale: ShopSale, *, payment_method: str, actor=None) -> ShopSale:
    if sale.status != ShopSale.Status.UNPAID:
        raise ValidationError({"status": "Only unpaid sales can be marked paid."})
    if payment_method not in {ShopSale.PayMethod.CASH, ShopSale.PayMethod.CARD, ShopSale.PayMethod.OTHER}:
        raise ValidationError({"payment_method": "Choose cash, card, or other."})
    sale.status = ShopSale.Status.COMPLETED
    sale.payment_method = payment_method
    sale.paid_at = timezone.now()
    sale.save(update_fields=["status", "payment_method", "paid_at"])
    from .access import can_record_club_payments

    if sale.total > 0 and sale.income_id is None and can_record_club_payments(actor, sale.club_id):
        member = sale.member
        payer = f"{member.first_name} {member.last_name}".strip() if member else sale.walk_in_name
        income = Income(
            category=shop_income_category(sale.club),
            club=sale.club,
            description=f"Shop sale {sale.sale_number}",
            payer=payer,
            amount=sale.total,
            income_date=timezone.localdate(),
            received_at=timezone.now(),
            status=Income.Status.RECEIVED,
            payment_method=payment_method,
            reference=sale.sale_number,
            ledger=Order.Ledger.CLUB,
            created_by=actor if actor and getattr(actor, "is_authenticated", False) else None,
        )
        income.save()
        sale.income = income
        sale.save(update_fields=["income"])
    return sale


@transaction.atomic
def cancel_sale(sale: ShopSale, *, actor=None) -> ShopSale:
    if sale.status == ShopSale.Status.CANCELLED:
        return sale
    if sale.income_id:
        raise ValidationError({"status": "This sale is already in the club books. Void the income first."})
    for line in sale.lines.select_related("variant", "variant__item"):
        if line.variant.item.track_stock:
            move_stock(
                line.variant,
                kind=ShopMovement.Kind.RETURN,
                delta=line.quantity,
                note=f"Cancelled {sale.sale_number}",
                actor=actor,
                sale=sale,
            )
    sale.status = ShopSale.Status.CANCELLED
    sale.save(update_fields=["status"])
    return sale


@transaction.atomic
def take_snapshot(*, club, note: str = "", actor=None) -> ShopSnapshot:
    snapshot = ShopSnapshot.objects.create(
        club=club,
        note=note.strip(),
        taken_by=actor if actor and getattr(actor, "is_authenticated", False) else None,
    )
    variants = (
        ShopVariant.objects.filter(item__club=club, is_active=True, item__is_active=True)
        .select_related("item")
        .order_by("item__name", "label")
    )
    ShopSnapshotLine.objects.bulk_create(
        [
            ShopSnapshotLine(
                snapshot=snapshot,
                sku=row.item.sku,
                name=row.item.name,
                variant_label=row.label,
                quantity=row.quantity,
                sale_price=row.resolved_sale_price(),
                cost_price=row.resolved_cost_price(),
                reorder_level=row.reorder_level,
            )
            for row in variants
        ]
    )
    return snapshot


def shop_summary(club) -> dict:
    items = ShopItem.objects.filter(club=club, is_active=True)
    variants = ShopVariant.objects.filter(item__club=club, is_active=True, item__is_active=True)
    low = [
        {
            "id": row.id,
            "item_id": row.item_id,
            "sku": row.item.sku,
            "name": row.item.name,
            "label": row.label,
            "quantity": row.quantity,
            "reorder_level": row.reorder_level,
        }
        for row in variants.select_related("item")
        if row.item.track_stock and row.quantity <= row.reorder_level
    ]
    on_hand = variants.aggregate(total=Sum("quantity"))["total"] or 0
    return {
        "item_count": items.count(),
        "units_on_hand": on_hand,
        "low_stock_count": len(low),
        "low_stock": low[:12],
        "sales_today": ShopSale.objects.filter(
            club=club, created_at__date=timezone.localdate()
        ).exclude(status=ShopSale.Status.CANCELLED).count(),
    }


# Avery Zweckform L7121-25: 20 square labels on A4, 45 x 45 mm.
# Remaining sheet space is split evenly so left/right and top/bottom match.
L7121_SHEET_WIDTH_MM = Decimal("210.00")
L7121_SHEET_HEIGHT_MM = Decimal("297.00")
L7121_LABEL_MM = Decimal("45.00")
L7121_COLUMNS = 4
L7121_ROWS = 5
L7121_SLOT_COUNT = L7121_COLUMNS * L7121_ROWS
L7121_GAP_X_MM = Decimal("2.50")
L7121_GAP_Y_MM = Decimal("8.00")
L7121_MARGIN_LEFT_MM = (
    L7121_SHEET_WIDTH_MM - (L7121_LABEL_MM * L7121_COLUMNS) - (L7121_GAP_X_MM * (L7121_COLUMNS - 1))
) / 2
L7121_MARGIN_TOP_MM = (
    L7121_SHEET_HEIGHT_MM - (L7121_LABEL_MM * L7121_ROWS) - (L7121_GAP_Y_MM * (L7121_ROWS - 1))
) / 2
L7121_PITCH_X_MM = L7121_LABEL_MM + L7121_GAP_X_MM
L7121_PITCH_Y_MM = L7121_LABEL_MM + L7121_GAP_Y_MM
L7121_CORNER_RADIUS_MM = Decimal("1.50")


def l7121_slot_origin(index: int) -> tuple[Decimal, Decimal]:
    if index < 0 or index >= L7121_SLOT_COUNT:
        raise ValueError("L7121 slot index must be 0..19.")
    column = index % L7121_COLUMNS
    row = index // L7121_COLUMNS
    return (
        L7121_MARGIN_LEFT_MM + (L7121_PITCH_X_MM * column),
        L7121_MARGIN_TOP_MM + (L7121_PITCH_Y_MM * row),
    )


def _qr_data_uri(payload: str, *, box_size: int = 6, border: int = 2) -> str:
    if not payload or qrcode is None:
        return ""
    qr = qrcode.QRCode(box_size=box_size, border=border)
    qr.add_data(payload)
    qr.make(fit=True)
    image = qr.make_image(fill_color="black", back_color="white")
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")


def _photo_data_uri(field) -> str:
    if not field:
        return ""
    try:
        path = Path(field.path)
        data = path.read_bytes()
    except Exception:
        return ""
    suffix = path.suffix.lower().lstrip(".") or "jpeg"
    if suffix == "jpg":
        suffix = "jpeg"
    return f"data:image/{suffix};base64," + base64.b64encode(data).decode("ascii")


def render_stickers_pdf(
    item: ShopItem,
    *,
    copies: int,
    variant: ShopVariant | None = None,
    variants: list[ShopVariant] | None = None,
    start_slot: int = 1,
    x_offset_mm: str | Decimal = "0.00",
    y_offset_mm: str | Decimal = "0.00",
    base_url: str,
) -> bytes | None:
    if HTML is None:
        return None
    copies = max(1, min(int(copies or 1), 400))
    start = max(1, min(int(start_slot or 1), L7121_SLOT_COUNT))
    selected = list(variants or [])
    if not selected:
        selected = [variant or ensure_default_variant(item)]
    labels = []
    for row in selected:
        payload = qr_payload(row)
        qr = _qr_data_uri(payload, box_size=8, border=2)
        for _ in range(copies):
            labels.append(
                {
                    "sku": item.sku,
                    "name": item.name,
                    "variant": "" if row.label == "Standard" else row.label,
                    "price": row.resolved_sale_price(),
                    "qr": qr,
                }
            )
    pages: list[list[dict]] = []
    cursor = start - 1
    page: list[dict] = []
    for label in labels:
        if cursor >= L7121_SLOT_COUNT:
            pages.append(page)
            page = []
            cursor = 0
        x_mm, y_mm = l7121_slot_origin(cursor)
        page.append(
            {
                **label,
                "x_mm": f"{x_mm:.2f}",
                "y_mm": f"{y_mm:.2f}",
                "size_mm": f"{L7121_LABEL_MM:.2f}",
                "radius_mm": f"{L7121_CORNER_RADIUS_MM:.2f}",
            }
        )
        cursor += 1
    if page:
        pages.append(page)
    html = render_to_string(
        "shop/stickers.html",
        {
            "item": item,
            "pages": pages,
            "sheet_width_mm": f"{L7121_SHEET_WIDTH_MM:.2f}",
            "sheet_height_mm": f"{L7121_SHEET_HEIGHT_MM:.2f}",
        },
    )
    from licenses.card_rendering import _apply_printer_offset_to_pdf

    html = _apply_printer_offset_to_pdf(html, x_offset_mm=x_offset_mm, y_offset_mm=y_offset_mm)
    return HTML(string=html, base_url=base_url).write_pdf()


def render_catalogue_pdf(club, *, base_url: str) -> bytes | None:
    if HTML is None:
        return None
    items = (
        ShopItem.objects.filter(club=club, is_active=True)
        .prefetch_related("variants")
        .order_by("category", "name")
    )
    cards = []
    for item in items:
        active = [row for row in item.variants.all() if row.is_active]
        if not active:
            active = [ensure_default_variant(item)]
        size_prices = [
            {
                "label": "" if row.label == "Standard" else row.label,
                "price": row.resolved_sale_price(),
            }
            for row in active
        ]
        cards.append(
            {
                "sku": item.sku,
                "name": item.name,
                "description": item.description,
                "price": size_prices[0]["price"] if len(size_prices) == 1 else None,
                "size_prices": size_prices,
                "category": item.get_category_display(),
                "photo": _photo_data_uri(item.photo),
                "sizes": ", ".join(row.label for row in active if row.label != "Standard"),
            }
        )
    html = render_to_string(
        "shop/catalogue.html",
        {"club": club, "cards": cards, "generated_at": timezone.localtime()},
    )
    return HTML(string=html, base_url=base_url).write_pdf()


def render_snapshot_pdf(snapshot: ShopSnapshot, *, base_url: str) -> bytes | None:
    if HTML is None:
        return None
    lines = list(snapshot.lines.all())
    units = sum(row.quantity for row in lines)
    value = sum((row.sale_price or Decimal("0")) * row.quantity for row in lines)
    html = render_to_string(
        "shop/snapshot.html",
        {
            "snapshot": snapshot,
            "club": snapshot.club,
            "lines": lines,
            "units": units,
            "value": value,
            "low": [row for row in lines if row.quantity <= row.reorder_level],
        },
    )
    return HTML(string=html, base_url=base_url).write_pdf()
