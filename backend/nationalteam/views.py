from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import viewsets
from rest_framework.permissions import BasePermission
from rest_framework.response import Response
from rest_framework.views import APIView

from members.models import Member

from .models import (
    AthleteStatus,
    CadreLevel,
    NationalTeamSettings,
    NationalTeamStaff,
    Season,
    Squad,
    SquadSelection,
)
from .serializers import (
    CadreLevelSerializer,
    SeasonSerializer,
    SelectionSerializer,
    SettingsSerializer,
    SquadSerializer,
    StaffSerializer,
    StatusSerializer,
    coach_map,
    person_payload,
    status_map,
)
from .services import member_visible_to, reference_day


class NationalTeamAccess(BasePermission):
    """LTF Admin writes. LTF Finance reads everything. Clubs read their own athletes."""

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if user.role == "ltf_admin":
            return True
        if request.method not in ("GET", "HEAD", "OPTIONS"):
            return False
        if user.role == "ltf_finance":
            return True
        return user.role in ("club_admin", "coach") and getattr(view, "club_read", False)


def _selection_queryset(user, request=None):
    queryset = SquadSelection.objects.select_related(
        "member", "member__club", "squad", "season"
    )
    if user.role in ("ltf_admin", "ltf_finance"):
        return queryset
    if user.role in ("club_admin", "coach"):
        queryset = queryset.filter(member__club__admins=user)
        if request is not None:
            from accounts.desks import scope_to_active_club

            queryset = scope_to_active_club(request, queryset, "member__club_id")
        return queryset
    return queryset.none()


def _selection_context(rows, day):
    member_ids = {row.member_id for row in rows}
    squad_ids = {row.squad_id for row in rows}
    return {
        "on": day,
        "statuses": status_map(member_ids, day),
        "coaches": coach_map(squad_ids, day),
    }


class SeasonViewSet(viewsets.ModelViewSet):
    serializer_class = SeasonSerializer
    permission_classes = [NationalTeamAccess]
    club_read = False
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_queryset(self):
        return Season.objects.all()


class SquadViewSet(viewsets.ModelViewSet):
    serializer_class = SquadSerializer
    permission_classes = [NationalTeamAccess]
    club_read = False
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_queryset(self):
        return Squad.objects.all()


class CadreLevelViewSet(viewsets.ModelViewSet):
    serializer_class = CadreLevelSerializer
    permission_classes = [NationalTeamAccess]
    club_read = False
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_queryset(self):
        return CadreLevel.objects.all()


class NationalTeamSettingsView(APIView):
    permission_classes = [NationalTeamAccess]
    club_read = False

    def get(self, request):
        return Response(SettingsSerializer(NationalTeamSettings.load()).data)

    def patch(self, request):
        if request.user.role != "ltf_admin":
            return Response({"detail": "read_only"}, status=403)
        serializer = SettingsSerializer(NationalTeamSettings.load(), data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class SelectionViewSet(viewsets.ModelViewSet):
    serializer_class = SelectionSerializer
    permission_classes = [NationalTeamAccess]
    club_read = False
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self):
        queryset = _selection_queryset(self.request.user, self.request)
        season_id = self.request.query_params.get("season")
        if season_id:
            queryset = queryset.filter(season_id=season_id)
        squad_id = self.request.query_params.get("squad")
        if squad_id:
            queryset = queryset.filter(squad_id=squad_id)
        club_id = self.request.query_params.get("club")
        if club_id:
            queryset = queryset.filter(member__club_id=club_id)
        member_id = self.request.query_params.get("member")
        if member_id:
            queryset = queryset.filter(member_id=member_id)
        return queryset.order_by("member__last_name", "member__first_name", "id")

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["actor"] = self.request.user
        return context

    def list(self, request, *args, **kwargs):
        queryset = self.get_queryset()
        season = None
        season_id = request.query_params.get("season")
        if season_id:
            season = Season.objects.filter(pk=season_id).first()
        day = reference_day(season) if season is not None else None
        if day is None:
            from django.utils import timezone

            day = timezone.localdate()
        rows = list(queryset)
        serializer = self.get_serializer(rows, many=True, context={**self.get_serializer_context(), **_selection_context(rows, day)})
        return Response(serializer.data)

    def retrieve(self, request, *args, **kwargs):
        row = self.get_object()
        day = reference_day(row.season)
        serializer = self.get_serializer(row, context={**self.get_serializer_context(), **_selection_context([row], day)})
        return Response(serializer.data)


