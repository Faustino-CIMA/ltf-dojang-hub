"""Print license cards from the LTF licenses list.

The sheet is the same print job the clubs already use (Sigel LP798 when the
template is credit-card size). One club is one sheet. A selection that spans
clubs becomes one sheet per club.
"""

from __future__ import annotations

from collections import defaultdict

from django.db import transaction
from rest_framework import serializers, status
from rest_framework.response import Response

from .card_rendering import resolve_published_standard_card_version
from .card_serializers import PrintJobCreateSerializer
from .models import (
    CardTemplateVersion,
    FinanceAuditLog,
    License,
    PaperProfile,
    PrintJob,
    PrintJobItem,
)
from .print_jobs import execute_print_job_now

SIGEL_PAPER_CODE = "sigel-lp798"


class LicenseCardPrintError(Exception):
    def __init__(self, code: str, status_code: int = status.HTTP_409_CONFLICT):
        self.code = code
        self.status_code = status_code
        super().__init__(code)


def ltf_admin_print_refusal(request):
    """Only a full LTF admin desk may print. The desk on the request wins."""
    from accounts.desks import current_desk

    user = getattr(request, "user", None)
    if user is None or not getattr(user, "is_authenticated", False):
        return Response({"detail": "Not allowed."}, status=status.HTTP_403_FORBIDDEN)
    desk = current_desk()
    on_admin = desk == "ltf_admin" or (desk is None and getattr(user, "role", None) == "ltf_admin")
    if not on_admin:
        return Response({"detail": "Not allowed."}, status=status.HTTP_403_FORBIDDEN)
    django_request = getattr(request, "_request", None)
    grant = getattr(request, "desk_grant", None) or getattr(django_request, "desk_grant", None)
    read_only = bool(getattr(request, "desk_read_only", False)) or bool(
        getattr(django_request, "desk_read_only", False)
    )
    if grant is not None and getattr(grant, "level", "") == "read_only":
        read_only = True
    if read_only:
        return Response({"detail": "desk_read_only"}, status=status.HTTP_403_FORBIDDEN)
    return None


def _optional_pk(value, field_name: str) -> int | None:
    if value in (None, ""):
        return None
    if isinstance(value, str) and value.isdigit():
        value = int(value)
    if isinstance(value, bool) or not isinstance(value, int):
        raise serializers.ValidationError({field_name: "Expected an id."})
    if value < 1:
        raise serializers.ValidationError({field_name: "Expected an id."})
    return value


def _parse_license_ids(raw) -> list[int]:
    if not isinstance(raw, list) or not raw:
        raise serializers.ValidationError({"license_ids": "At least one license id is required."})
    ids: list[int] = []
    for value in raw:
        if isinstance(value, bool):
            raise serializers.ValidationError({"license_ids": "License ids must be integers."})
        if isinstance(value, int):
            parsed = value
        elif isinstance(value, str) and value.isdigit():
            parsed = int(value)
        else:
            raise serializers.ValidationError({"license_ids": "License ids must be integers."})
        if parsed < 1:
            raise serializers.ValidationError({"license_ids": "License ids must be integers."})
        ids.append(parsed)
    if len(set(ids)) != len(ids):
        raise serializers.ValidationError({"license_ids": "Duplicate license ids are not allowed."})
    return ids


def _parse_selected_slots(raw) -> list[int] | None:
    if raw in (None, "", []):
        return None
    values = [raw] if isinstance(raw, (str, int)) else raw
    if not isinstance(values, list):
        raise serializers.ValidationError({"selected_slots": "Expected a list of slot indexes."})
    slots: list[int] = []
    for value in values:
        if isinstance(value, str) and value.isdigit():
            value = int(value)
        if isinstance(value, bool) or not isinstance(value, int) or value < 0:
            raise serializers.ValidationError({"selected_slots": "Slot indexes must be integers."})
        slots.append(value)
    if not slots:
        return None
    if len(set(slots)) != len(slots):
        raise serializers.ValidationError({"selected_slots": "Duplicate slot indices are not allowed."})
    return sorted(slots)


def _resolve_template(template_version_id: int | None) -> CardTemplateVersion:
    if template_version_id is None:
        version = resolve_published_standard_card_version()
    else:
        version = (
            CardTemplateVersion.objects.select_related("template", "paper_profile", "card_format")
            .filter(pk=template_version_id)
            .first()
        )
        if (
            version is None
            or version.status != CardTemplateVersion.Status.PUBLISHED
            or not version.template.is_active
        ):
            version = None
    if version is None:
        raise LicenseCardPrintError("no_published_card_template")
    return version


def _paper_for(template_version: CardTemplateVersion):
    sigel = (
        PaperProfile.objects.filter(code=SIGEL_PAPER_CODE, is_active=True)
        .select_related("card_format")
        .first()
    )
    if sigel is not None and sigel.card_format_id == template_version.card_format_id:
        return sigel
    return template_version.paper_profile


