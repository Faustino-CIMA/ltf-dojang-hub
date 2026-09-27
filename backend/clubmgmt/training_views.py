from __future__ import annotations

from datetime import date, datetime

from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from clubs.models import Club
from events.access import is_club_coach

from .access import can_manage_club_records, club_mgmt_entitled, is_ltf_manager
from .training import (
    coach_hour_report,
    generate_sessions,
    holiday_payload,
    roll_payload,
    serialize_series,
    serialize_session,
    sessions_between,
    set_attendance,
    week_bounds,
)
from .training_models import SchoolHoliday, TrainingSeries, TrainingSession, TrainingSettings


def _club(request) -> Club:
    return Club.objects.get(pk=_require_training_club(request))


def _require_training_club(request) -> int:
    raw = request.query_params.get("club") or request.data.get("club")
    try:
        club_id = int(raw)
    except (TypeError, ValueError) as error:
        raise ValidationError({"club": "Choose a club."}) from error
    user = request.user
    if can_manage_club_records(user, club_id) or (
        club_mgmt_entitled() and (is_ltf_manager(user) or is_club_coach(user, club_id))
    ):
        return club_id
    raise PermissionDenied(detail="This module is not available.")


def _require_admin(request) -> int:
    club_id = _require_training_club(request)
    if can_manage_club_records(request.user, club_id) or is_ltf_manager(request.user):
        return club_id
    raise PermissionDenied(detail="Only a club admin can change the timetable.")


def _parse_time(value: str):
    raw = str(value or "")[:5]
    try:
        return datetime.strptime(raw, "%H:%M").time()
    except (TypeError, ValueError) as error:
        raise ValidationError({"detail": "Use a time like 18:00."}) from error


def _require_period(start, end) -> None:
    if end <= start:
        raise ValidationError({"detail": "The class must end after it starts."})


def _parse_date(value: str, field: str) -> date:
    try:
        return date.fromisoformat(str(value))
    except (TypeError, ValueError) as error:
        raise ValidationError({field: "Enter a date."}) from error


class TrainingSeriesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        club = _club(request)
        rows = TrainingSeries.objects.filter(club=club).prefetch_related("coaches", "regulars")
        return Response([serialize_series(row) for row in rows])

    def post(self, request):
        club = Club.objects.get(pk=_require_admin(request))
        series = TrainingSeries(club=club)
        _apply_series(series, request.data)
        series.save()
        _set_people(series, request.data)
        generate_sessions(series)
        return Response(serialize_series(series), status=201)


class TrainingSeriesDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, series_id: int):
        club = Club.objects.get(pk=_require_admin(request))
        series = TrainingSeries.objects.filter(club=club, id=series_id).first()
        if series is None:
            raise ValidationError({"detail": "Class not found."})
        _apply_series(series, request.data, partial=True)
        series.save()
        _set_people(series, request.data)
        if request.data.get("generate"):
            generate_sessions(series)
        return Response(serialize_series(series))

    def delete(self, request, series_id: int):
        club = Club.objects.get(pk=_require_admin(request))
        series = TrainingSeries.objects.filter(club=club, id=series_id).first()
        if series is None:
            raise ValidationError({"detail": "Class not found."})
        series.delete()
        return Response(status=204)


class TrainingGenerateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, series_id: int):
        club = Club.objects.get(pk=_require_admin(request))
        series = TrainingSeries.objects.filter(club=club, id=series_id).first()
        if series is None:
            raise ValidationError({"detail": "Class not found."})
        created = generate_sessions(series)
        return Response({"created": created})


