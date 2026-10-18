from datetime import date
from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.db.models import Count
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from licenses.models import License
from members.models import Member

from .body_measurements import (
    BodyMeasurement,
    annotate_latest_measurements,
    apply_measurement_fields,
    kyorugi_margin,
    measurement_club_ids,
    poomsae_division,
    suggest_age_class,
    weight_close_to_limit,
)
from .team_sheet import sheet_csv, sheet_pdf
from .teams import ClubTeam, ClubTeamGroup, ClubTeamGroupMember, ClubTeamMembership


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
    if "competition_on" in data:
        cleaned["competition_on"] = _parse_competition_date(data.get("competition_on"))
    if "competition_name" in data:
        cleaned["competition_name"] = str(data.get("competition_name") or "").strip()[:120]
    if "weight_margin_kg" in data:
        cleaned["weight_margin_kg"] = _parse_margin(data.get("weight_margin_kg"))
    return cleaned


def _parse_margin(value):
    if value in (None, ""):
        return Decimal("1.0")
    try:
        margin = Decimal(str(value))
    except (InvalidOperation, ValueError) as exc:
        raise ValidationError({"weight_margin_kg": "margin_out_of_range"}) from exc
    if margin.as_tuple().exponent < -1 or margin < 0 or margin > Decimal("20"):
        raise ValidationError({"weight_margin_kg": "margin_out_of_range"})
    return margin.quantize(Decimal("0.1"))


def _parse_competition_date(value):
    if value in (None, ""):
        return None
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError as exc:
        raise ValidationError({"competition_on": "date_required"}) from exc


def _licence_covers(member: Member, competition_on: date | None) -> str:
    """Warning when no licence is still valid on the competition date."""
    if competition_on is None:
        return ""
    expired_before = False
    for lic in member.licenses.all():
        if lic.status == License.Status.REVOKED or lic.end_date is None:
            continue
        if lic.end_date >= competition_on:
            return ""
        expired_before = True
    return "expires" if expired_before else "missing"


def _licence_status(member: Member) -> str:
    statuses = {row.status for row in member.licenses.all()}
    if License.Status.ACTIVE in statuses:
        return License.Status.ACTIVE
    if License.Status.PENDING in statuses:
        return License.Status.PENDING
    if License.Status.EXPIRED in statuses:
        return License.Status.EXPIRED
    return "none"


def _iso(value):
    return value.isoformat() if value else None


def _roster_members(team: ClubTeam) -> list[dict]:
    """Athlete rows for one team. Measurements stay on the member.

    Age class, Poomsae division, and the WT category use the competition
    year's calendar age when a competition date is set.
    """
    year = team.competition_on.year if team.competition_on else timezone.localdate().year
    margin = team.weight_margin_kg if team.weight_margin_kg is not None else Decimal("1.0")
    queryset = annotate_latest_measurements(
        Member.objects.filter(team_memberships__team=team),
        {team.club_id},
    ).prefetch_related("licenses").order_by("last_name", "first_name", "id")
    rows = []
    for member in queryset:
        age_class = suggest_age_class(member.date_of_birth, year)
        category, delta = kyorugi_margin(member.latest_weight_kg, age_class, member.sex)
        weight = None if member.latest_weight_kg is None else f"{Decimal(member.latest_weight_kg):.1f}"
        rows.append(
            {
                "id": member.id,
                "first_name": member.first_name,
                "last_name": member.last_name,
                "sex": member.sex,
                "birth_year": member.date_of_birth.year if member.date_of_birth else None,
                "belt_rank": member.belt_rank,
                "age_class": age_class,
                "poomsae_division": poomsae_division(member.date_of_birth, year),
                "latest_weight_kg": weight,
                "latest_weight_on": _iso(member.latest_weight_on),
                "latest_height_cm": member.latest_height_cm,
                "latest_height_on": _iso(member.latest_height_on),
                "weight_category": category,
                "weight_delta_kg": delta,
                "weight_warning": weight_close_to_limit(delta, category, margin),
                "licence_status": _licence_status(member),
                "licence_warning": _licence_covers(member, team.competition_on),
            }
        )
    return rows


def _group_payload(group: ClubTeamGroup) -> dict:
    slots = group.slots.select_related("member").order_by("position", "id")
    return {
        "id": group.id,
        "kind": group.kind,
        "name": group.name,
        "members": [
            {
                "id": slot.member_id,
                "first_name": slot.member.first_name,
                "last_name": slot.member.last_name,
                "sex": slot.member.sex,
            }
            for slot in slots
        ],
    }


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
        "competition_on": _iso(team.competition_on),
        "competition_name": team.competition_name,
        "weight_margin_kg": f"{Decimal(team.weight_margin_kg):.1f}",
    }
    if include_members:
        payload["members"] = _roster_members(team)
        payload["groups"] = [_group_payload(group) for group in team.groups.order_by("kind", "id")]
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
        ClubTeamGroupMember.objects.filter(group__team=team, member_id=member_id).delete()
        team.member_count = team.memberships.count()
        return Response(_team_payload(team, include_members=True))


