from openpyxl import Workbook, load_workbook
import io

from django.test import SimpleTestCase

from members.xlsx_layout import write_sheet


class XlsxLayoutTests(SimpleTestCase):
    def test_columns_are_sized_and_the_usual_name_is_absent(self):
        book = Workbook()
        book.remove(book.active)
        write_sheet(
            book,
            "members",
            ("last_name", "first_name", "date_of_birth", "ltf_licenseid", "number", "weight_kg"),
            ("Last name", "First name", "Date of birth", "LTF license ID", "Phone", "Weight"),
            [
                {
                    "last_name": "EXAMPLE",
                    "first_name": "Ada",
                    "date_of_birth": "1990-01-02",
                    "ltf_licenseid": "00123",
                    "number": "+352621000000",
                    "weight_kg": "70.50",
                }
            ],
        )
        payload = io.BytesIO()
        book.save(payload)
        saved = load_workbook(payload)
        sheet = saved["members"]
        values = [cell for row in sheet.iter_rows(values_only=True) for cell in row]
        self.assertNotIn("usual_name", values)
        self.assertGreater(sheet.column_dimensions["A"].width or 0, 0)
        self.assertGreater(sheet.column_dimensions["F"].width or 0, 0)
        self.assertLessEqual(sheet.column_dimensions["A"].width, 42)
        self.assertEqual(sheet.freeze_panes, "A3")
        self.assertTrue(sheet.cell(1, 1).font.bold)
        self.assertEqual(sheet.cell(1, 1).fill.fgColor.rgb[-6:], "E8EAED")
        self.assertEqual(sheet.cell(3, 3).number_format, "YYYY-MM-DD")
        self.assertEqual(sheet.cell(3, 4).number_format, "@")
        self.assertEqual(sheet.cell(3, 4).value, "00123")
        self.assertEqual(sheet.cell(3, 5).number_format, "@")
        self.assertEqual(str(sheet.cell(3, 5).value), "+352621000000")
        self.assertEqual(sheet.cell(3, 6).number_format, "0.00")
