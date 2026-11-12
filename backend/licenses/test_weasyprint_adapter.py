from unittest.mock import patch

from django.test import SimpleTestCase

from licenses.weasyprint_adapter import clear_engine_cache, write_pdf


class WeasyPrintAdapterTests(SimpleTestCase):
    def tearDown(self):
        clear_engine_cache()

    def test_missing_engine_returns_none(self):
        clear_engine_cache()
        with patch("licenses.weasyprint_adapter.load_html", return_value=None):
            self.assertIsNone(write_pdf("<p>Hello</p>", base_url="/tmp"))

    def test_omitted_base_url_is_not_passed_through(self):
        seen = {}

        class HTML:
            def __init__(self, string, base_url=_sentinel):
                seen["string"] = string
                seen["base_url"] = base_url

            def write_pdf(self):
                return b"%PDF-fake"

        clear_engine_cache()
        with patch("licenses.weasyprint_adapter.load_html", return_value=HTML):
            pdf = write_pdf("<p>Hello</p>")
        self.assertEqual(pdf, b"%PDF-fake")
        self.assertEqual(seen["string"], "<p>Hello</p>")
        self.assertIs(seen["base_url"], _sentinel)

    def test_base_url_is_forwarded(self):
        seen = {}

        class HTML:
            def __init__(self, string, base_url=None):
                seen["base_url"] = base_url

            def write_pdf(self):
                return b"%PDF-fake"

        clear_engine_cache()
        with patch("licenses.weasyprint_adapter.load_html", return_value=HTML):
            write_pdf("<p>Hello</p>", base_url="/docs")
        self.assertEqual(seen["base_url"], "/docs")

    def test_installed_weasyprint_renders_a_pdf(self):
        clear_engine_cache()
        pdf = write_pdf("<p>Hello</p>")
        self.assertIsNotNone(pdf)
        self.assertTrue(pdf.startswith(b"%PDF"))


_sentinel = object()
