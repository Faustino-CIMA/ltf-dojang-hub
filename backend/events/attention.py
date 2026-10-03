import calendar
from datetime import date, datetime, time, timedelta

from django.utils import timezone


def add_months(day: date, months: int) -> date:
    month_index = day.month - 1 + months
    year = day.year + month_index // 12
    month = month_index % 12 + 1
    last_day = calendar.monthrange(year, month)[1]
    return date(year, month, min(day.day, last_day))


def upcoming_bounds(now: datetime | None = None) -> tuple[datetime, datetime]:
    """Start of today through the end of the day two calendar months ahead."""
    current = now or timezone.now()
    if timezone.is_naive(current):
        current = timezone.make_aware(current, timezone.get_current_timezone())
    today = timezone.localtime(current).date()
    zone = timezone.get_current_timezone()
    start = timezone.make_aware(datetime.combine(today, time.min), zone)
    end_day = add_months(today, 2)
    end = timezone.make_aware(datetime.combine(end_day, time(23, 59, 59)), zone)
    return start, end


def snooze_until(now: datetime | None = None) -> datetime:
    current = now or timezone.now()
    return current + timedelta(days=1)