class TrainingSessionView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        club = _club(request)
        if request.query_params.get("week") == "1":
            start, end = week_bounds()
        else:
            start = _parse_date(request.query_params.get("from") or timezone.localdate().isoformat(), "from")
            end = _parse_date(request.query_params.get("to") or start.isoformat(), "to")
        return Response([serialize_session(row) for row in sessions_between(club, start, end)])

    def post(self, request):
        club = Club.objects.get(pk=_require_admin(request))
        audience = str(request.data.get("audience") or "")
        if audience not in TrainingSeries.Audience.values:
            raise ValidationError({"audience": "Choose a kind of class."})
        start_time = _parse_time(request.data.get("start_time"))
        end_time = _parse_time(request.data.get("end_time"))
        _require_period(start_time, end_time)
        session = TrainingSession.objects.create(
            club=club,
            name=str(request.data.get("name") or "Training").strip() or "Training",
            audience=audience,
            held_on=_parse_date(request.data.get("held_on"), "held_on"),
            start_time=start_time,
            end_time=end_time,
            notes=str(request.data.get("notes") or ""),
        )
        _set_session_coaches(session, request.data.get("coach_ids"), club)
        return Response(serialize_session(session), status=201)


class TrainingSessionDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, session_id: int):
        session = _session(request, session_id)
        return Response(roll_payload(session))

    def patch(self, request, session_id: int):
        session = _session(request, session_id, admin=True)
        data = request.data
        if data.get("status") in TrainingSession.Status.values:
            session.status = data["status"]
        if "name" in data:
            session.name = str(data.get("name") or session.name)
        if "notes" in data:
            session.notes = str(data.get("notes") or "")
        if data.get("start_time"):
            session.start_time = _parse_time(data.get("start_time"))
        if data.get("end_time"):
            session.end_time = _parse_time(data.get("end_time"))
        _require_period(session.start_time, session.end_time)
        session.save()
        if "coach_ids" in data:
            _set_session_coaches(session, data.get("coach_ids"), session.club)
        return Response(serialize_session(session))


class TrainingAttendanceView(APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request, session_id: int):
        session = _session(request, session_id)
        if session.status == TrainingSession.Status.CANCELLED:
            raise ValidationError({"detail": "This class is cancelled."})
        if "coach_ids" in request.data:
            _set_session_coaches(session, request.data.get("coach_ids"), session.club)
        ids = []
        for item in request.data.get("member_ids") or []:
            try:
                ids.append(int(item))
            except (TypeError, ValueError):
                continue
        try:
            set_attendance(session, ids, request.user)
        except ValueError as error:
            raise ValidationError({"detail": str(error)}) from error
        return Response(roll_payload(session))


class TrainingHolidayView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        _require_training_club(request)
        year = int(request.query_params.get("year") or timezone.localdate().year)
        return Response(holiday_payload(year))

    def post(self, request):
        _require_admin(request)
        starts_on = _parse_date(request.data.get("starts_on"), "starts_on")
        ends_on = _parse_date(request.data.get("ends_on"), "ends_on")
        if ends_on < starts_on:
            raise ValidationError({"detail": "The holiday must end on or after it starts."})
        row = SchoolHoliday.objects.create(
            school_year=int(request.data.get("school_year") or timezone.localdate().year),
            name=str(request.data.get("name") or "Holiday").strip() or "Holiday",
            starts_on=starts_on,
            ends_on=ends_on,
        )
        return Response(
            {
                "id": row.id,
                "school_year": row.school_year,
                "name": row.name,
                "starts_on": row.starts_on.isoformat(),
                "ends_on": row.ends_on.isoformat(),
            },
            status=201,
        )


class TrainingHolidayDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, holiday_id: int):
        _require_admin(request)
        SchoolHoliday.objects.filter(id=holiday_id).delete()
        return Response(status=204)