class AthleteStatusViewSet(viewsets.ModelViewSet):
    serializer_class = StatusSerializer
    permission_classes = [NationalTeamAccess]
    club_read = False
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self):
        queryset = AthleteStatus.objects.select_related("cadre_level", "member")
        member_id = self.request.query_params.get("member")
        if member_id:
            queryset = queryset.filter(member_id=member_id)
        return queryset

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["actor"] = self.request.user
        return context


class StaffViewSet(viewsets.ModelViewSet):
    serializer_class = StaffSerializer
    permission_classes = [NationalTeamAccess]
    club_read = False
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self):
        return NationalTeamStaff.objects.select_related("member", "member__club", "squad")

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["actor"] = self.request.user
        return context


class AthleteNationalTeamBadgeView(APIView):
    """Whether this athlete is on a squad today, plus the squad and season names."""

    permission_classes = [NationalTeamAccess]
    club_read = True

    def get(self, request, member_id: int):
        member = get_object_or_404(Member.objects.select_related("club"), pk=member_id)
        if not member_visible_to(request.user, member):
            return Response({"detail": "not_found"}, status=404)
        today = timezone.localdate()
        rows = list(
            SquadSelection.objects.filter(member=member, started_on__lte=today)
            .filter(Q(ended_on__isnull=True) | Q(ended_on__gt=today))
            .select_related("squad", "season")
            .order_by("squad__sort_order", "squad__name", "-season__year", "id")
        )
        return Response(
            {
                "selected": bool(rows),
                "labels": [f"{row.squad.name} · {row.season.year}" for row in rows],
            }
        )


class AthleteNationalTeamView(APIView):
    """Read-only squad, status, and coach names for one athlete. LTF only."""

    permission_classes = [NationalTeamAccess]
    club_read = False

    def get(self, request, member_id: int):
        member = get_object_or_404(Member.objects.select_related("club"), pk=member_id)
        if not member_visible_to(request.user, member):
            return Response({"detail": "not_found"}, status=404)
        selections = list(
            SquadSelection.objects.filter(member=member)
            .select_related("member", "member__club", "squad", "season")
            .order_by("-season__year", "-started_on", "id")
        )
        today = timezone.localdate()
        day = today
        if selections:
            current = next((row for row in selections if row.season.starts_on <= today <= row.season.ends_on), None)
            day = reference_day(current.season if current else selections[0].season, today)
        statuses = list(
            AthleteStatus.objects.filter(member=member).select_related("cadre_level").order_by("-started_on", "-id")
        )
        current_statuses = [row for row in statuses if row.started_on <= day and (row.ended_on is None or row.ended_on > day)]
        context = _selection_context(selections, day)
        selection_data = SelectionSerializer(selections, many=True, context={**context, "actor": request.user}).data
        history = StatusSerializer(statuses, many=True).data
        return Response(
            {
                "member": person_payload(member),
                "selections": selection_data,
                "statuses": history,
                "current": {
                    "ltf_level": next(
                        (
                            {"code": row.cadre_level.code, "name": row.cadre_level.name}
                            for row in current_statuses
                            if row.scheme == AthleteStatus.Scheme.LTF_LEVEL and row.cadre_level_id
                        ),
                        None,
                    ),
                    "cosl": next(
                        (
                            {
                                "pathway": row.cosl_pathway,
                                "rank": row.cosl_rank,
                                "project": row.cosl_project,
                            }
                            for row in current_statuses
                            if row.scheme == AthleteStatus.Scheme.COSL
                        ),
                        None,
                    ),
                    "support": next(
                        (
                            row.support_program
                            for row in current_statuses
                            if row.scheme == AthleteStatus.Scheme.SUPPORT
                        ),
                        None,
                    ),
                },
            }
        )
