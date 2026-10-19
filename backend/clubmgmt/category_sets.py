"""Kyorugi weight-category presets.

Youth limits differ by tournament. Cadet, Junior, and Senior always use the
World Taekwondo world categories. Preset rows are stored so a later edit in
the database changes the roster without a code change. The Netherlands set
uses age on the competition date. Every other set uses the competition year
minus the birth year.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal, InvalidOperation

from django.utils import timezone
from rest_framework.exceptions import ValidationError

from .body_measurements import category_reason, kyorugi_margin, suggest_age_class

SET_CODES = ("wt", "be", "nl", "de", "fr", "at", "custom")

PRESETS = (
    {
        "code": "wt",
        "position": 0,
        "age_basis": "birth_year",
        "source_note": "World Taekwondo Competition Rules & Interpretation, Article 5, in force 30 September 2024.",
        "bands": (),
    },
    {
        "code": "be",
        "position": 1,
        "age_basis": "birth_year",
        "source_note": "Belgium, Keumgang Open / Flemish championship 2026. Pupils 7–8 and Minimes 9–11, mixed.",
        "bands": (
            {"code": "pupils", "age_min": 7, "age_max": 8, "sex": "X", "ceilings": [20, 22, 24, 26, 28, 30, 32, 34, 36]},
            {"code": "minimes", "age_min": 9, "age_max": 11, "sex": "X", "ceilings": [24, 27, 30, 33, 36, 40, 44, 48, 52]},
        ),
    },
    {
        "code": "nl",
        "position": 2,
        "age_basis": "competition_day",
        "source_note": "Netherlands, TBN 1 July 2025. Pupillen 6–8 and Aspiranten 9–11, same limits for boys and girls.",
        "bands": (
            {"code": "pupillen", "age_min": 6, "age_max": 8, "sex": "X", "ceilings": [21, 24, 27, 30, 34, 39, 44]},
            {"code": "aspiranten", "age_min": 9, "age_max": 11, "sex": "X", "ceilings": [28, 32, 36, 40, 45, 51, 57]},
        ),
    },
    {
        "code": "de",
        "position": 3,
        "age_basis": "birth_year",
        "source_note": "Germany, DTU. Jugend D 7–8 and Jugend C 9–11, same limits for male and female.",
        "bands": (
            {"code": "jugend_d", "age_min": 7, "age_max": 8, "sex": "X", "ceilings": [22, 24, 26, 29, 32, 35, 38, 41, 45]},
            {"code": "jugend_c", "age_min": 9, "age_max": 11, "sex": "X", "ceilings": [27, 29, 32, 35, 39, 43, 47, 52, 57]},
        ),
    },
    {
        "code": "fr",
        "position": 4,
        "age_basis": "birth_year",
        "source_note": "France, FFTDA 2025–26. Benjamins 8–9 and Minimes 10–11, separate boys and girls limits.",
        "bands": (
            {"code": "benjamins", "age_min": 8, "age_max": 9, "sex": "M", "ceilings": [21, 24, 27, 30, 33, 37, 41, 45, 49]},
            {"code": "benjamins", "age_min": 8, "age_max": 9, "sex": "F", "ceilings": [17, 20, 23, 26, 29, 33, 37, 41, 44]},
            {"code": "minimes", "age_min": 10, "age_max": 11, "sex": "M", "ceilings": [27, 30, 33, 37, 41, 45, 49, 53, 57]},
            {"code": "minimes", "age_min": 10, "age_max": 11, "sex": "F", "ceilings": [23, 26, 29, 33, 37, 41, 44, 47, 51]},
        ),
    },
    {
        "code": "at",
        "position": 5,
        "age_basis": "birth_year",
        "source_note": "Austria, Vienna Open 2026 / Keup Challenge. Schüler 1 is 7–8 and Schüler 2 is 9–11, mixed.",
        "bands": (
            {"code": "schuler_1", "age_min": 7, "age_max": 8, "sex": "X", "ceilings": [21, 24, 27, 30, 33, 36, 40]},
            {"code": "schuler_2", "age_min": 9, "age_max": 11, "sex": "X", "ceilings": [27, 30, 33, 36, 40, 45, 50]},
        ),
    },
)


def seed_presets(set_model, band_model) -> None:
    for preset in PRESETS:
        row, _created = set_model.objects.update_or_create(
            code=preset["code"],
            defaults={
                "source_note": preset["source_note"],
                "age_basis": preset["age_basis"],
                "position": preset["position"],
            },
        )
        band_model.objects.filter(category_set=row).delete()
        band_model.objects.bulk_create(
            [
                band_model(
                    category_set=row,
                    code=band["code"],
                    age_min=band["age_min"],
                    age_max=band["age_max"],
                    sex=band["sex"],
                    ceilings=list(band["ceilings"]),
                    position=index,
                )
                for index, band in enumerate(preset["bands"])
            ]
        )


def _age_years(date_of_birth: date, on: date | None, basis: str) -> int | None:
    if date_of_birth is None or date_of_birth.year < 1900:
        return None
    if basis == "competition_day":
        day = on or timezone.localdate()
        years = day.year - date_of_birth.year
        if (day.month, day.day) < (date_of_birth.month, date_of_birth.day):
            years -= 1
        return years
    year = on.year if on else timezone.localdate().year
    return year - date_of_birth.year


def _kg_label(limit: Decimal, *, open_class: bool) -> str:
    number = int(limit) if limit == limit.to_integral() else limit
    return f"+{number} kg" if open_class else f"-{number} kg"


def category_from_ceilings(weight_kg, ceilings) -> tuple[str, str | None]:
    if weight_kg is None or not ceilings:
        return "", None
    weight = Decimal(weight_kg)
    limits = [Decimal(str(item)) for item in ceilings]
    for limit in limits:
        if weight <= limit:
            delta = (weight - limit).quantize(Decimal("0.1"))
            return _kg_label(limit, open_class=False), f"{delta:.1f}"
    last = limits[-1]
    delta = (weight - last).quantize(Decimal("0.1"))
    return _kg_label(last, open_class=True), f"{delta:.1f}"


def _matching_band(bands: list[dict], age: int, sex: str) -> dict | None:
    mixed = None
    for band in bands:
        if not (band["age_min"] <= age <= band["age_max"]):
            continue
        if band["sex"] == sex:
            return band
        if band["sex"] == "X" and mixed is None:
            mixed = band
    return mixed


def _wt_age_class(age: int) -> str:
    """Same bands as suggest_age_class, from a completed age instead of a birth year."""
    if age < 0:
        return ""
    if age < 7:
        return "youth"
    if age <= 8:
        return "pupils"
    if age <= 10:
        return "minimes"
    if age <= 13:
        return "cadet"
    if age <= 16:
        return "junior"
    return "senior"


def resolve_category(
    *,
    date_of_birth,
    sex: str,
    weight_kg,
    competition_on: date | None,
    category_set_code: str,
    age_basis: str,
    bands: list[dict],
) -> tuple[str, str | None, str, int | None]:
    """Category, kilograms over or under, reason code, and the age used.

    An empty reason means a category was computed. ``no_set_age`` means this
    set has no youth band and the age is not yet Cadet.
    """
    code = category_set_code or "wt"
    if code == "wt":
        year = competition_on.year if competition_on else timezone.localdate().year
        age_class = suggest_age_class(date_of_birth, year)
        category, delta = kyorugi_margin(weight_kg, age_class, sex)
        reason = "" if category else category_reason(date_of_birth, age_class, sex, weight_kg)
        age = None if date_of_birth is None else year - date_of_birth.year
        return category, delta, reason, age

    if date_of_birth is None:
        return "", None, "no_birth_date", None
    sex_key = str(sex or "").strip().upper()
    if sex_key not in {"M", "F"}:
        return "", None, "no_sex", None
    age = _age_years(date_of_birth, competition_on, age_basis)
    if age is None or age < 0:
        return "", None, "no_birth_date", None
    band = _matching_band(bands, age, sex_key)
    if band is not None:
        if weight_kg is None:
            return "", None, "no_weight", age
        category, delta = category_from_ceilings(weight_kg, band["ceilings"])
        return category, delta, "" if category else "no_weight", age
    age_class = _wt_age_class(age) if age_basis == "competition_day" else suggest_age_class(
        date_of_birth,
        competition_on.year if competition_on else timezone.localdate().year,
    )
    if age_class in {"cadet", "junior", "senior"}:
        if weight_kg is None:
            return "", None, "no_weight", age
        category, delta = kyorugi_margin(weight_kg, age_class, sex_key)
        return category, delta, "" if category else "no_weight", age
    return "", None, "no_set_age", age


def bands_for(team) -> tuple[str, str, list[dict]]:
    from .teams import WeightCategorySet

    code = team.category_set_code or "wt"
    if code == "custom":
        rows = team.custom_bands.all().order_by("position", "id")
        return (
            "custom",
            "birth_year",
            [
                {
                    "age_min": row.age_min,
                    "age_max": row.age_max,
                    "sex": row.sex,
                    "ceilings": list(row.ceilings or []),
                }
                for row in rows
            ],
        )
    try:
        preset = WeightCategorySet.objects.prefetch_related("bands").get(code=code)
    except WeightCategorySet.DoesNotExist:
        return "wt", "birth_year", []
    return (
        preset.code,
        preset.age_basis,
        [
            {
                "age_min": band.age_min,
                "age_max": band.age_max,
                "sex": band.sex,
                "ceilings": list(band.ceilings or []),
            }
            for band in preset.bands.all()
        ],
    )


def parse_custom_bands(value) -> list[dict]:
    if not isinstance(value, list) or not value:
        raise ValidationError({"custom_bands": "custom_bands_required"})
    parsed = []
    for raw in value:
        if not isinstance(raw, dict):
            raise ValidationError({"custom_bands": "custom_bands_required"})
        try:
            age_min = int(raw.get("age_min"))
            age_max = int(raw.get("age_max"))
        except (TypeError, ValueError) as exc:
            raise ValidationError({"age_min": "age_required"}) from exc
        if age_min < 0 or age_max > 99 or age_min > age_max:
            raise ValidationError({"age_min": "age_required"})
        sex = str(raw.get("sex") or "").strip().upper()
        if sex not in {"M", "F", "X"}:
            raise ValidationError({"sex": "sex_required"})
        ceilings = _parse_ceilings(raw.get("ceilings"))
        parsed.append(
            {
                "label": str(raw.get("label") or "").strip()[:80],
                "age_min": age_min,
                "age_max": age_max,
                "sex": sex,
                "ceilings": ceilings,
            }
        )
    return parsed


def _parse_ceilings(value) -> list[int | float]:
    if isinstance(value, str):
        parts = [part.strip() for part in value.replace("+", "").split(",") if part.strip()]
    elif isinstance(value, list):
        parts = value
    else:
        parts = []
    if not parts:
        raise ValidationError({"ceilings": "limits_required"})
    limits = []
    for part in parts:
        try:
            number = Decimal(str(part))
        except (InvalidOperation, ValueError) as exc:
            raise ValidationError({"ceilings": "limits_required"}) from exc
        if number.as_tuple().exponent < -1 or number <= 0 or number > Decimal("250"):
            raise ValidationError({"ceilings": "limits_required"})
        limits.append(number)
    if any(left >= right for left, right in zip(limits, limits[1:])):
        raise ValidationError({"ceilings": "limits_required"})
    cleaned = []
    for number in limits:
        cleaned.append(int(number) if number == number.to_integral() else float(number))
    return cleaned
