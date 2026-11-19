"""Turn a typed weight into the one-decimal value stored on the row."""

from __future__ import annotations

from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

from rest_framework.exceptions import ValidationError

_ONE_PLACE = Decimal("0.1")


def normalize_kg(value, *, field: str, code: str, minimum: Decimal, maximum: Decimal) -> Decimal | None:
    """Accept 44, 44.0, 44.00, and 44,5. Round to one decimal. Reject anything else."""

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
    number = number.quantize(_ONE_PLACE, rounding=ROUND_HALF_UP)
    if number < minimum or number > maximum:
        raise ValidationError({field: code})
    return number
