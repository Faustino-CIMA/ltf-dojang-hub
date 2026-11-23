from datetime import date

from django.test import SimpleTestCase

from licenses.bank_recon import parse_date


class BankDateGoldenTests(SimpleTestCase):
    def test_the_golden_bank_date_table(self):
        rows = (
            ("2026-11-29", date(2026, 11, 29)),
            ("29.11.2026", date(2026, 11, 29)),
            ("29/11/2026", date(2026, 11, 29)),
            ("29-11-2026", date(2026, 11, 29)),
            ("2026/11/29", date(2026, 11, 29)),
            ("29.11.26", date(2026, 11, 29)),
            ("", None),
            ("not-a-date", None),
            ("03/14/2016", None),
        )
        for raw, expected in rows:
            self.assertEqual(parse_date(raw), expected, raw)