class TrainingPayView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        club = _club(request)
        year = int(request.query_params.get("year") or timezone.localdate().year)
        return Response(coach_hour_report(club, year))

    def patch(self, request):
        club = Club.objects.get(pk=_require_admin(request))
        settings, _created = TrainingSettings.objects.get_or_create(club=club)
        if "pay_frequency" in request.data:
            frequency = str(request.data.get("pay_frequency") or "")
            if frequency not in TrainingSettings.PayFrequency.values:
                raise ValidationError({"detail": "Choose monthly, quarterly, or twice a year."})
            settings.pay_frequency = frequency
        for field in (
            "payday_day",
            "quarter_anchor_month",
            "first_payday_month",
            "first_payday_day",
            "second_payday_month",
            "second_payday_day",
        ):
            if field in request.data:
                try:
                    setattr(settings, field, int(request.data.get(field)))
                except (TypeError, ValueError) as error:
                    raise ValidationError({"detail": "Enter a whole number for the payday."}) from error
        for month in (settings.first_payday_month, settings.second_payday_month, settings.quarter_anchor_month):
            if month < 1 or month > 12:
                raise ValidationError({"detail": "Enter a payday month from 1 to 12."})
        for day in (settings.first_payday_day, settings.second_payday_day, settings.payday_day):
            if day < 1 or day > 31:
                raise ValidationError({"detail": "Enter a payday day from 1 to 31."})
        settings.save()
        year = int(request.query_params.get("year") or timezone.localdate().year)
        return Response(coach_hour_report(club, year))


def _session(request, session_id: int, *, admin: bool = False) -> TrainingSession:
    club_id = _require_admin(request) if admin else _require_training_club(request)
    session = TrainingSession.objects.filter(club_id=club_id, id=session_id).first()
    if session is None:
        raise ValidationError({"detail": "Session not found."})
    return session


def _apply_series(series: TrainingSeries, data, *, partial: bool = False) -> None:
    if not partial or "name" in data:
        name = str(data.get("name") or "").strip()
        if not name:
            raise ValidationError({"name": "Name the class."})
        series.name = name
    if not partial or "audience" in data:
        audience = str(data.get("audience") or series.audience or "")
        if audience not in TrainingSeries.Audience.values:
            raise ValidationError({"audience": "Choose a kind of class."})
        series.audience = audience
    if not partial or "weekday" in data:
        weekday = int(data.get("weekday"))
        if weekday < 0 or weekday > 6:
            raise ValidationError({"weekday": "Choose a day."})
        series.weekday = weekday
    if not partial or "start_time" in data:
        series.start_time = _parse_time(data.get("start_time"))
    if not partial or "end_time" in data:
        series.end_time = _parse_time(data.get("end_time"))
    if not partial or "valid_from" in data:
        series.valid_from = _parse_date(data.get("valid_from"), "valid_from")
    if not partial or "valid_until" in data:
        series.valid_until = _parse_date(data.get("valid_until"), "valid_until")
    if "skip_public_holidays" in data:
        series.skip_public_holidays = bool(data.get("skip_public_holidays"))
    if "skip_school_holidays" in data:
        series.skip_school_holidays = bool(data.get("skip_school_holidays"))
    if "counts_for_under_16" in data:
        series.counts_for_under_16 = bool(data.get("counts_for_under_16"))
    elif not partial:
        series.counts_for_under_16 = series.audience == TrainingSeries.Audience.KIDS
    if "place" in data:
        series.place = str(data.get("place") or "").strip()[:120]
    if "active" in data:
        series.active = bool(data.get("active"))
    if series.end_time <= series.start_time:
        raise ValidationError({"detail": "The class must end after it starts."})
    if series.valid_until < series.valid_from:
        raise ValidationError({"detail": "The season must end on or after it starts."})


def _id_list(value) -> list[int]:
    ids = []
    for item in value or []:
        try:
            ids.append(int(item))
        except (TypeError, ValueError):
            continue
    return ids


def _set_people(series: TrainingSeries, data) -> None:
    if "coach_ids" in data:
        allowed = set(series.club.trainers.filter(id__in=_id_list(data.get("coach_ids"))).values_list("id", flat=True))
        series.coaches.set(allowed)
    if "regular_ids" in data:
        members = series.club.members.filter(is_active=True, id__in=_id_list(data.get("regular_ids")))
        series.regulars.set(members)


def _set_session_coaches(session: TrainingSession, raw, club) -> None:
    allowed = set(club.trainers.filter(id__in=_id_list(raw)).values_list("id", flat=True))
    session.coaches.set(allowed)
