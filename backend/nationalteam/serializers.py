from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from .models import (
    AthleteStatus,
    CadreLevel,
    NationalTeamSettings,
    NationalTeamStaff,
    Season,
    Squad,
    SquadSelection,
    active_on,
)
from .services import validate_selection, validate_squad, validate_staff, validate_status


def _validation_error(exc: DjangoValidationError) -> serializers.ValidationError:
    if getattr(exc, "error_dict", None):
        detail = {key: [err.message for err in errors] for key, errors in exc.error_dict.items()}
        return serializers.ValidationError(detail)
    if getattr(exc, "error_list", None):
        return serializers.ValidationError([err.message for err in exc.error_list])
    return serializers.ValidationError(str(exc))


class SeasonSerializer(serializers.ModelSerializer):
    class Meta:
        model = Season
        fields = ["id", "year", "starts_on", "ends_on"]

    def validate(self, attrs):
        year = attrs.get("year", getattr(self.instance, "year", None))
        starts_on = attrs.get("starts_on", getattr(self.instance, "starts_on", None))
        ends_on = attrs.get("ends_on", getattr(self.instance, "ends_on", None))
        if starts_on and ends_on and ends_on < starts_on:
            raise serializers.ValidationError({"ends_on": "end_before_start"})
        if year and Season.objects.filter(year=year).exclude(pk=getattr(self.instance, "pk", None)).exists():
            raise serializers.ValidationError({"year": "season_exists"})
        return attrs


class SquadSerializer(serializers.ModelSerializer):
    class Meta:
        model = Squad
        fields = ["id", "code", "name", "discipline", "is_active", "sort_order"]
        extra_kwargs = {"code": {"required": False, "allow_blank": True}}

    def create(self, validated_data):
        squad = Squad(**validated_data)
        try:
            validate_squad(squad)
        except DjangoValidationError as exc:
            raise _validation_error(exc) from exc
        squad.save()
        return squad

    def update(self, instance, validated_data):
        for key, value in validated_data.items():
            setattr(instance, key, value)
        try:
            validate_squad(instance)
        except DjangoValidationError as exc:
            raise _validation_error(exc) from exc
        instance.save()
        return instance


class CadreLevelSerializer(serializers.ModelSerializer):
    class Meta:
        model = CadreLevel
        fields = ["id", "code", "name", "sort_order", "is_active"]

    def validate_code(self, value: str) -> str:
        code = str(value or "").strip()
        if not code:
            raise serializers.ValidationError("code_required")
        return code


class SettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = NationalTeamSettings
        fields = ["forbid_overlapping_squads"]


class PersonSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    first_name = serializers.CharField()
    last_name = serializers.CharField()
    club_id = serializers.IntegerField(allow_null=True)
    club_name = serializers.CharField()


def person_payload(member) -> dict:
    club = member.club if member.club_id else None
    return {
        "id": member.id,
        "first_name": member.first_name,
        "last_name": member.last_name,
        "club_id": member.club_id,
        "club_name": club.name if club is not None else "",
    }


def level_payload(level: CadreLevel | None) -> dict | None:
    if level is None:
        return None
    return {
        "id": level.id,
        "code": level.code,
        "name": level.name,
        "is_active": level.is_active,
    }


def cosl_payload(status: AthleteStatus | None) -> dict | None:
    if status is None:
        return None
    return {
        "pathway": status.cosl_pathway,
        "rank": status.cosl_rank,
        "project": status.cosl_project,
    }


class StatusSerializer(serializers.ModelSerializer):
    cadre_level_id = serializers.PrimaryKeyRelatedField(
        source="cadre_level",
        queryset=CadreLevel.objects.all(),
        required=False,
        allow_null=True,
    )
    level = serializers.SerializerMethodField()

    class Meta:
        model = AthleteStatus
        fields = [
            "id",
            "member",
            "scheme",
            "started_on",
            "ended_on",
            "source_note",
            "cadre_level_id",
            "level",
            "cosl_pathway",
            "cosl_rank",
            "cosl_project",
            "support_program",
        ]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        from members.models import Member

        self.fields["member"].queryset = Member.objects.all()

    def get_level(self, obj: AthleteStatus):
        return level_payload(obj.cadre_level)

    def create(self, validated_data):
        status = AthleteStatus(**validated_data, recorded_by=self.context.get("actor"))
        try:
            validate_status(status)
        except DjangoValidationError as exc:
            raise _validation_error(exc) from exc
        status.save()
        return status

    def update(self, instance, validated_data):
        for key, value in validated_data.items():
            setattr(instance, key, value)
        try:
            validate_status(instance)
        except DjangoValidationError as exc:
            raise _validation_error(exc) from exc
        instance.save()
        return instance


