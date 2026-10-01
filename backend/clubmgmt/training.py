from __future__ import annotations

from datetime import date, datetime, timedelta
from decimal import Decimal

from django.db.models import Prefetch
from django.utils import timezone

from members.models import Member

from .holidays import is_public_holiday, is_school_holiday
from .training_models import (
    PublicHoliday,
    SchoolHoliday,
    TrainingAttendance,
    TrainingSeries,
    TrainingSession,
    TrainingSettings,
)


def session_hours(session: TrainingSession) -> Decimal:
    start = datetime.combine(session.held_on, session.start_time)
    end = datetime.combine(session.held_on, session.end_time)
    minutes = (end - start).total_seconds() / 60
    if minutes <= 0:
        return Decimal("0")
    return (Decimal(minutes) / Decimal(60)).quantize(Decimal("0.01"))


def series_skips(series: TrainingSeries, day: date) -> bool:
    if series.skip_public_holidays and is_public_holiday(day):
        return True
    if series.skip_school_holidays and is_school_holiday(day):
        return True
    return False


def generate_sessions(series: TrainingSeries) -> int:
    if not series.active or series.end_time <= series.start_time or series.valid_until < series.valid_from:
        return 0
    created = 0
    valid_days = []
    day = series.valid_from
    while day <= series.valid_until:
        if day.weekday() == series.weekday and not series_skips(series, day):
            valid_days.append(day)
            session, was_created = TrainingSession.objects.get_or_create(
                series=series,
                held_on=day,
                defaults={
                    "club": series.club,
                    "name": series.name,
                    "audience": series.audience,
                    "start_time": series.start_time,
                    "end_time": series.end_time,
                },
            )
            if was_created:
                session.coaches.set(series.coaches.all())
                created += 1
            elif session.status == TrainingSession.Status.SCHEDULED and not session.attendances.exists():
                session.name = series.name
                session.audience = series.audience
                session.start_time = series.start_time
                session.end_time = series.end_time
                session.save(update_fields=["name", "audience", "start_time", "end_time", "updated_at"])
                session.coaches.set(series.coaches.all())
        day += timedelta(days=1)
    stale = TrainingSession.objects.filter(series=series, status=TrainingSession.Status.SCHEDULED).exclude(held_on__in=valid_days)
    stale.filter(attendances__isnull=True).delete()
    return created


def age_on(born: date | None, on: date) -> int | None:
    if born is None:
        return None
    return on.year - born.year - ((on.month, on.day) < (born.month, born.day))


def suggested_member_ids(session: TrainingSession) -> list[int]:
    if session.series_id is None:
        return []
    previous = (
        TrainingSession.objects.filter(
            series_id=session.series_id,
            status=TrainingSession.Status.HELD,
            held_on__lt=session.held_on,
        )
        .order_by("-held_on", "-id")
        .first()
    )
    if previous is not None:
        return list(previous.attendances.values_list("member_id", flat=True))
    return list(session.series.regulars.values_list("id", flat=True))


def set_attendance(session: TrainingSession, member_ids: list[int], actor) -> None:
    if session.status == TrainingSession.Status.CANCELLED:
        raise ValueError("This class is cancelled.")
    allowed = set(
        Member.objects.filter(club_id=session.club_id, is_active=True, id__in=member_ids).values_list("id", flat=True)
    )
    session.attendances.exclude(member_id__in=allowed).delete()
    existing = set(session.attendances.values_list("member_id", flat=True))
    TrainingAttendance.objects.bulk_create(
        [
            TrainingAttendance(session=session, member_id=member_id, recorded_by=actor)
            for member_id in allowed
            if member_id not in existing
        ]
    )
    if session.status == TrainingSession.Status.SCHEDULED:
        session.status = TrainingSession.Status.HELD
        session.save(update_fields=["status", "updated_at"])


def _payday(year: int, month: int, day: int) -> date:
    while True:
        try:
            return date(year, month, day)
        except ValueError:
            day -= 1


def _quarter_months(anchor: int) -> list[int]:
    months = []
    month = anchor
    for _ in range(4):
        months.append(month)
        month += 3
        if month > 12:
            month -= 12
    return sorted(months)


def payday_dates(settings: TrainingSettings, year: int) -> list[date]:
    frequency = settings.pay_frequency
    if frequency == TrainingSettings.PayFrequency.MONTHLY:
        return [_payday(year, month, settings.payday_day) for month in range(1, 13)]
    if frequency == TrainingSettings.PayFrequency.QUARTERLY:
        return [_payday(year, month, settings.payday_day) for month in _quarter_months(settings.quarter_anchor_month)]
    return sorted(
        {
            _payday(year, settings.first_payday_month, settings.first_payday_day),
            _payday(year, settings.second_payday_month, settings.second_payday_day),
        }
    )


def pay_periods(settings: TrainingSettings, year: int) -> list[dict]:
    ends = payday_dates(settings, year)
    previous = payday_dates(settings, year - 1)[-1]
    labels = ["first", "second"] if settings.pay_frequency == TrainingSettings.PayFrequency.TWICE and len(ends) == 2 else None
    periods = []
    start_after = previous
    for index, end in enumerate(ends):
        periods.append(
            {
                "label": labels[index] if labels else end.isoformat(),
                "starts_on": start_after + timedelta(days=1),
                "ends_on": end,
            }
        )
        start_after = end
    return periods


