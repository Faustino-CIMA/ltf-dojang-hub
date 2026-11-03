from io import BytesIO

from django.conf import settings
from django.template.loader import render_to_string
from django.test import TestCase
from openpyxl import load_workbook

from accounts.models import User
from clubs.document_copy import email_copy, invoice_labels, report_labels, resolve_document_language
from clubs.models import Club
from licenses.finance_reports import build_finance_report, render_finance_report_xlsx


class DocumentLanguageTests(TestCase):
    def test_backend_languages_include_french_and_german(self):
        codes = {code for code, _name in settings.LANGUAGES}
        self.assertTrue({"en", "fr", "de", "lb"} <= codes)

    def test_a_club_can_keep_french_or_german(self):
        admin = User.objects.create_user(username="lang-admin", password="pass12345", role=User.Roles.LTF_ADMIN)
        club = Club.objects.create(name="Lang Club", created_by=admin, communication_language="fr")
        club.refresh_from_db()
        self.assertEqual(club.communication_language, "fr")
        club.communication_language = "de"
        club.save()
        club.refresh_from_db()
        self.assertEqual(club.communication_language, "de")
        club.communication_language = "zz"
        club.save()
        club.refresh_from_db()
        self.assertEqual(club.communication_language, "en")

    def test_unknown_language_falls_back_to_english_and_club_language_is_used(self):
        club = Club(communication_language="de")
        self.assertEqual(resolve_document_language(explicit="zz", club=club), "de")
        self.assertEqual(resolve_document_language(explicit="fr", club=club), "fr")
        self.assertEqual(resolve_document_language(explicit="en", club=club, prefer_club=True), "de")

    def test_invoice_pdf_words_follow_the_club_language(self):
        for language, license_id, absent in (
            ("en", "License ID", "Lizenz-ID"),
            ("fr", "N° de licence", "License ID"),
            ("de", "Lizenz-ID", "License ID"),
            ("lb", "Lizenz-ID", "License"),
        ):
            html = render_to_string(
                "finance/ltf_license_invoice_pdf.html",
                {
                    "labels": invoice_labels(language),
                    "doc_lang": language,
                    "invoice": type("Invoice", (), {"invoice_number": "F-1"})(),
                    "order": type("Order", (), {"order_number": "O-1"})(),
                    "module_invoice": False,
                    "license_rows": [],
                    "total_qty": 0,
                    "total_amount": "0,00 €",
                    "issued_on": "",
                    "ordered_on": "",
                    "paid_on": "",
                    "fulfilled_on": "",
                    "invoice_status_label": "Issued",
                    "order_status_label": "Pending",
                    "invoice_status_done": False,
                    "order_status_done": False,
                    "recipient_name": "Club",
                    "recipient_lines": [],
                    "sepa_slot_qr": "",
                    "wero_slot_qr": "",
                },
            )
            self.assertIn(license_id, html)
            self.assertNotIn(absent, html)
            self.assertIn(f'lang="{language}"', html)

    def test_emails_render_in_each_language(self):
        expected = {
            "en": "We received a request to reset your LTF Dojang Hub password.",
            "fr": "réinitialisation de votre mot de passe",
            "de": "Ihr LTF-Dojang-Hub-Passwort zurückzusetzen",
            "lb": "Äert LTF Dojang Hub Passwuert zréckzesetzen",
        }
        for language, snippet in expected.items():
            copy = email_copy("reset", language, name="Ada", username="ada")
            text = render_to_string(
                "account/email/password_reset.txt",
                {"copy": copy, "reset_url": f"https://example.test/{language}/reset-password"},
            )
            self.assertIn(snippet, text)
            confirm = email_copy("confirm", language)
            body = render_to_string(
                "account/email/email_confirmation_message.txt",
                {"copy": confirm, "activate_url": "https://example.test/verify"},
            )
            self.assertIn(confirm["body"], body)
            self.assertNotIn("{name}", body)

    def test_german_income_statement_uses_the_full_name(self):
        self.assertEqual(report_labels("de")["income_title"], "Gewinn- und Verlustrechnung")
        self.assertEqual(report_labels("fr")["income_title"], "Compte de résultat")
        report = build_finance_report(2026)
        workbook = load_workbook(BytesIO(render_finance_report_xlsx(report, "de")))
        self.assertIn("Gewinn- und Verlustrechnung", workbook.sheetnames)
        self.assertEqual(workbook["Gewinn- und Verlustrechnung"]["A1"].value, "Gewinn- und Verlustrechnung")
        english = load_workbook(BytesIO(render_finance_report_xlsx(report, "en")))
        self.assertIn("Income statement", english.sheetnames)
