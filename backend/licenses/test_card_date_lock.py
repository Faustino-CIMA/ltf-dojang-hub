from datetime import date

from django.test import SimpleTestCase
from django.utils import translation

from licenses.card_rendering import format_ltf_date


class LicenceCardDateLockTests(SimpleTestCase):
    def test_card_dates_stay_english_for_every_language(self):
        born = date(2026, 11, 29)
        for language in ("en", "fr", "de", "lb"):
            with translation.override(language):
                self.assertEqual(format_ltf_date(born), "29 Nov 2026")
        self.assertEqual(format_ltf_date(None), "")
