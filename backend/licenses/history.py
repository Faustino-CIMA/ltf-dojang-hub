from __future__ import annotations

from typing import Any

from django.utils import timezone

from .models import License, LicenseHistoryEvent

NO_CLUB_LABELS = {
    "en": "No club",
    "fr": "Aucun club",
    "de": "Kein Verein",
    "lb": "Kee Veräin",
}


def no_club_label(locale: str | None) -> str:
    code = str(locale or "en").replace("_", "-").split("-")[0].lower()
    return NO_CLUB_LABELS.get(code, NO_CLUB_LABELS["en"])


def create_license_history_event(
    license_record: License,
    *,
    event_type: str,
    actor=None,
    reason: str = "",
    status_before: str = "",
    status_after: str = "",
    order=None,
    payment=None,
    metadata: dict[str, Any] | None = None,
    event_at=None,
) -> LicenseHistoryEvent:
    club = license_record.club if license_record.club_id else None
    club_name = club.name if club is not None else ""
    return LicenseHistoryEvent.objects.create(
        member=license_record.member,
        license=license_record,
        club=club,
        order=order,
        payment=payment,
        actor=actor if actor and actor.is_authenticated else None,
        event_type=event_type,
        event_at=event_at or timezone.now(),
        reason=reason,
        metadata=metadata or {},
        license_year=license_record.year,
        status_before=status_before,
        status_after=status_after or license_record.status,
        club_name_snapshot=club_name,
    )


def log_license_created(
    license_record: License,
    *,
    actor=None,
    reason: str = "License created.",
    order=None,
    metadata: dict[str, Any] | None = None,
) -> LicenseHistoryEvent:
    return create_license_history_event(
        license_record,
        event_type=LicenseHistoryEvent.EventType.ISSUED,
        actor=actor,
        reason=reason,
        status_before="",
        status_after=license_record.status,
        order=order,
        metadata=metadata,
    )


def log_license_status_change(
    license_record: License,
    *,
    status_before: str,
    actor=None,
    reason: str = "",
    order=None,
    payment=None,
    metadata: dict[str, Any] | None = None,
) -> LicenseHistoryEvent | None:
    status_after = license_record.status
    if status_before == status_after:
        return None

    event_type = LicenseHistoryEvent.EventType.STATUS_CHANGED
    if status_after == License.Status.EXPIRED:
        event_type = LicenseHistoryEvent.EventType.EXPIRED
    elif status_after == License.Status.REVOKED:
        event_type = LicenseHistoryEvent.EventType.REVOKED
    elif status_after == License.Status.ACTIVE and status_before in [
        License.Status.EXPIRED,
        License.Status.REVOKED,
    ]:
        event_type = LicenseHistoryEvent.EventType.RENEWED

    return create_license_history_event(
        license_record,
        event_type=event_type,
        actor=actor,
        reason=reason or "License status changed.",
        status_before=status_before,
        status_after=status_after,
        order=order,
        payment=payment,
        metadata=metadata,
    )


def expire_outdated_licenses(actor=None, member_ids=None) -> int:
    today = timezone.localdate()
    # club is empty for an LTF staff licence. The filter does not require a club.
    outdated_licenses = License.objects.filter(
        status=License.Status.ACTIVE,
        end_date__lt=today,
    ).select_related("member", "club")
    if member_ids is not None:
        outdated_licenses = outdated_licenses.filter(member_id__in=list(member_ids))

    expired_count = 0
    for license_record in outdated_licenses:
        previous_status = license_record.status
        license_record.status = License.Status.EXPIRED
        license_record.save(update_fields=["status", "updated_at"])
        log_license_status_change(
            license_record,
            status_before=previous_status,
            actor=actor,
            reason="Automatic expiry reconciliation task.",
            metadata={"reconciled_on": today.isoformat()},
        )
        expired_count += 1
    return expired_count
