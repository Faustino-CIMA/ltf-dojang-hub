"""Validation for national-team dates, squads, and status schemes.

Dated rows use the committee rule: the row applies while start <= day < end.
"""

from __future__ import annotations

from datetime import date, timedelta

from django.core.exceptions import ValidationError
from django.db.models import Q
from django.utils import timezone
from django.utils.text import slugify

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


def reference_day(season: Season, today: date | None = None) -> date:
    today = today or timezone.localdate()
    if season.starts_on <= today <= season.ends_on:
        return today
    return season.ends_on


def _overlaps(started_on: date, ended_on: date | None):
    """Other rows that overlap [started_on, ended_on)."""
    window = Q(ended_on__isnull=True) | Q(ended_on__gt=started_on)
    if ended_on is not None:
        window &= Q(started_on__lt=ended_on)
    return window


def _check_dates(started_on: date | None, ended_on: date | None) -> None:
    if started_on is None:
        raise ValidationError({"started_on": "start_required"})
    if ended_on is not None and ended_on < started_on:
        raise ValidationError({"ended_on": "end_before_start"})


def validate_selection(selection: SquadSelection) -> None:
    _check_dates(selection.started_on, selection.ended_on)
    member = selection.member
    if member is None or member.club_id is None:
        raise ValidationError({"member": "club_member_required"})
    if not str(selection.weight_category or "").strip():
        raise ValidationError({"weight_category": "weight_required"})
    season = selection.season
    if season is None:
        raise ValidationError({"season": "season_required"})
    if selection.started_on < season.starts_on or selection.started_on > season.ends_on:
        raise ValidationError({"started_on": "outside_season"})
    if selection.ended_on is not None:
        latest = season.ends_on + timedelta(days=1)
        if selection.ended_on > latest:
            raise ValidationError({"ended_on": "outside_season"})
    same_squad = SquadSelection.objects.filter(
        member_id=selection.member_id,
        season_id=selection.season_id,
        squad_id=selection.squad_id,
    )
    if selection.pk:
        same_squad = same_squad.exclude(pk=selection.pk)
    if same_squad.filter(_overlaps(selection.started_on, selection.ended_on)).exists():
        raise ValidationError({"squad": "same_squad_overlap"})
    if NationalTeamSettings.load().forbid_overlapping_squads:
        others = SquadSelection.objects.filter(
            member_id=selection.member_id,
            season_id=selection.season_id,
        )
        if selection.pk:
            others = others.exclude(pk=selection.pk)
        if others.filter(_overlaps(selection.started_on, selection.ended_on)).exists():
            raise ValidationError({"squad": "squad_overlap_forbidden"})


def validate_status(status: AthleteStatus) -> None:
    _check_dates(status.started_on, status.ended_on)
    if status.scheme == AthleteStatus.Scheme.LTF_LEVEL:
        level = status.cadre_level
        if level is None:
            raise ValidationError({"cadre_level": "level_required"})
        if not level.is_active and not _level_was_already_used(status):
            raise ValidationError({"cadre_level": "level_inactive"})
        status.cosl_pathway = ""
        status.cosl_rank = ""
        status.cosl_project = ""
        status.support_program = ""
    elif status.scheme == AthleteStatus.Scheme.COSL:
        if not status.cosl_pathway or not status.cosl_rank or not status.cosl_project:
            raise ValidationError({"scheme": "cosl_incomplete"})
        status.cadre_level = None
        status.support_program = ""
    elif status.scheme == AthleteStatus.Scheme.SUPPORT:
        if not status.support_program:
            raise ValidationError({"support_program": "support_required"})
        status.cadre_level = None
        status.cosl_pathway = ""
        status.cosl_rank = ""
        status.cosl_project = ""
    else:
        raise ValidationError({"scheme": "invalid_scheme"})
    others = AthleteStatus.objects.filter(member_id=status.member_id, scheme=status.scheme)
    if status.pk:
        others = others.exclude(pk=status.pk)
    if others.filter(_overlaps(status.started_on, status.ended_on)).exists():
        raise ValidationError({"started_on": "status_overlap"})


def _level_was_already_used(status: AthleteStatus) -> bool:
    if not status.pk or status.cadre_level_id is None:
        return False
    previous = AthleteStatus.objects.filter(pk=status.pk).values_list("cadre_level_id", flat=True).first()
    return previous == status.cadre_level_id


def validate_staff(role: NationalTeamStaff) -> None:
    _check_dates(role.started_on, role.ended_on)
    if role.member_id is None:
        raise ValidationError({"member": "staff_person_required"})
    if role.function not in NationalTeamStaff.Function.values:
        raise ValidationError({"function": "invalid_function"})
    others = NationalTeamStaff.objects.filter(
        member_id=role.member_id,
        function=role.function,
        squad_id=role.squad_id,
    )
    if role.pk:
        others = others.exclude(pk=role.pk)
    if others.filter(_overlaps(role.started_on, role.ended_on)).exists():
        raise ValidationError({"function": "staff_overlap"})


def validate_squad(squad: Squad) -> None:
    if squad.discipline != Squad.Discipline.KYORUGI:
        raise ValidationError({"discipline": "kyorugi_only"})
    if not str(squad.name or "").strip():
        raise ValidationError({"name": "name_required"})
    if not squad.code:
        base = slugify(squad.name) or "squad"
        code = base
        suffix = 2
        while Squad.objects.filter(code=code).exclude(pk=squad.pk).exists():
            code = f"{base}-{suffix}"
            suffix += 1
        squad.code = code


def member_visible_to(user, member: Member) -> bool:
    if not user or not user.is_authenticated:
        return False
    if user.role in ("ltf_admin", "ltf_finance"):
        return True
    if user.role in ("club_admin", "coach") and member.club_id:
        return member.club.admins.filter(pk=user.pk).exists()
    return False
