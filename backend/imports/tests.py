from datetime import date

from django.test import SimpleTestCase

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
