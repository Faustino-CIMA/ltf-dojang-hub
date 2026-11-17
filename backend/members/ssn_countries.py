"""Social security numbers for Luxembourg, Germany, France, and Belgium.

The country of the number picks the parser. A German health-insurance number
is rejected. Nothing here reads or stores a card image.
"""

from __future__ import annotations

import re
from datetime import date

from django.core.exceptions import ValidationError
from django.utils.translation import gettext_lazy as _

COUNTRIES = ("LU", "DE", "FR", "BE")

_MESSAGES = {
    "country": _("Choose Luxembourg, Germany, France, or Belgium."),
    "shape": _("The social security number does not match that country's format."),
    "checksum": _("The social security number check digit is not valid."),
    "health_card": _(
        "A German health insurance number is not accepted. Enter the pension insurance number."
    ),
}

# Verhoeff tables. The check digit is the one that makes a number end on 0.
_VERHOEFF_D = (
    (0, 1, 2, 3, 4, 5, 6, 7, 8, 9),
    (1, 2, 3, 4, 0, 6, 7, 8, 9, 5),
    (2, 3, 4, 0, 1, 7, 8, 9, 5, 6),
    (3, 4, 0, 1, 2, 8, 9, 5, 6, 7),
    (4, 0, 1, 2, 3, 9, 5, 6, 7, 8),
    (5, 9, 8, 7, 6, 0, 4, 3, 2, 1),
    (6, 5, 9, 8, 7, 1, 0, 4, 3, 2),
    (7, 6, 5, 9, 8, 2, 1, 0, 4, 3),
    (8, 7, 6, 5, 9, 3, 2, 1, 0, 4),
    (9, 8, 7, 6, 5, 4, 3, 2, 1, 0),
)
_VERHOEFF_P = (
    (0, 1, 2, 3, 4, 5, 6, 7, 8, 9),
    (1, 5, 7, 6, 2, 8, 3, 0, 9, 4),
    (5, 8, 0, 3, 7, 9, 6, 1, 4, 2),
    (8, 9, 1, 6, 0, 4, 3, 5, 2, 7),
    (9, 4, 5, 3, 1, 2, 6, 8, 7, 0),
    (4, 2, 8, 6, 5, 7, 3, 9, 0, 1),
    (2, 7, 9, 3, 8, 0, 6, 4, 1, 5),
    (7, 0, 4, 6, 9, 1, 3, 2, 5, 8),
)
_VERHOEFF_INV = (0, 4, 3, 2, 1, 5, 6, 7, 8, 9)

_DE_FACTORS = (2, 1, 2, 5, 7, 1, 2, 1, 2, 1, 2, 1)
_DE_HEALTH_CARD = re.compile(r"^[A-Z]\d{8,10}$")
_DE_PENSION = re.compile(r"^\d{8}[A-Z]\d{3}$")


class SsnError(ValidationError):
    def __init__(self, code: str):
        self.ssn_code = code
        super().__init__(_MESSAGES[code], code=code)


def _digits_only(value: str) -> str:
    return re.sub(r"[\s.\-]", "", value or "")


def _verhoeff_digit(number: str) -> str:
    """CCSS Verhoeff. The rightmost body digit is position 1, because the check digit is position 0."""
    checksum = 0
    for index, char in enumerate(reversed(number)):
        checksum = _VERHOEFF_D[checksum][_VERHOEFF_P[(index + 1) % 8][int(char)]]
    return str(_VERHOEFF_INV[checksum])


def _luhn_digit(number: str) -> str:
    """CCSS Luhn. The rightmost body digit is doubled."""
    total = 0
    for index, char in enumerate(reversed(number)):
        product = int(char) * (2 if index % 2 == 0 else 1)
        total += product // 10 + product % 10
    return str((10 - (total % 10)) % 10)


def luxembourg_check_digits(first_eleven: str) -> str:
    if len(first_eleven) != 11 or not first_eleven.isdigit():
        raise SsnError("shape")
    return _luhn_digit(first_eleven) + _verhoeff_digit(first_eleven)


def _require_date(year: int, month: int, day: int) -> None:
    try:
        date(year, month, day)
    except ValueError as exc:
        raise SsnError("shape") from exc


def _validate_lu(compact: str) -> str:
    if len(compact) != 13 or not compact.isdigit():
        raise SsnError("shape")
    _require_date(int(compact[0:4]), int(compact[4:6]), int(compact[6:8]))
    if compact[11:13] != luxembourg_check_digits(compact[:11]):
        raise SsnError("checksum")
    return compact


def _de_letter_digits(letter: str) -> str:
    return f"{ord(letter) - ord('A') + 1:02d}"


def german_check_digit(first_eleven: str) -> str:
    """Remainder modulo 10 after the pension-number weights."""
    if not _DE_PENSION.match(first_eleven + "0"):
        raise SsnError("shape")
    digits = first_eleven[:8] + _de_letter_digits(first_eleven[8]) + first_eleven[9:11]
    total = 0
    for char, factor in zip(digits, _DE_FACTORS):
        product = int(char) * factor
        total += product // 10 + product % 10
    return str(total % 10)