def _ordered_group_members(group: ClubTeamGroup, member_ids: list[int]) -> list[Member]:
    # Recognized Poomsae, Articles 5 and 6 of the WT Poomsae Competition Rules
    # & Interpretation in force 30 September 2024. Pair is one event of two
    # athletes and is not split into men's and women's pair, so the entry is
    # one male and one female. Men's team and women's team are three athletes
    # of the same sex.
    # https://aliansitaekwondo.com/wp-content/uploads/2025/03/WT-Poomsae-Competition-Rules-and-Interpretation-In-force-as-of-September-30-2024.pdf
    team = group.team
    if team.discipline != ClubTeam.Discipline.POOMSAE:
        raise ValidationError({"kind": "group_discipline"})
    unique_ids = []
    for raw in member_ids:
        try:
            member_id = int(raw)
        except (TypeError, ValueError) as exc:
            raise ValidationError({"members": "member_not_on_team"}) from exc
        if member_id not in unique_ids:
            unique_ids.append(member_id)
    on_team = set(team.memberships.values_list("member_id", flat=True))
    if any(member_id not in on_team for member_id in unique_ids):
        raise ValidationError({"members": "member_not_on_team"})
    members = list(Member.objects.filter(id__in=unique_ids))
    by_id = {member.id: member for member in members}
    ordered = [by_id[member_id] for member_id in unique_ids if member_id in by_id]
    sexes = [member.sex for member in ordered]
    if group.kind == ClubTeamGroup.Kind.PAIR:
        if len(ordered) != 2:
            raise ValidationError({"members": "pair_size"})
        if sorted(sexes) != ["F", "M"]:
            raise ValidationError({"members": "pair_mixed"})
    elif group.kind == ClubTeamGroup.Kind.TEAM:
        if len(ordered) != 3:
            raise ValidationError({"members": "team_size"})
        if len(set(sexes)) != 1:
            raise ValidationError({"members": "team_same_sex"})
    else:
        raise ValidationError({"kind": "kind_required"})
    return ordered


def _write_group_members(group: ClubTeamGroup, ordered: list[Member]) -> None:
    ClubTeamGroupMember.objects.filter(group=group).delete()
    ClubTeamGroupMember.objects.bulk_create(
        [ClubTeamGroupMember(group=group, member=member, position=index) for index, member in enumerate(ordered)]
    )


class ClubTeamWeighInView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, team_id):
        team = _team_for(request.user, team_id)
        measured_on = request.data.get("measured_on")
        entries = request.data.get("entries")
        if not isinstance(entries, list):
            entries = []
        on_team = set(team.memberships.values_list("member_id", flat=True))
        created = 0
        with transaction.atomic():
            for entry in entries:
                if not isinstance(entry, dict):
                    continue
                raw_weight = entry.get("weight_kg")
                if raw_weight in (None, ""):
                    continue
                try:
                    member_id = int(entry.get("member"))
                except (TypeError, ValueError) as exc:
                    raise ValidationError({"member": "member_not_on_team"}) from exc
                if member_id not in on_team:
                    raise ValidationError({"member": "member_not_on_team"})
                measurement = BodyMeasurement(member_id=member_id)
                apply_measurement_fields(
                    measurement,
                    {"measured_on": measured_on, "weight_kg": raw_weight, "height_cm": None, "note": ""},
                    creating=True,
                )
                measurement.recorded_by = request.user
                measurement.save()
                created += 1
        team.member_count = team.memberships.count()
        return Response({"created": created, "team": _team_payload(team, include_members=True)})


class ClubTeamGroupView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, team_id):
        team = _team_for(request.user, team_id)
        kind = str(request.data.get("kind") or "").strip()
        if kind not in ClubTeamGroup.Kind.values:
            raise ValidationError({"kind": "kind_required"})
        group = ClubTeamGroup(team=team, kind=kind, name=str(request.data.get("name") or "").strip()[:120])
        ordered = _ordered_group_members(group, request.data.get("members") or [])
        group.save()
        _write_group_members(group, ordered)
        team.member_count = team.memberships.count()
        return Response(_team_payload(team, include_members=True), status=201)

    def patch(self, request, team_id, group_id):
        team = _team_for(request.user, team_id)
        group = get_object_or_404(ClubTeamGroup, pk=group_id, team=team)
        if "kind" in request.data:
            kind = str(request.data.get("kind") or "").strip()
            if kind not in ClubTeamGroup.Kind.values:
                raise ValidationError({"kind": "kind_required"})
            group.kind = kind
        if "name" in request.data:
            group.name = str(request.data.get("name") or "").strip()[:120]
        current = list(group.slots.order_by("position", "id").values_list("member_id", flat=True))
        ordered = _ordered_group_members(group, request.data.get("members", current))
        group.save()
        _write_group_members(group, ordered)
        team.member_count = team.memberships.count()
        return Response(_team_payload(team, include_members=True))

    def delete(self, request, team_id, group_id):
        team = _team_for(request.user, team_id)
        group = get_object_or_404(ClubTeamGroup, pk=group_id, team=team)
        group.delete()
        team.member_count = team.memberships.count()
        return Response(_team_payload(team, include_members=True))


class ClubTeamSheetView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, team_id, export_format):
        team = _team_for(request.user, team_id)
        team.member_count = team.memberships.count()
        payload = _team_payload(team, include_members=True)
        lang = str(request.query_params.get("lang") or "en")
        filename = f"team-{team.id}"
        if export_format == "csv":
            response = HttpResponse(sheet_csv(payload, lang), content_type="text/csv; charset=utf-8")
            response["Content-Disposition"] = f'attachment; filename="{filename}.csv"'
            return response
        if export_format == "pdf":
            pdf = sheet_pdf(payload, lang)
            if pdf is None:
                return Response({"detail": "PDF generation is not available."}, status=503)
            response = HttpResponse(pdf, content_type="application/pdf")
            response["Content-Disposition"] = f'attachment; filename="{filename}.pdf"'
            return response
        raise ValidationError({"format": "format_required"})
