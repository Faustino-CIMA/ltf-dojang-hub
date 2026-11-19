"""Turn a typed kilogram value into the two-decimal number stored on the row."""

from __future__ import annotations

from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

from rest_framework.exceptions import ValidationError

TWO_PLACES = Decimal("0.01")


def format_kg(value) -> str:
    return f"{Decimal(value):.2f}"


def normalize_kg(
    value,
    *,
    field: str,
    code: str,
    minimum: Decimal,
    maximum: Decimal,
    keep: Decimal | None = None,
) -> Decimal | None:
    """Accept 44, 44.0, 44.00, and 44,5. Round to two decimals.

    A stored value above the maximum is kept when the edit does not change it.
    """

    if value in (None, ""):
        return None
    text = str(value).strip().replace(" ", "").replace("\u00a0", "")
    if not text:
        return None
    if "," in text and "." in text:
        raise ValidationError({field: code})
    text = text.replace(",", ".")
    if text.endswith("."):
        text = text[:-1]
    try:
        number = Decimal(text)
    except (InvalidOperation, ValueError) as exc:
        raise ValidationError({field: code}) from exc
    if not number.is_finite():
        raise ValidationError({field: code})
    number = number.quantize(TWO_PLACES, rounding=ROUND_HALF_UP)
    if number < minimum or number > maximum:
        kept = None if keep is None else Decimal(keep).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)
        if kept is None or number != kept or number < minimum:
            raise ValidationError({field: code})
    return number
