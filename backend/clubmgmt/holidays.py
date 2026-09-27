from __future__ import annotations

from datetime import date, timedelta

from .training_models import PublicHoliday, SchoolHoliday

SCHOOL_HOLIDAYS = (
    (2025, "Toussaint", date(2025, 11, 1), date(2025, 11, 9)),
    (2025, "Noël", date(2025, 12, 20), date(2026, 1, 4)),
    (2025, "Carnaval", date(2026, 2, 14), date(2026, 2, 22)),
    (2025, "Pâques", date(2026, 3, 28), date(2026, 4, 12)),
    (2025, "Pentecôte", date(2026, 5, 23), date(2026, 5, 31)),
    (2025, "Été", date(2026, 7, 16), date(2026, 9, 14)),
    (2026, "Toussaint", date(2026, 10, 31), date(2026, 11, 8)),
    (2026, "Noël", date(2026, 12, 19), date(2027, 1, 3)),
    (2026, "Carnaval", date(2027, 2, 6), date(2027, 2, 14)),
    (2026, "Pâques", date(2027, 3, 27), date(2027, 4, 11)),
    (2026, "Pentecôte", date(2027, 5, 29), date(2027, 6, 6)),
    (2026, "Été", date(2027, 7, 16), date(2027, 9, 14)),
)


def easter_sunday(year: int) -> date:
    a = year % 19
    b = year // 100
    c = year % 100
    d = b // 4
    e = b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i = c // 4
    k = c % 4
    ell = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * ell) // 451
    month = (h + ell - 7 * m + 114) // 31
    day = ((h + ell - 7 * m + 114) % 31) + 1
    return date(year, month, day)


def _national_day(year: int) -> date:
    holiday = date(year, 6, 23)
    if holiday.weekday() == 6:
        return date(year, 6, 22)
    return holiday


def luxembourg_public_holidays(year: int) -> list[tuple[date, str]]:
    easter = easter_sunday(year)
    return [
        (date(year, 1, 1), "Nouvel An"),
        (easter + timedelta(days=1), "Lundi de Pâques"),
        (date(year, 5, 1), "Fête du Travail"),
        (date(year, 5, 9), "Journée de l'Europe"),
        (easter + timedelta(days=39), "Ascension"),
        (easter + timedelta(days=50), "Lundi de Pentecôte"),
        (_national_day(year), "Fête nationale"),
        (date(year, 8, 15), "Assomption"),
        (date(year, 11, 1), "Toussaint"),
        (date(year, 12, 25), "Noël"),
        (date(year, 12, 26), "Saint-Étienne"),
    ]


def ensure_public_holidays(*years: int) -> None:
    for year in years:
        for holiday, name in luxembourg_public_holidays(year):
            PublicHoliday.objects.get_or_create(date=holiday, defaults={"name": name})


def ensure_school_holidays() -> None:
    for school_year, name, starts_on, ends_on in SCHOOL_HOLIDAYS:
        SchoolHoliday.objects.get_or_create(
            school_year=school_year,
            name=name,
            starts_on=starts_on,
            defaults={"ends_on": ends_on},
        )


def is_public_holiday(day: date) -> bool:
    ensure_public_holidays(day.year)
    return PublicHoliday.objects.filter(date=day).exists()


def is_school_holiday(day: date) -> bool:
    ensure_school_holidays()
    return SchoolHoliday.objects.filter(starts_on__lte=day, ends_on__gte=day).exists()
