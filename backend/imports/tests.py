from datetime import date

from django.test import SimpleTestCase

from imports.gender import parse_import_gender
from imports.mapping import suggest_member_mapping
from imports.views import excel_serial_to_date, parse_date


class SuggestMemberMappingTests(SimpleTestCase):
    def test_wt_license_header_variants_map_to_member_wt_id(self):
        for header in ("WT license ID", "WT License Id", "wt_license_id", "WT-Lizenz-ID"):
            mapping = suggest_member_mapping(["Preferred First Name", header])
            self.assertEqual(mapping.get("wt_licenseid"), header)
            self.assertNotIn("ltf_licenseid", mapping)

    def test_member_id_column_stays_on_ltf_license(self):
        mapping = suggest_member_mapping(["Member ID", "WT-Lizenz-ID"])
        self.assertEqual(mapping["ltf_licenseid"], "Member ID")
        self.assertEqual(mapping["wt_licenseid"], "WT-Lizenz-ID")


class ParseImportGenderTests(SimpleTestCase):
    def test_luxembourg_values_map_and_unknown_stays_blank(self):
        self.assertEqual(parse_import_gender("H"), "M")
        self.assertEqual(parse_import_gender("Homme"), "M")
        self.assertEqual(parse_import_gender("Männlich"), "M")
        self.assertEqual(parse_import_gender("Femme"), "F")
        self.assertEqual(parse_import_gender("W"), "F")
        self.assertEqual(parse_import_gender(""), "")
        self.assertEqual(parse_import_gender("Robot"), "")


class ParseDateTests(SimpleTestCase):
    def test_dotted_day_first(self):
        errors = []
        self.assertEqual(
            parse_date("14.03.2015", errors, "date_of_birth", "DD.MM.YYYY"),
            date(2015, 3, 14),
        )
        self.assertEqual(errors, [])

    def test_month_first_slashes(self):
        errors = []
        self.assertEqual(
            parse_date("03/14/2015", errors, "date_of_birth", "MM/DD/YYYY"),
            date(2015, 3, 14),
        )
        self.assertEqual(errors, [])

    def test_excel_serial_uses_1900_date_system(self):
        errors = []
        self.assertEqual(excel_serial_to_date("36526"), date(2000, 1, 1))
        self.assertEqual(
            parse_date("36526.0", errors, "date_of_birth", "EXCEL"),
            date(2000, 1, 1),
        )
        self.assertEqual(errors, [])

    def test_excel_serial_rejects_text(self):
        errors = []
        self.assertIsNone(parse_date("14.03.2015", errors, "date_of_birth", "EXCEL"))
        self.assertIn("date_of_birth must match EXCEL", errors)

    def test_the_golden_member_import_table(self):
        rows = (
            ("03/14/2016", "MM/DD/YYYY", date(2016, 3, 14)),
            ("31/12/2026", "DD/MM/YYYY", date(2026, 12, 31)),
            ("2026-11-29", "YYYY-MM-DD", date(2026, 11, 29)),
            ("29.11.2026", "DD.MM.YYYY", date(2026, 11, 29)),
            ("29-11-2026", "DD-MM-YYYY", date(2026, 11, 29)),
        )
        for raw, date_format, expected in rows:
            errors = []
            self.assertEqual(parse_date(raw, errors, "date_of_birth", date_format), expected, raw)
            self.assertEqual(errors, [])
        errors = []
        self.assertIsNone(parse_date("31/02/2026", errors, "date_of_birth", "DD/MM/YYYY"))
        self.assertIn("date_of_birth must match DD/MM/YYYY", errors)
