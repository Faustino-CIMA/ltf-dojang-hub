from datetime import date
from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.db.models import Count, OuterRef, Q, Subquery
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from licenses.models import License
from members.models import Member

from .access import CompetitionModulePermission
from .body_measurements import (
    BodyMeasurement,
    annotate_latest_measurements,
    apply_measurement_fields,
    measurement_club_ids,
    poomsae_division,
    suggest_age_class,
    weight_close_to_limit,
)
from .category_sets import SET_CODES, bands_for, parse_custom_bands, resolve_category
from .team_sheet import sheet_csv, sheet_pdf
from .teams import (
    ClubTeam,
    ClubTeamCategoryBand,
    ClubTeamGroup,
    ClubTeamGroupMember,
    ClubTeamMembership,
    WeightCategorySet,
)


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


def _require_writable(team: ClubTeam) -> None:
    if team.archived_at is not None:
        raise ValidationError({"archived": "team_archived"})


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
    if "category_set" in data:
        code = str(data.get("category_set") or "").strip()
        if code not in SET_CODES:
            raise ValidationError({"category_set": "category_set_required"})
        cleaned["category_set_code"] = code
    if "archived" in data:
        flag = data.get("archived")
        if flag is True:
            cleaned["archived_at"] = timezone.now()
        elif flag is False:
            cleaned["archived_at"] = None
        else:
            raise ValidationError({"archived": "archived_required"})
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
    """Rows for one team. Measurements stay on the member.

    Age class, Poomsae division, and the WT category use the competition
    year's calendar age when a competition date is set. Coaches are listed
    with the team but those classes are not computed for them. A licence
    warning still applies to a coach.
    """
    year = team.competition_on.year if team.competition_on else timezone.localdate().year
    margin = team.weight_margin_kg if team.weight_margin_kg is not None else Decimal("1.0")
    set_code, age_basis, bands = bands_for(team)
    role_rows = ClubTeamMembership.objects.filter(team=team, member_id=OuterRef("pk")).values("role")[:1]
    queryset = annotate_latest_measurements(
        Member.objects.filter(team_memberships__team=team),
        {team.club_id},
    ).annotate(team_role=Subquery(role_rows)).prefetch_related("licenses").order_by("last_name", "first_name", "id")
    rows = []
    for member in queryset:
        role = member.team_role or ClubTeamMembership.Role.ATHLETE
        athlete = role != ClubTeamMembership.Role.COACH
        age_class = suggest_age_class(member.date_of_birth, year) if athlete else ""
        if athlete:
            category, delta, reason, age = resolve_category(
                date_of_birth=member.date_of_birth,
                sex=member.sex,
                weight_kg=member.latest_weight_kg,
                competition_on=team.competition_on,
                category_set_code=set_code,
                age_basis=age_basis,
                bands=bands,
            )
            division = poomsae_division(member.date_of_birth, year)
            warning = weight_close_to_limit(delta, category, margin)
        else:
            category, delta, reason, age, division, warning = "", None, "", None, "", False
        weight = None if member.latest_weight_kg is None else f"{Decimal(member.latest_weight_kg):.1f}"
        rows.append(
            {
                "id": member.id,
                "first_name": member.first_name,
                "last_name": member.last_name,
                "sex": member.sex,
                "role": role,
                "birth_year": member.date_of_birth.year if member.date_of_birth else None,
                "belt_rank": member.belt_rank,
                "age_class": age_class,
                "poomsae_division": division,
                "latest_weight_kg": weight,
                "latest_weight_on": _iso(member.latest_weight_on),
                "latest_height_cm": member.latest_height_cm,
                "latest_height_on": _iso(member.latest_height_on),
                "weight_category": category,
                "weight_category_reason": reason,
                "category_age": age,
                "weight_delta_kg": delta,
                "weight_warning": warning,
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


def _membership_counts(team: ClubTeam) -> tuple[int, int]:
    athlete = getattr(team, "athlete_count", None)
    coach = getattr(team, "coach_count", None)
    if athlete is None or coach is None:
        athlete = team.memberships.filter(role=ClubTeamMembership.Role.ATHLETE).count()
        coach = team.memberships.filter(role=ClubTeamMembership.Role.COACH).count()
    return int(athlete), int(coach)


def _suggested_coach_ids(team: ClubTeam) -> list[int]:
    """Club members whose user is a coach of this club, listed first when adding."""
    trainer_ids = team.club.trainers.values_list("id", flat=True)
    return list(
        Member.objects.filter(club_id=team.club_id, is_active=True, user_id__in=trainer_ids)
        .order_by("last_name", "first_name", "id")
        .values_list("id", flat=True)
    )


def _team_payload(team: ClubTeam, *, include_members: bool) -> dict:
    athletes, coaches = _membership_counts(team)
    payload = {
        "id": team.id,
        "club": team.club_id,
        "name": team.name,
        "discipline": team.discipline,
        "note": team.note,
        "member_count": athletes + coaches,
        "athlete_count": athletes,
        "coach_count": coaches,
        "competition_on": _iso(team.competition_on),
        "competition_name": team.competition_name,
        "weight_margin_kg": f"{Decimal(team.weight_margin_kg):.1f}",
        "category_set": team.category_set_code or "wt",
        "archived": team.archived_at is not None,
    }
    if include_members:
        payload["members"] = _roster_members(team)
        payload["groups"] = [_group_payload(group) for group in team.groups.order_by("kind", "id")]
        payload["suggested_coach_ids"] = _suggested_coach_ids(team)
        payload["custom_bands"] = [
            {
                "id": row.id,
                "label": row.label,
                "age_min": row.age_min,
                "age_max": row.age_max,
                "sex": row.sex,
                "ceilings": list(row.ceilings or []),
            }
            for row in team.custom_bands.all()
        ]
        payload["category_sets"] = [
            {"code": row.code, "source_note": row.source_note, "age_basis": row.age_basis}
            for row in WeightCategorySet.objects.all()
        ]
        payload["category_sets"].append({"code": "custom", "source_note": "", "age_basis": "birth_year"})
    return payload


def _with_counts(queryset):
    return queryset.annotate(
        member_count=Count("memberships"),
        athlete_count=Count("memberships", filter=Q(memberships__role=ClubTeamMembership.Role.ATHLETE)),
        coach_count=Count("memberships", filter=Q(memberships__role=ClubTeamMembership.Role.COACH)),
    )


class ClubTeamListView(APIView):
    permission_classes = [IsAuthenticated, CompetitionModulePermission]
    module_id = "competition"

    def get(self, request):
        clubs = _require_clubs(request.user)
        queryset = _with_counts(ClubTeam.objects.filter(club_id__in=clubs))
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
        archived = request.query_params.get("archived")
        if archived == "all":
            pass
        elif archived in ("1", "true", "only"):
            queryset = queryset.filter(archived_at__isnull=False)
        else:
            queryset = queryset.filter(archived_at__isnull=True)
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
        team.athlete_count = 0
        team.coach_count = 0
        return Response(_team_payload(team, include_members=True), status=201)


class ClubTeamDetailView(APIView):
    permission_classes = [IsAuthenticated, CompetitionModulePermission]
    module_id = "competition"

    def get(self, request, team_id):
        team = _team_for(request.user, team_id)
        return Response(_team_payload(team, include_members=True))

    def patch(self, request, team_id):
        team = _team_for(request.user, team_id)
        if team.archived_at is not None:
            if request.data.get("archived") is not False or set(request.data.keys()) != {"archived"}:
                raise ValidationError({"archived": "team_archived"})
            team.archived_at = None
            team.save(update_fields=["archived_at", "updated_at"])
            return Response(_team_payload(team, include_members=True))
        if request.data.get("remove_competition") is True:
            team.competition_on = None
            team.competition_name = ""
            team.category_set_code = "wt"
            with transaction.atomic():
                team.custom_bands.all().delete()
                team.save(update_fields=["competition_on", "competition_name", "category_set_code", "updated_at"])
            return Response(_team_payload(team, include_members=True))
        fields = _clean_fields(request.data, creating=False)
        custom = parse_custom_bands(request.data.get("custom_bands")) if "custom_bands" in request.data else None
        for key, value in fields.items():
            setattr(team, key, value)
        if (team.category_set_code or "wt") == "custom" and custom is None and not team.custom_bands.exists():
            raise ValidationError({"custom_bands": "custom_bands_required"})
        with transaction.atomic():
            team.save()
            if custom is not None:
                team.custom_bands.all().delete()
                ClubTeamCategoryBand.objects.bulk_create(
                    [ClubTeamCategoryBand(team=team, position=index, **row) for index, row in enumerate(custom)]
                )
        return Response(_team_payload(team, include_members=True))

    def delete(self, request, team_id):
        team = _team_for(request.user, team_id)
        team.delete()
        return Response(status=204)


class ClubTeamMemberView(APIView):
    permission_classes = [IsAuthenticated, CompetitionModulePermission]
    module_id = "competition"

    def post(self, request, team_id):
        team = _team_for(request.user, team_id)
        _require_writable(team)
        try:
            member_id = int(request.data.get("member"))
        except (TypeError, ValueError) as exc:
            raise ValidationError({"member": "member_required"}) from exc
        member = get_object_or_404(Member, pk=member_id)
        if member.club_id != team.club_id:
            raise ValidationError({"member": "member_other_club"})
        role = _parse_role(request.data.get("role"), default=ClubTeamMembership.Role.ATHLETE)
        membership, _created = ClubTeamMembership.objects.get_or_create(
            team=team,
            member=member,
            defaults={"role": role},
        )
        if membership.role != role:
            _set_membership_role(membership, role)
        return Response(_team_payload(team, include_members=True))

    def patch(self, request, team_id, member_id):
        team = _team_for(request.user, team_id)
        _require_writable(team)
        membership = get_object_or_404(ClubTeamMembership, team=team, member_id=member_id)
        _set_membership_role(membership, _parse_role(request.data.get("role")))
        return Response(_team_payload(team, include_members=True))

    def delete(self, request, team_id, member_id):
        team = _team_for(request.user, team_id)
        _require_writable(team)
        ClubTeamMembership.objects.filter(team=team, member_id=member_id).delete()
        ClubTeamGroupMember.objects.filter(group__team=team, member_id=member_id).delete()
        return Response(_team_payload(team, include_members=True))


class ClubTeamMemberBulkView(APIView):
    permission_classes = [IsAuthenticated, CompetitionModulePermission]
    module_id = "competition"

    def post(self, request, team_id):
        team = _team_for(request.user, team_id)
        _require_writable(team)
        action = str(request.data.get("action") or "").strip()
        raw_ids = request.data.get("members")
        if not isinstance(raw_ids, list) or not raw_ids:
            raise ValidationError({"members": "member_required"})
        ids: list[int] = []
        for item in raw_ids:
            try:
                ids.append(int(item))
            except (TypeError, ValueError) as exc:
                raise ValidationError({"members": "member_required"}) from exc
        ids = list(dict.fromkeys(ids))
        memberships = list(ClubTeamMembership.objects.filter(team=team, member_id__in=ids))
        if len(memberships) != len(ids):
            raise ValidationError({"members": "member_not_on_team"})
        if action == "remove":
            ClubTeamMembership.objects.filter(team=team, member_id__in=ids).delete()
            ClubTeamGroupMember.objects.filter(group__team=team, member_id__in=ids).delete()
        elif action in {ClubTeamMembership.Role.ATHLETE, ClubTeamMembership.Role.COACH}:
            for membership in memberships:
                _set_membership_role(membership, action)
        else:
            raise ValidationError({"action": "action_required"})
        return Response(_team_payload(team, include_members=True))


def _parse_role(value, *, default: str | None = None) -> str:
    if value in (None, "") and default is not None:
        return default
    role = str(value or "").strip()
    if role not in ClubTeamMembership.Role.values:
        raise ValidationError({"role": "role_required"})
    return role


def _set_membership_role(membership: ClubTeamMembership, role: str) -> None:
    membership.role = role
    membership.save(update_fields=["role"])
    if role == ClubTeamMembership.Role.COACH:
        ClubTeamGroupMember.objects.filter(group__team_id=membership.team_id, member_id=membership.member_id).delete()


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
    on_team = set(
        team.memberships.filter(role=ClubTeamMembership.Role.ATHLETE).values_list("member_id", flat=True)
    )
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
    permission_classes = [IsAuthenticated, CompetitionModulePermission]
    module_id = "competition"

    def post(self, request, team_id):
        team = _team_for(request.user, team_id)
        _require_writable(team)
        measured_on = request.data.get("measured_on")
        entries = request.data.get("entries")
        if not isinstance(entries, list):
            entries = []
        athlete_ids = set(
            team.memberships.filter(role=ClubTeamMembership.Role.ATHLETE).values_list("member_id", flat=True)
        )
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
                if member_id not in athlete_ids:
                    if team.memberships.filter(member_id=member_id, role=ClubTeamMembership.Role.COACH).exists():
                        continue
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
        return Response({"created": created, "team": _team_payload(team, include_members=True)})


class ClubTeamGroupView(APIView):
    permission_classes = [IsAuthenticated, CompetitionModulePermission]
    module_id = "competition"

    def post(self, request, team_id):
        team = _team_for(request.user, team_id)
        _require_writable(team)
        kind = str(request.data.get("kind") or "").strip()
        if kind not in ClubTeamGroup.Kind.values:
            raise ValidationError({"kind": "kind_required"})
        group = ClubTeamGroup(team=team, kind=kind, name=str(request.data.get("name") or "").strip()[:120])
        ordered = _ordered_group_members(group, request.data.get("members") or [])
        group.save()
        _write_group_members(group, ordered)
        return Response(_team_payload(team, include_members=True), status=201)

    def patch(self, request, team_id, group_id):
        team = _team_for(request.user, team_id)
        _require_writable(team)
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
        return Response(_team_payload(team, include_members=True))

    def delete(self, request, team_id, group_id):
        team = _team_for(request.user, team_id)
        _require_writable(team)
        group = get_object_or_404(ClubTeamGroup, pk=group_id, team=team)
        group.delete()
        return Response(_team_payload(team, include_members=True))


class ClubTeamDuplicateView(APIView):
    permission_classes = [IsAuthenticated, CompetitionModulePermission]
    module_id = "competition"

    def post(self, request, team_id):
        source = _team_for(request.user, team_id)
        name = str(request.data.get("name") or "").strip()
        if not name:
            raise ValidationError({"name": "name_required"})
        skipped = 0
        dropped = []
        with transaction.atomic():
            clone = ClubTeam.objects.create(
                club_id=source.club_id,
                name=name[:120],
                discipline=source.discipline,
                note=source.note,
                competition_on=source.competition_on,
                competition_name=source.competition_name,
                weight_margin_kg=source.weight_margin_kg,
                category_set_code=source.category_set_code or "wt",
            )
            ClubTeamCategoryBand.objects.bulk_create(
                [
                    ClubTeamCategoryBand(
                        team=clone,
                        label=row.label,
                        age_min=row.age_min,
                        age_max=row.age_max,
                        sex=row.sex,
                        ceilings=list(row.ceilings or []),
                        position=row.position,
                    )
                    for row in source.custom_bands.all()
                ]
            )
            kept_roles = {}
            for row in source.memberships.select_related("member"):
                if row.member.club_id != source.club_id:
                    skipped += 1
                    continue
                ClubTeamMembership.objects.create(team=clone, member=row.member, role=row.role)
                kept_roles[row.member_id] = row.role
            for group in source.groups.prefetch_related("slots__member").order_by("kind", "id"):
                slots = [
                    slot
                    for slot in group.slots.all()
                    if kept_roles.get(slot.member_id) == ClubTeamMembership.Role.ATHLETE
                ]
                sexes = [slot.member.sex for slot in slots]
                valid_pair = group.kind == ClubTeamGroup.Kind.PAIR and len(slots) == 2 and sorted(sexes) == ["F", "M"]
                valid_trio = group.kind == ClubTeamGroup.Kind.TEAM and len(slots) == 3 and len(set(sexes)) == 1
                if not valid_pair and not valid_trio:
                    dropped.append({"name": group.name, "kind": group.kind})
                    continue
                copy = ClubTeamGroup.objects.create(team=clone, kind=group.kind, name=group.name)
                ClubTeamGroupMember.objects.bulk_create(
                    [
                        ClubTeamGroupMember(group=copy, member_id=slot.member_id, position=index)
                        for index, slot in enumerate(slots)
                    ]
                )
        clone.athlete_count = sum(1 for role in kept_roles.values() if role == ClubTeamMembership.Role.ATHLETE)
        clone.coach_count = sum(1 for role in kept_roles.values() if role == ClubTeamMembership.Role.COACH)
        return Response(
            {
                "team": _team_payload(clone, include_members=True),
                "skipped_left_club": skipped,
                "dropped_groups": dropped,
            },
            status=201,
        )


class ClubTeamSheetView(APIView):
    permission_classes = [IsAuthenticated, CompetitionModulePermission]
    module_id = "competition"

    def get(self, request, team_id, export_format):
        team = _team_for(request.user, team_id)
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
