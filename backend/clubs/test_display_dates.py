from datetime import date, datetime
from zoneinfo import ZoneInfo

from django.test import SimpleTestCase

from clubs.display_dates import format_display_date, format_display_datetime


class DisplayDateTests(SimpleTestCase):
    def test_a_calendar_day_is_day_month_year(self):
        self.assertEqual(format_display_date(date(2026, 11, 29)), "29.11.2026")
        self.assertEqual(format_display_date(None), "")

    def test_a_timestamp_uses_luxembourg_time(self):
        winter = datetime(2026, 11, 29, 13, 5, tzinfo=ZoneInfo("UTC"))
        summer = datetime(2026, 7, 29, 12, 5, tzinfo=ZoneInfo("UTC"))
        self.assertEqual(format_display_datetime(winter), "29.11.2026 14:05")
        self.assertEqual(format_display_datetime(summer), "29.07.2026 14:05")
        self.assertEqual(format_display_date(winter), "29.11.2026")

    def test_the_golden_screen_table(self):
        rows = (
            (date(2026, 11, 29), None, "29.11.2026"),
            (datetime(2026, 11, 29, 13, 5, tzinfo=ZoneInfo("UTC")), "29.11.2026 14:05", "29.11.2026"),
            (datetime(2026, 7, 29, 12, 5, tzinfo=ZoneInfo("UTC")), "29.07.2026 14:05", "29.07.2026"),
        )
        for value, when, day in rows:
            self.assertEqual(format_display_date(value), day)
            if when is not None:
                self.assertEqual(format_display_datetime(value), when)