class StaffSerializer(serializers.ModelSerializer):
    person = serializers.SerializerMethodField()

    class Meta:
        model = NationalTeamStaff
        fields = [
            "id",
            "member",
            "person",
            "function",
            "squad",
            "title",
            "started_on",
            "ended_on",
        ]

    def get_person(self, obj: NationalTeamStaff):
        return person_payload(obj.member)

    def create(self, validated_data):
        role = NationalTeamStaff(**validated_data, recorded_by=self.context.get("actor"))
        try:
            validate_staff(role)
        except DjangoValidationError as exc:
            raise _validation_error(exc) from exc
        role.save()
        return role

    def update(self, instance, validated_data):
        for key, value in validated_data.items():
            setattr(instance, key, value)
        try:
            validate_staff(instance)
        except DjangoValidationError as exc:
            raise _validation_error(exc) from exc
        instance.save()
        return instance


class SelectionSerializer(serializers.ModelSerializer):
    person = serializers.SerializerMethodField()
    squad_name = serializers.CharField(source="squad.name", read_only=True)
    squad_code = serializers.CharField(source="squad.code", read_only=True)
    season_year = serializers.IntegerField(source="season.year", read_only=True)
    club_id = serializers.IntegerField(source="member.club_id", read_only=True)
    club_name = serializers.SerializerMethodField()
    is_current = serializers.SerializerMethodField()
    ltf_level = serializers.SerializerMethodField()
    cosl = serializers.SerializerMethodField()
    support = serializers.SerializerMethodField()
    coaches = serializers.SerializerMethodField()

    class Meta:
        model = SquadSelection
        fields = [
            "id",
            "member",
            "person",
            "squad",
            "squad_name",
            "squad_code",
            "season",
            "season_year",
            "club_id",
            "club_name",
            "age_class",
            "weight_category",
            "is_captain",
            "started_on",
            "ended_on",
            "is_current",
            "ltf_level",
            "cosl",
            "support",
            "coaches",
        ]

    def get_person(self, obj: SquadSelection):
        return person_payload(obj.member)

    def get_club_name(self, obj: SquadSelection) -> str:
        if obj.member.club_id and obj.member.club is not None:
            return obj.member.club.name
        return ""

    def get_is_current(self, obj: SquadSelection) -> bool:
        day = self.context.get("on")
        if day is None:
            return True
        return obj.is_active_on(day)

    def _status(self, obj: SquadSelection, scheme: str):
        grouped = self.context.get("statuses") or {}
        return grouped.get((obj.member_id, scheme))

    def get_ltf_level(self, obj: SquadSelection):
        status = self._status(obj, AthleteStatus.Scheme.LTF_LEVEL)
        if status is None:
            return None
        return level_payload(status.cadre_level)

    def get_cosl(self, obj: SquadSelection):
        return cosl_payload(self._status(obj, AthleteStatus.Scheme.COSL))

    def get_support(self, obj: SquadSelection):
        status = self._status(obj, AthleteStatus.Scheme.SUPPORT)
        if status is None:
            return None
        return status.support_program

    def get_coaches(self, obj: SquadSelection):
        grouped = self.context.get("coaches") or {}
        names = list(grouped.get(obj.squad_id, []))
        names.extend(grouped.get(None, []))
        return names

    def create(self, validated_data):
        selection = SquadSelection(**validated_data, recorded_by=self.context.get("actor"))
        try:
            validate_selection(selection)
        except DjangoValidationError as exc:
            raise _validation_error(exc) from exc
        selection.save()
        return selection

    def update(self, instance, validated_data):
        for key, value in validated_data.items():
            setattr(instance, key, value)
        try:
            validate_selection(instance)
        except DjangoValidationError as exc:
            raise _validation_error(exc) from exc
        instance.save()
        return instance


def status_map(member_ids, day):
    if not member_ids:
        return {}
    rows = (
        AthleteStatus.objects.filter(member_id__in=member_ids)
        .filter(active_on(day))
        .select_related("cadre_level")
        .order_by("-started_on", "-id")
    )
    found = {}
    for row in rows:
        found.setdefault((row.member_id, row.scheme), row)
    return found


def coach_map(squad_ids, day):
    coach_functions = [
        NationalTeamStaff.Function.NATIONAL_COACH,
        NationalTeamStaff.Function.SPORTLYCEE_COACH,
    ]
    rows = (
        NationalTeamStaff.objects.filter(function__in=coach_functions)
        .filter(active_on(day))
        .filter(models_squad_q(squad_ids))
        .select_related("member")
        .order_by("function", "member__last_name", "member__first_name")
    )
    grouped: dict = {}
    for row in rows:
        grouped.setdefault(row.squad_id, []).append(
            {
                "id": row.id,
                "first_name": row.member.first_name,
                "last_name": row.member.last_name,
                "function": row.function,
            }
        )
    return grouped


def models_squad_q(squad_ids):
    from django.db.models import Q

    return Q(squad_id__in=list(squad_ids)) | Q(squad__isnull=True)
