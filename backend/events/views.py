from datetime import datetime, time

from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime
from rest_framework import permissions, viewsets
from rest_framework.exceptions import PermissionDenied, ValidationError

from config.pagination import OptionalPaginationListMixin

from .access import (
    calendar_entitled,
    can_manage_event,
    can_view_event,
    club_calendar_assigned,
    is_club_manager,
    is_ltf_manager,
    member_home_club_id,
)
from .models import Event
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

    def _visible_queryset(self, user, qs):
        scope = (self.request.query_params.get("scope") or "").strip()
        club_id = self._optional_int(self.request.query_params.get("club"))
        qs = self._apply_range(qs)

        if scope == Event.OwnerScope.FEDERATION:
            qs = qs.filter(owner_scope=Event.OwnerScope.FEDERATION)
            if is_ltf_manager(user):
                return qs
            role = getattr(user, "role", "")
            if role in ("club_admin", "coach", "ltf_finance"):
                return qs.exclude(visibility=Event.Visibility.PRIVATE)
            return qs.filter(visibility=Event.Visibility.PUBLIC)

        if scope == Event.OwnerScope.CLUB:
            if club_id is None:
                raise ValidationError({"club": "Select a club."})
            if not club_calendar_assigned(club_id):
                raise PermissionDenied(detail="This module is not available.")
            qs = qs.filter(owner_scope=Event.OwnerScope.CLUB, club_id=club_id)
            if is_ltf_manager(user) or is_club_manager(user, club_id):
                return qs
            if getattr(user, "role", "") == "coach" and user.clubs_administered.filter(id=club_id).exists():
                return qs.exclude(visibility=Event.Visibility.PRIVATE)
            if member_home_club_id(user) == club_id:
                return qs.filter(visibility=Event.Visibility.PUBLIC)
            raise PermissionDenied(detail="This module is not available.")

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
        return super().retrieve(request, *args, **kwargs)

    def perform_create(self, serializer):
        self._authorize_write(serializer.validated_data)
        serializer.save(created_by=self.request.user, kind=Event.Kind.CALENDAR)

    def perform_update(self, serializer):
        event = self.get_object()
        if not can_manage_event(self.request.user, event):
            raise PermissionDenied(detail="This module is not available.")
        payload = {**serializer.validated_data}
        self._authorize_write(payload, instance=event)
        serializer.save(kind=Event.Kind.CALENDAR)

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
