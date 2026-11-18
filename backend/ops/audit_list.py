"""Server-side filters for the ops audit list. Newest first."""

from __future__ import annotations

from datetime import datetime, time, timedelta

from django.db.models import Q, QuerySet
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from .models import OpsAuditLog


def _day(value: str | None, name: str):
    raw = str(value or "").strip()
    if not raw:
        return None
    try:
        return datetime.strptime(raw, "%Y-%m-%d").date()
    except ValueError as exc:
        raise ValidationError({name: "Use a date as YYYY-MM-DD."}) from exc


def filtered_ops_audit(params) -> QuerySet[OpsAuditLog]:
    qs = OpsAuditLog.objects.select_related("actor").all()
    action = str(params.get("action") or "").strip()
    if action:
        qs = qs.filter(action=action)
    actor = str(params.get("actor") or "").strip()
    if actor:
        qs = qs.filter(actor__username__icontains=actor)
    query = str(params.get("q") or "").strip()
    if query:
        qs = qs.filter(
            Q(actor__username__icontains=query)
            | Q(action__icontains=query)
            | Q(target_type__icontains=query)
            | Q(target_id__icontains=query)
            | Q(message__icontains=query)
            | Q(metadata__club_name__icontains=query)
        )
    start = _day(params.get("from"), "from")
    end = _day(params.get("to"), "to")
    zone = timezone.get_current_timezone()
    if start is not None:
        qs = qs.filter(created_at__gte=timezone.make_aware(datetime.combine(start, time.min), zone))
    if end is not None:
        next_day = timezone.make_aware(datetime.combine(end + timedelta(days=1), time.min), zone)
        qs = qs.filter(created_at__lt=next_day)
    return qs.order_by("-created_at", "-id")
