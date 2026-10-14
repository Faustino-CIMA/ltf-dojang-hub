from datetime import datetime, timezone as dt_timezone

from django.test import SimpleTestCase
from django.utils import timezone

from licenses.print_filenames import content_disposition_attachment, print_job_pdf_filename, print_scope_slug


class PrintJobPdfFilenameTests(SimpleTestCase):
    def test_uses_club_slug_job_id_and_luxembourg_date(self):
        created_at = datetime(2026, 10, 14, 21, 30, tzinfo=dt_timezone.utc)
        self.assertEqual(
            print_job_pdf_filename(club_name="Red Kang", job_id=42, created_at=created_at),
            "license-cards_red-kang_42_2026-10-14.pdf",
        )

    def test_uses_luxembourg_calendar_date_across_midnight_utc(self):
        created_at = datetime(2026, 10, 14, 22, 30, tzinfo=dt_timezone.utc)
        self.assertEqual(timezone.localtime(created_at).date().isoformat(), "2026-10-15")
        self.assertEqual(
            print_job_pdf_filename(club_name="Print Club", job_id=7, created_at=created_at),
            "license-cards_print-club_7_2026-10-15.pdf",
        )

    def test_falls_back_to_ltf_when_club_name_is_blank(self):
        created_at = datetime(2026, 1, 1, 23, 30, tzinfo=dt_timezone.utc)
        self.assertEqual(print_scope_slug("   "), "LTF")
        self.assertEqual(
            print_job_pdf_filename(club_name="", job_id=3, created_at=created_at),
            "license-cards_LTF_3_2026-01-02.pdf",
        )

    def test_folds_accents_into_the_club_slug(self):
        self.assertEqual(print_scope_slug("Dojang Mëtt"), "dojang-mett")

    def test_content_disposition_is_an_attachment_with_the_filename(self):
        header = content_disposition_attachment("license-cards_print-club_7_2026-10-15.pdf")
        self.assertIn("attachment;", header)
        self.assertIn('filename="license-cards_print-club_7_2026-10-15.pdf"', header)
        self.assertIn("filename*=UTF-8''license-cards_print-club_7_2026-10-15.pdf", header)
