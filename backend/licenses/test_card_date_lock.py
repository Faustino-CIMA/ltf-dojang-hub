from datetime import date, datetime
from pathlib import Path

from django.test import SimpleTestCase
from django.utils import translation

from licenses import card_rendering
from licenses.card_rendering import format_ltf_date

# A birth date printed on the licence card. English month names, every language.
_CARD_BIRTH_DATES = (
    (date(2016, 1, 9), "09 Jan 2016"),
    (date(2016, 2, 9), "09 Feb 2016"),
    (date(2016, 3, 9), "09 Mar 2016"),
    (date(2016, 4, 9), "09 Apr 2016"),
    (date(2016, 5, 9), "09 May 2016"),
    (date(2016, 6, 9), "09 Jun 2016"),
    (date(2016, 7, 9), "09 Jul 2016"),
    (date(2016, 8, 9), "09 Aug 2016"),
    (date(2016, 9, 9), "09 Sep 2016"),
    (date(2016, 10, 9), "09 Oct 2016"),
    (date(2016, 11, 9), "09 Nov 2016"),
    (date(2016, 12, 9), "09 Dec 2016"),
    (date(2026, 11, 29), "29 Nov 2026"),
)


class LicenceCardDateLockTests(SimpleTestCase):
    def test_card_dates_stay_english_for_every_language(self):
        born = date(2026, 11, 29)
        for language in ("en", "fr", "de", "lb"):
            with translation.override(language):
                self.assertEqual(format_ltf_date(born), "29 Nov 2026")
        self.assertEqual(format_ltf_date(None), "")

    def test_a_birth_date_on_the_card_stays_english(self):
        for born, expected in _CARD_BIRTH_DATES:
            for language in ("en", "fr", "de", "lb"):
                with translation.override(language):
                    self.assertEqual(format_ltf_date(born), expected)
                    self.assertNotIn(".", format_ltf_date(born))
        stamped = datetime(2016, 11, 9, 23, 30)
        self.assertEqual(format_ltf_date(stamped), "09 Nov 2016")

    def test_the_card_birth_date_does_not_use_the_screen_formatter(self):
        source = Path(card_rendering.__file__).read_text(encoding="utf-8")
        self.assertIn("format_ltf_date(member.date_of_birth)", source)
        self.assertNotIn("format_display_date", source)
