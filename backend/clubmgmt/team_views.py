from django.db.models import Count
from django.shortcuts import get_object_or_404
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from members.models import Member

from .body_measurements import measurement_club_ids
from .teams import ClubTeam, ClubTeamMembership


def _managed_clubs(user) -> set[int]:
    return measurement_club_ids(user)


def _require_clubs(user) -> set[int]:
    clubs = _managed_clubs(user)
    if not clubs:
        raise PermissionDenied(detail="This module is not available.")
    return clubs


def _team_for(user, team_id: int) -> ClubTeam:
    team = get_object_or_404(ClubTeam, pk=team_id)
    if team.club_id not in _require_clubs(user):
        raise PermissionDenied(detail="This module is not available.")
    return team


def _clean_fields(data, *, creating: bool) -> dict:
    cleaned = {}
    if creating or "name" in data:
        name = str(data.get("name") or "").strip()
        if not name:
            raise ValidationError({"name": "name_required"})
        cleaned["name"] = name[:120]
    if creating or "discipline" in data:
        discipline = str(data.get("discipline") or "").strip()
        if discipline not in ClubTeam.Discipline.values:
            raise ValidationError({"discipline": "discipline_required"})
        cleaned["discipline"] = discipline
    if creating or "note" in data:
        cleaned["note"] = str(data.get("note") or "").strip()[:240]
    return cleaned


def _member_payload(member: Member) -> dict:
    return {"id": member.id, "first_name": member.first_name, "last_name": member.last_name}


def _team_payload(team: ClubTeam, *, include_members: bool) -> dict:
    count = getattr(team, "member_count", None)
    if count is None:
        count = team.memberships.count()
    payload = {
        "id": team.id,
        "club": team.club_id,
        "name": team.name,
        "discipline": team.discipline,
        "note": team.note,
        "member_count": count,
    }
    if include_members:
        rows = team.memberships.select_related("member").order_by("member__last_name", "member__first_name", "id")
        payload["members"] = [_member_payload(row.member) for row in rows]
    return payload


class ClubTeamListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        clubs = _require_clubs(request.user)
        queryset = ClubTeam.objects.filter(club_id__in=clubs).annotate(member_count=Count("memberships"))
        club_id = request.query_params.get("club")
        if club_id not in (None, ""):
            try:
                club_value = int(club_id)
            except (TypeError, ValueError) as exc:
                raise ValidationError({"club": "club_required"}) from exc
            if club_value not in clubs:
                raise PermissionDenied(detail="This module is not available.")
            queryset = queryset.filter(club_id=club_value)
        member_id = request.query_params.get("member")
        if member_id not in (None, ""):
            member = get_object_or_404(Member, pk=member_id)
            if member.club_id not in clubs:
                raise PermissionDenied(detail="This module is not available.")
            queryset = queryset.filter(memberships__member_id=member.id)
        return Response([_team_payload(team, include_members=False) for team in queryset.order_by("name", "id")])

    def post(self, request):
        clubs = _require_clubs(request.user)
        try:
            club_id = int(request.data.get("club"))
        except (TypeError, ValueError) as exc:
            raise ValidationError({"club": "club_required"}) from exc
        if club_id not in clubs:
            raise PermissionDenied(detail="This module is not available.")
        fields = _clean_fields(request.data, creating=True)
        team = ClubTeam.objects.create(club_id=club_id, **fields)
        team.member_count = 0
        return Response(_team_payload(team, include_members=True), status=201)


class ClubTeamDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, team_id):
        team = _team_for(request.user, team_id)
        team.member_count = team.memberships.count()
        return Response(_team_payload(team, include_members=True))

    def patch(self, request, team_id):
        team = _team_for(request.user, team_id)
        for key, value in _clean_fields(request.data, creating=False).items():
            setattr(team, key, value)
        team.save()
        team.member_count = team.memberships.count()
        return Response(_team_payload(team, include_members=True))

    def delete(self, request, team_id):
        team = _team_for(request.user, team_id)
        team.delete()
        return Response(status=204)


class ClubTeamMemberView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, team_id):
        team = _team_for(request.user, team_id)
        try:
            member_id = int(request.data.get("member"))
        except (TypeError, ValueError) as exc:
            raise ValidationError({"member": "member_required"}) from exc
        member = get_object_or_404(Member, pk=member_id)
        if member.club_id != team.club_id:
            raise ValidationError({"member": "member_other_club"})
        ClubTeamMembership.objects.get_or_create(team=team, member=member)
        team.member_count = team.memberships.count()
        return Response(_team_payload(team, include_members=True))

    def delete(self, request, team_id, member_id):
        team = _team_for(request.user, team_id)
        ClubTeamMembership.objects.filter(team=team, member_id=member_id).delete()
        team.member_count = team.memberships.count()
        return Response(_team_payload(team, include_members=True))