def _persist_print_job(serializer: PrintJobCreateSerializer, user) -> PrintJob:
    validated = serializer.validated_data
    resolved_items = validated["resolved_items"]
    selected_slots = validated.get("selected_slots") or []
    with transaction.atomic():
        print_job = PrintJob.objects.create(
            club=validated["club"],
            template_version=validated["template_version"],
            paper_profile=validated["resolved_paper_profile"],
            printer_profile=validated.get("printer_profile"),
            side=validated.get("side", PrintJob.Side.FRONT),
            status=PrintJob.Status.DRAFT,
            total_items=len(resolved_items),
            selected_slots=selected_slots,
            include_bleed_guide=validated.get("include_bleed_guide", False),
            include_safe_area_guide=validated.get("include_safe_area_guide", False),
            bleed_mm=validated.get("bleed_mm", "2.00"),
            safe_area_mm=validated.get("safe_area_mm", "3.00"),
            metadata=validated.get("metadata") or {},
            requested_by=user if getattr(user, "is_authenticated", False) else None,
        )
        print_items = []
        for index, item_payload in enumerate(resolved_items):
            slot_index = selected_slots[index] if selected_slots else index
            print_items.append(
                PrintJobItem(
                    print_job=print_job,
                    member=item_payload["member"],
                    license=item_payload["license"],
                    quantity=1,
                    slot_index=slot_index,
                    status=PrintJobItem.Status.PENDING,
                )
            )
        PrintJobItem.objects.bulk_create(print_items)
        FinanceAuditLog.objects.create(
            action="print_job.created",
            message="Print job created.",
            actor=user if getattr(user, "is_authenticated", False) else None,
            club=print_job.club,
            metadata={
                "print_job_id": print_job.id,
                "item_count": len(resolved_items),
                "source": "ltf_licenses",
            },
        )
    return print_job


def print_license_cards(
    *,
    license_ids,
    user,
    request,
    template_version_id=None,
    printer_profile_id=None,
    selected_slots=None,
) -> tuple[list[PrintJob], list[int]]:
    ids = _parse_license_ids(license_ids)
    template_id = _optional_pk(template_version_id, "template_version")
    printer_id = _optional_pk(printer_profile_id, "printer_profile")
    slots = _parse_selected_slots(selected_slots)
    template_version = _resolve_template(template_id)
    paper = _paper_for(template_version)
    licenses = list(
        License.objects.select_related("member", "club", "license_type").filter(id__in=ids)
    )
    found = {row.id for row in licenses}
    missing = [value for value in ids if value not in found]
    if missing:
        raise serializers.ValidationError(
            {"license_ids": f"Unknown license id(s): {', '.join(str(value) for value in missing)}."}
        )
    order = {value: index for index, value in enumerate(ids)}
    licenses.sort(key=lambda row: order[row.id])
    skipped = [row.id for row in licenses if row.club_id is None]
    grouped: dict[int, list[License]] = defaultdict(list)
    for row in licenses:
        if row.club_id is not None:
            grouped[row.club_id].append(row)
    if not grouped:
        raise LicenseCardPrintError("license_has_no_club")
    if slots and paper is None:
        raise serializers.ValidationError({"selected_slots": "Selected slots require a paper profile."})
    if slots and paper is not None:
        invalid = [slot for slot in slots if slot >= int(paper.slot_count)]
        if invalid:
            raise serializers.ValidationError(
                {
                    "selected_slots": (
                        "Out-of-range slot index(es): " + ", ".join(str(value) for value in invalid)
                    )
                }
            )
        for rows in grouped.values():
            if len(slots) < len(rows):
                raise serializers.ValidationError(
                    {"selected_slots": "Selected slots count must be >= number of printable items."}
                )

    jobs: list[PrintJob] = []
    for club_id in sorted(grouped):
        rows = grouped[club_id]
        payload = {
            "club": club_id,
            "template_version": template_version.id,
            "license_ids": [row.id for row in rows],
            "metadata": {"quick_print": True, "source": "ltf_licenses"},
        }
        if paper is not None:
            payload["paper_profile"] = paper.id
        if printer_id is not None:
            payload["printer_profile"] = printer_id
        if slots:
            payload["selected_slots"] = slots
        serializer = PrintJobCreateSerializer(data=payload, context={"request": request})
        serializer.is_valid(raise_exception=True)
        job = _persist_print_job(serializer, user)
        execute_print_job_now(print_job_id=job.id, actor_id=getattr(user, "id", None))
        job.refresh_from_db()
        if job.status != PrintJob.Status.SUCCEEDED or not job.artifact_pdf:
            raise LicenseCardPrintError(job.error_detail or "print_failed", status.HTTP_500_INTERNAL_SERVER_ERROR)
        jobs.append(job)
    return jobs, skipped
