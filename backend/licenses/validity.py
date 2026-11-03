"""Validity rules for a license type. Dates already stored on a license stay put once locked."""

from __future__ import annotations

from datetime import date, timedelta

from django.db.models import Q
from django.utils import timezone


def add_duration(start: date, years: int, days: int) -> date:
    """Add whole years, then days. 29 February lands on 28 February when the target year is not a leap year."""
    year = start.year + int(years or 0)
    month = start.month
    day = start.day
    if month == 2 and day == 29:
        try:
            anchored = date(year, 2, 29)
        except ValueError:
            anchored = date(year, 2, 28)
    else:
        anchored = date(year, month, day)
    return anchored + timedelta(days=int(days or 0))


def policy_for(license_record):
    if not getattr(license_record, "license_type_id", None):
        return None
    cached = getattr(license_record, "_validity_policy", None)
    if cached is not None:
        return cached
    from .models import LicenseTypePolicy

    policy = (
        LicenseTypePolicy.objects.filter(license_type_id=license_record.license_type_id).first()
    )
    license_record._validity_policy = policy
    return policy


def is_unlocked_duration(license_record) -> bool:
    if license_record.expiry_locked:
        return False
    policy = policy_for(license_record)
    if policy is None:
        return False
    return policy.validity_mode == policy.ValidityMode.DURATION


def unlocked_duration_q() -> Q:
    return Q(expiry_locked=False, license_type__policy__validity_mode="duration")


def stamp_expiry(license_record) -> list[str]:
    """Lock a calendar-year license as soon as it is saved. A duration license is dated on first activation."""
    changed: list[str] = []
    policy = policy_for(license_record)
    mode = policy.validity_mode if policy is not None else "calendar_year"
    if license_record.expiry_locked:
        return changed
    if mode != "duration":
        license_record.expiry_locked = True
        changed.append("expiry_locked")
        return changed
    if license_record.status != "active":
        return changed
    if license_record.issued_at is None:
        license_record.issued_at = timezone.now()
        changed.append("issued_at")
    start = timezone.localtime(license_record.issued_at).date()
    license_record.start_date = start
    license_record.end_date = add_duration(
        start,
        policy.duration_years if policy is not None else 0,
        policy.duration_days if policy is not None else 0,
    )
    license_record.expiry_locked = True
    changed.extend(["start_date", "end_date", "expiry_locked"])
    return changed


def placeholder_activation_block(license_record, today: date) -> str | None:
    """Calendar-year dates gate activation. A duration license waits for its first activation instead."""
    if is_unlocked_duration(license_record):
        return None
    if license_record.start_date > today:
        return "deferred"
    if license_record.end_date < today:
        return "outside"
    return None