def _validate_de(compact: str) -> str:
    if _DE_HEALTH_CARD.match(compact):
        raise SsnError("health_card")
    if not _DE_PENSION.match(compact):
        raise SsnError("shape")
    if compact[11] != german_check_digit(compact[:11]):
        raise SsnError("checksum")
    return compact


def _french_body_value(body: str) -> int:
    if len(body) != 13:
        raise SsnError("shape")
    if body[5:7] in ("2A", "2B"):
        letter = body[6]
        replaced = body[:6] + "0" + body[7:]
        if not replaced.isdigit():
            raise SsnError("shape")
        return int(replaced) - (1000000 if letter == "A" else 2000000)
    if not body.isdigit():
        raise SsnError("shape")
    return int(body)


def french_key(body: str) -> str:
    value = _french_body_value(body)
    key = 97 - (value % 97)
    return f"{key:02d}"


def _validate_fr(compact: str) -> str:
    if len(compact) != 15:
        raise SsnError("shape")
    body, key = compact[:13], compact[13:]
    if not key.isdigit():
        raise SsnError("shape")
    month = int(body[3:5]) if body[3:5].isdigit() else 0
    if month < 1 or month > 12:
        raise SsnError("shape")
    if key != french_key(body):
        raise SsnError("checksum")
    return compact


def belgian_check(first_nine: str, *, born_2000_or_later: bool) -> str:
    if len(first_nine) != 9 or not first_nine.isdigit():
        raise SsnError("shape")
    base = int(("2" if born_2000_or_later else "") + first_nine)
    return f"{97 - (base % 97):02d}"


def _be_date_ok(first_six: str) -> bool:
    if len(first_six) != 6 or not first_six.isdigit():
        return False
    year, month, day = int(first_six[0:2]), int(first_six[2:4]), int(first_six[4:6])
    for century in (1900, 2000):
        try:
            date(century + year, month, day)
            return True
        except ValueError:
            continue
    return False


def _validate_be(compact: str) -> str:
    if len(compact) != 11 or not compact.isdigit():
        raise SsnError("shape")
    if not _be_date_ok(compact[:6]):
        raise SsnError("shape")
    first_nine, check = compact[:9], compact[9:]
    if check not in (
        belgian_check(first_nine, born_2000_or_later=False),
        belgian_check(first_nine, born_2000_or_later=True),
    ):
        raise SsnError("checksum")
    return compact


_VALIDATORS = {
    "LU": _validate_lu,
    "DE": _validate_de,
    "FR": _validate_fr,
    "BE": _validate_be,
}


def compact_ssn(country: str, value: str) -> str:
    country = (country or "").strip().upper()
    if country not in _VALIDATORS:
        raise SsnError("country")
    raw = str(value or "").strip().upper()
    compact = _digits_only(raw) if country != "DE" else re.sub(r"[\s.\-]", "", raw)
    return _VALIDATORS[country](compact)


def validate_ssn(country: str, value: str) -> str:
    if not str(value or "").strip():
        return ""
    return compact_ssn(country, value)


def encoded_sex(country: str, number: str) -> str:
    """Hard sex from the number. Empty when the number does not decide sex."""
    country = (country or "").upper()
    if country == "DE" and len(number) >= 11 and number[9:11].isdigit():
        if int(number[9:11]) <= 49:
            return "M"
        return ""
    if country == "FR" and number:
        if number[0] == "1":
            return "M"
        if number[0] == "2":
            return "F"
        return ""
    if country == "BE" and len(number) >= 9 and number[6:9].isdigit():
        return "M" if int(number[6:9]) % 2 else "F"
    return ""


def _real_day(year: int, month: int, day: int) -> bool:
    try:
        date(year, month, day)
    except ValueError:
        return False
    return True


def belgian_century_matches(number: str, record_birth: date | None) -> bool:
    """The post-2000 rule applies only when the recorded birth is in 2000 or later."""
    if record_birth is None or len(number) != 11:
        return True
    expected = belgian_check(number[:9], born_2000_or_later=record_birth.year >= 2000)
    return number[9:] == expected


def birth_agrees(country: str, number: str, record_birth: date | None) -> bool:
    """True when the number's date agrees, or when that date is absent."""
    if record_birth is None:
        return True
    country = (country or "").upper()
    if country == "LU" and len(number) >= 8 and number[:8].isdigit():
        year, month, day = int(number[0:4]), int(number[4:6]), int(number[6:8])
        return _real_day(year, month, day) and date(year, month, day) == record_birth
    if country == "DE" and len(number) >= 8 and number[2:8].isdigit():
        day, month, year = int(number[2:4]), int(number[4:6]), int(number[6:8])
        if not any(_real_day(century + year, month, day) for century in (1900, 2000)):
            return True
        return (
            day == record_birth.day
            and month == record_birth.month
            and year == record_birth.year % 100
        )
    if country == "FR" and len(number) >= 5 and number[1:5].isdigit():
        year, month = int(number[1:3]), int(number[3:5])
        return year == record_birth.year % 100 and month == record_birth.month
    if country == "BE" and len(number) >= 6 and number[:6].isdigit():
        year, month, day = int(number[0:2]), int(number[2:4]), int(number[4:6])
        return (
            year == record_birth.year % 100
            and month == record_birth.month
            and day == record_birth.day
            and belgian_century_matches(number, record_birth)
        )
    return True
