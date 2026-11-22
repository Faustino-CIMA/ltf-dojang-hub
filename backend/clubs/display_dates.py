"""Dates a person reads. Files and the API stay ISO.

A calendar day is 29.11.2026. A timestamp is 29.11.2026 14:05 in
Europe/Luxembourg. The licence card does not use this module.
"""

from __future__ import annotations

from datetime import date, datetime
from zoneinfo import ZoneInfo

from django.utils import timezone

LUXEMBOURG = ZoneInfo("Europe/Luxembourg")


def _aware(value: datetime) -> datetime:
    if timezone.is_naive(value):
        return timezone.make_aware(value, LUXEMBOURG)
    return value.astimezone(LUXEMBOURG)


def format_display_date(value) -> str:
    if not value:
        return ""
    if isinstance(value, datetime):
        value = _aware(value).date()
    if isinstance(value, date):
        return f"{value.day:02d}.{value.month:02d}.{value.year:04d}"
    return ""


def format_display_datetime(value) -> str:
    if not value:
        return ""
    if isinstance(value, datetime):
        local = _aware(value)
        return (
            f"{local.day:02d}.{local.month:02d}.{local.year:04d} "
            f"{local.hour:02d}:{local.minute:02d}"
        )
    if isinstance(value, date):
        return f"{value.day:02d}.{value.month:02d}.{value.year:04d} 00:00"
    return ""