def coach_hour_report(club, year: int) -> dict:
    settings, _created = TrainingSettings.objects.get_or_create(club=club)
    periods = []
    sessions = TrainingSession.objects.filter(club=club, status=TrainingSession.Status.HELD).prefetch_related("coaches")
    for period in pay_periods(settings, year):
        totals: dict[int, Decimal] = {}
        names: dict[int, str] = {}
        for session in sessions:
            if not (period["starts_on"] <= session.held_on <= period["ends_on"]):
                continue
            hours = session_hours(session)
            for coach in session.coaches.all():
                totals[coach.id] = totals.get(coach.id, Decimal("0")) + hours
                names[coach.id] = f"{coach.first_name} {coach.last_name}".strip() or coach.username
        periods.append(
            {
                "label": period["label"],
                "starts_on": period["starts_on"].isoformat(),
                "ends_on": period["ends_on"].isoformat(),
                "coaches": [
                    {"user_id": user_id, "name": names[user_id], "hours": f"{hours:.2f}"}
                    for user_id, hours in sorted(totals.items(), key=lambda item: names[item[0]].lower())
                ],
            }
        )
    return {
        "pay_frequency": settings.pay_frequency,
        "payday_day": settings.payday_day,
        "quarter_anchor_month": settings.quarter_anchor_month,
        "first_payday_month": settings.first_payday_month,
        "first_payday_day": settings.first_payday_day,
        "second_payday_month": settings.second_payday_month,
        "second_payday_day": settings.second_payday_day,
        "periods": periods,
    }


def member_training_hours(member: Member, *, since: date | None = None) -> dict:
    rows = TrainingAttendance.objects.filter(
        member=member,
        session__status=TrainingSession.Status.HELD,
        session__club_id=member.club_id,
    ).select_related("session")
    if since is not None:
        rows = rows.filter(session__held_on__gte=since)
    totals = {key: Decimal("0") for key, _label in TrainingSeries.Audience.choices}
    for row in rows:
        totals[row.session.audience] += session_hours(row.session)
    return {
        "total": f"{sum(totals.values(), Decimal('0')):.2f}",
        "by_audience": {key: f"{value:.2f}" for key, value in totals.items()},
    }


def serialize_series(series: TrainingSeries) -> dict:
    return {
        "id": series.id,
        "name": series.name,
        "audience": series.audience,
        "weekday": series.weekday,
        "start_time": series.start_time.strftime("%H:%M"),
        "end_time": series.end_time.strftime("%H:%M"),
        "valid_from": series.valid_from.isoformat(),
        "valid_until": series.valid_until.isoformat(),
        "skip_public_holidays": series.skip_public_holidays,
        "skip_school_holidays": series.skip_school_holidays,
        "counts_for_under_16": series.counts_for_under_16,
        "place": series.place,
        "active": series.active,
        "coach_ids": list(series.coaches.values_list("id", flat=True)),
        "coach_names": [
            f"{coach.first_name} {coach.last_name}".strip() or coach.username for coach in series.coaches.all()
        ],
        "regular_ids": list(series.regulars.values_list("id", flat=True)),
    }


def serialize_session(session: TrainingSession) -> dict:
    return {
        "id": session.id,
        "series_id": session.series_id,
        "name": session.name,
        "audience": session.audience,
        "held_on": session.held_on.isoformat(),
        "start_time": session.start_time.strftime("%H:%M"),
        "end_time": session.end_time.strftime("%H:%M"),
        "status": session.status,
        "hours": f"{session_hours(session):.2f}",
        "coach_ids": list(session.coaches.values_list("id", flat=True)),
        "coach_names": [
            f"{coach.first_name} {coach.last_name}".strip() or coach.username for coach in session.coaches.all()
        ],
        "present_ids": list(session.attendances.values_list("member_id", flat=True)),
        "notes": session.notes,
    }


def roll_payload(session: TrainingSession) -> dict:
    members = Member.objects.filter(club_id=session.club_id, is_active=True).order_by("last_name", "first_name")
    trainers = session.club.trainers.all().order_by("last_name", "first_name", "id")
    return {
        "session": serialize_session(session),
        "suggested_ids": suggested_member_ids(session),
        "coaches": [
            {
                "id": coach.id,
                "name": f"{coach.first_name} {coach.last_name}".strip() or coach.username,
            }
            for coach in trainers
        ],
        "members": [
            {
                "id": member.id,
                "name": f"{member.first_name} {member.last_name}".strip(),
                "date_of_birth": member.date_of_birth.isoformat() if member.date_of_birth else "",
                "age": age_on(member.date_of_birth, session.held_on),
            }
            for member in members
        ],
    }


def holiday_payload(year: int) -> dict:
    from .holidays import ensure_public_holidays, ensure_school_holidays

    ensure_public_holidays(year, year + 1)
    ensure_school_holidays()
    start = date(year, 1, 1)
    end = date(year, 12, 31)
    public = [
        {"date": row.date.isoformat(), "name": row.name}
        for row in PublicHoliday.objects.filter(date__gte=start, date__lte=end)
    ]
    school = [
        {
            "id": row.id,
            "school_year": row.school_year,
            "name": row.name,
            "starts_on": row.starts_on.isoformat(),
            "ends_on": row.ends_on.isoformat(),
        }
        for row in SchoolHoliday.objects.filter(starts_on__lte=end, ends_on__gte=start).order_by("starts_on")
    ]
    return {"public": public, "school": school}


def sessions_between(club, start: date, end: date):
    return (
        TrainingSession.objects.filter(club=club, held_on__gte=start, held_on__lte=end)
        .prefetch_related(Prefetch("coaches"), Prefetch("attendances"))
        .order_by("held_on", "start_time")
    )


def week_bounds(day: date | None = None) -> tuple[date, date]:
    today = day or timezone.localdate()
    start = today - timedelta(days=today.weekday())
    return start, start + timedelta(days=6)
