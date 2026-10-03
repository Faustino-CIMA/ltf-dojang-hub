from datetime import datetime, time

from django.db.models import Prefetch, Q
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.response import Response

from config.pagination import OptionalPaginationListMixin

from .access import (
    calendar_entitled,
    can_manage_event,
    can_view_event,
    club_calendar_assigned,
    current_president_club_ids,
    is_club_coach,
    is_club_manager,
    is_ltf_manager,
    member_home_club_id,
)
from .attention import snooze_until, upcoming_bounds
from .models import Event, EventAttention
from .serializers import EventSerializer


class EventCalendarPermission(permissions.BasePermission):
    message = "This module is not available."

    def has_permission(self, request, view) -> bool:
        user = request.user
        if not user or not user.is_authenticated:
            return False
        return calendar_entitled()


class EventViewSet(OptionalPaginationListMixin, viewsets.ModelViewSet):
    serializer_class = EventSerializer
    permission_classes = [EventCalendarPermission]

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Event.objects.none()
        user = self.request.user
        qs = Event.objects.select_related("club", "created_by")
        if self.action in ("update", "partial_update", "destroy", "retrieve"):
            return qs
        return self._visible_queryset(user, qs)

    def _visible_queryset(self, user, qs, bounds=None):
        scope = (self.request.query_params.get("scope") or "").strip()
        club_id = self._optional_int(self.request.query_params.get("club"))
        if bounds is None:
            qs = self._apply_range(qs)
        else:
            start, end = bounds
            qs = qs.filter(ends_at__gte=start, starts_at__lte=end)

        if scope == Event.OwnerScope.FEDERATION:
            qs = qs.filter(
                Q(owner_scope=Event.OwnerScope.FEDERATION) | Q(visibility=Event.Visibility.SHARED)
            )
        elif scope == Event.OwnerScope.CLUB:
            if club_id is None:
                raise ValidationError({"club": "Select a club."})
            if not club_calendar_assigned(club_id):
                raise PermissionDenied(detail="This module is not available.")
            if not (
                is_ltf_manager(user)
                or is_club_manager(user, club_id)
                or is_club_coach(user, club_id)
                or member_home_club_id(user) == club_id
                or club_id in current_president_club_ids(user)
            ):
                raise PermissionDenied(detail="This module is not available.")
            qs = qs.filter(
                Q(owner_scope=Event.OwnerScope.CLUB, club_id=club_id)
                | Q(visibility=Event.Visibility.SHARED)
                | Q(visibility=Event.Visibility.PRESIDENTS, audience_clubs=club_id)
            ).distinct()

        qs = qs.prefetch_related(
            "audience_clubs",
            Prefetch(
                "attentions",
                queryset=EventAttention.objects.filter(user=user),
                to_attr="my_attention",
            ),
        )
        visible_ids = [event.id for event in qs if can_view_event(user, event)]
        return qs.filter(id__in=visible_ids)

    def _apply_range(self, qs):
        start = self._parse_dt(self.request.query_params.get("from"))
        end = self._parse_dt(self.request.query_params.get("to"))
        if start:
            qs = qs.filter(ends_at__gte=start)
        if end:
            qs = qs.filter(starts_at__lte=end)
        return qs

    def retrieve(self, request, *args, **kwargs):
        event = self.get_object()
        if not can_view_event(request.user, event):
            raise PermissionDenied(detail="This module is not available.")
        self._mark_seen(request.user, event)
        return super().retrieve(request, *args, **kwargs)

    @action(detail=False, methods=["get"])
    def summary(self, request):
        qs = self._visible_queryset(request.user, Event.objects.all(), bounds=upcoming_bounds())
        event_ids = list(qs.values_list("id", flat=True))
        seen_ids = set(
            EventAttention.objects.filter(
                user=request.user,
                event_id__in=event_ids,
                seen_at__isnull=False,
            ).values_list("event_id", flat=True)
        )
        unseen = sum(1 for event_id in event_ids if event_id not in seen_ids)
        return Response({"upcoming_count": len(event_ids), "unseen_count": unseen})

    @action(detail=False, methods=["get"])
    def reminders(self, request):
        if not self._is_club_admin(request.user):
            return Response([])
        now = timezone.now()
        today = timezone.localdate()
        rows = (
            EventAttention.objects.filter(
                user=request.user,
                remind_on__isnull=False,
                remind_on__lte=today,
                dismissed_at__isnull=True,
                event__ends_at__gte=now,
            )
            .filter(Q(snoozed_until__isnull=True) | Q(snoozed_until__lte=now))
            .select_related("event", "event__club")
            .order_by("remind_on", "event__starts_at", "event_id")
        )
        payload = []
        for row in rows:
            if not can_view_event(request.user, row.event):
                continue
            payload.append(
                {
                    "id": row.event_id,
                    "title": row.event.title,
                    "starts_at": row.event.starts_at.isoformat(),
                    "club_name": row.event.club.name if row.event.club_id else None,
                    "remind_on": row.remind_on.isoformat(),
                }
            )
        return Response(payload)

    @action(detail=True, methods=["post"])
    def seen(self, request, pk=None):
        event = self._visible_event(request)
        self._mark_seen(request.user, event)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post", "delete"])
    def reminder(self, request, pk=None):
        event = self._visible_event(request)
        self._require_club_admin(request.user)
        if request.method == "DELETE":
            EventAttention.objects.filter(user=request.user, event=event).update(
                remind_on=None,
                snoozed_until=None,
                dismissed_at=None,
            )
            return Response(status=status.HTTP_204_NO_CONTENT)
        if event.ends_at < timezone.now():
            raise ValidationError({"remind_on": "This event has already ended."})
        attention, _created = EventAttention.objects.get_or_create(user=request.user, event=event)
        attention.remind_on = self._parse_remind_on(request.data.get("remind_on"), event)
        attention.snoozed_until = None
        attention.dismissed_at = None
        attention.save(update_fields=["remind_on", "snoozed_until", "dismissed_at"])
        return Response(self._reminder_payload(attention))

    @action(detail=True, methods=["post"], url_path="reminder-snooze")
    def reminder_snooze(self, request, pk=None):
        event = self._visible_event(request)
        self._require_club_admin(request.user)
        attention = self._active_reminder(request.user, event)
        attention.snoozed_until = snooze_until()
        attention.save(update_fields=["snoozed_until"])
        return Response(self._reminder_payload(attention))

    @action(detail=True, methods=["post"], url_path="reminder-dismiss")
    def reminder_dismiss(self, request, pk=None):
        event = self._visible_event(request)
        self._require_club_admin(request.user)
        attention = self._active_reminder(request.user, event)
        attention.dismissed_at = timezone.now()
        attention.snoozed_until = None
        attention.save(update_fields=["dismissed_at", "snoozed_until"])
        return Response(self._reminder_payload(attention))

    def perform_create(self, serializer):
        self._authorize_write(serializer.validated_data)
        serializer.save(created_by=self.request.user)

    def perform_update(self, serializer):
        event = self.get_object()
        if not can_manage_event(self.request.user, event):
            raise PermissionDenied(detail="This module is not available.")
        payload = {**serializer.validated_data}
        self._authorize_write(payload, instance=event)
        serializer.save()

    def perform_destroy(self, instance):
        if not can_manage_event(self.request.user, instance):
            raise PermissionDenied(detail="This module is not available.")
        instance.delete()

    def _authorize_write(self, data, instance=None):
        owner_scope = data.get("owner_scope", getattr(instance, "owner_scope", None))
        club = data.get("club", getattr(instance, "club", None))
        club_id = getattr(club, "id", club)
        user = self.request.user
        if owner_scope == Event.OwnerScope.FEDERATION:
            if not is_ltf_manager(user):
                raise PermissionDenied(detail="This module is not available.")
            return
        if owner_scope == Event.OwnerScope.CLUB:
            if not club_calendar_assigned(club_id) or not is_club_manager(user, club_id):
                raise PermissionDenied(detail="This module is not available.")
            return
        raise ValidationError({"owner_scope": "Choose federation or club."})

    def _optional_int(self, value):
        if value in (None, ""):
            return None
        try:
            return int(value)
        except (TypeError, ValueError):
            raise ValidationError({"club": "Select a club."})

    def _visible_event(self, request):
        event = self.get_object()
        if not can_view_event(request.user, event):
            raise PermissionDenied(detail="This module is not available.")
        return event

    def _is_club_admin(self, user) -> bool:
        return bool(user and getattr(user, "is_authenticated", False) and getattr(user, "role", "") == "club_admin")

    def _require_club_admin(self, user):
        if not self._is_club_admin(user):
            raise PermissionDenied(detail="This module is not available.")

    def _mark_seen(self, user, event: Event):
        attention, _created = EventAttention.objects.get_or_create(user=user, event=event)
        if attention.seen_at is None:
            attention.seen_at = timezone.now()
            attention.save(update_fields=["seen_at"])

    def _active_reminder(self, user, event: Event) -> EventAttention:
        attention = EventAttention.objects.filter(
            user=user,
            event=event,
            remind_on__isnull=False,
            dismissed_at__isnull=True,
        ).first()
        if attention is None:
            raise NotFound(detail="Set a reminder first.")
        return attention

    def _parse_remind_on(self, value, event: Event):
        today = timezone.localdate()
        if value in (None, ""):
            day = timezone.localtime(event.starts_at).date()
            return today if day < today else day
        parsed = parse_date(str(value))
        if parsed is None:
            raise ValidationError({"remind_on": "Use an ISO date."})
        return parsed

    def _reminder_payload(self, attention: EventAttention):
        return {
            "remind_on": attention.remind_on.isoformat() if attention.remind_on else None,
            "snoozed_until": attention.snoozed_until.isoformat() if attention.snoozed_until else None,
            "dismissed": attention.dismissed_at is not None,
        }

    def _parse_dt(self, value):
        if not value:
            return None
        raw = str(value)
        parsed = parse_datetime(raw)
        if parsed is None:
            day = parse_date(raw)
            if day is None:
                raise ValidationError({"from": "Use an ISO date or datetime."})
            parsed = datetime.combine(day, time.min)
        if timezone.is_naive(parsed):
            parsed = timezone.make_aware(parsed, timezone.get_current_timezone())
        return parsed
