from django.template.loader import render_to_string
from django.test import TestCase

from clubs.models import FederationProfile

from .pdf_utils import _LTF_LETTERHEAD, _issuer


def _letterhead_html(issuer: dict) -> str:
    return render_to_string(
        "finance/ltf_license_invoice_pdf.html",
        {
            "labels": {
                "invoice": "Invoice",
                "subject": "Subject",
                "item": "Item",
                "qty": "Qty",
                "unit": "Unit",
                "subtotal": "Subtotal",
                "total": "Total",
                "doc_lang": "en",
            },
            "doc_lang": "en",
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
            "recipient_name": "Example Club",
            "recipient_lines": [],
            "sepa_slot_qr": "",
            "wero_slot_qr": "",
            "issuer": issuer,
        },
    )


class FederationLetterheadTests(TestCase):
    def test_a_missing_profile_keeps_the_existing_letterhead(self):
        issuer = _issuer()
        self.assertEqual(issuer["lines"], list(_LTF_LETTERHEAD["lines"]))
        self.assertEqual(issuer["email"], _LTF_LETTERHEAD["email"])
        self.assertEqual(issuer["website"], _LTF_LETTERHEAD["website"])

    def test_filled_profile_replaces_address_email_and_website(self):
        FederationProfile.objects.create(
            name="Example Federation",
            address_line1="12 Rue de l'Exemple",
            address_line2="Bureau 2",
            postal_code="1234",
            locality="Musterstadt",
            email="desk@example.org",
            website="https://example.org",
        )
        issuer = _issuer()
        self.assertEqual(
            issuer["lines"],
            ["12 Rue de l'Exemple", "Bureau 2", "L-1234 Musterstadt", "LUXEMBOURG"],
        )
        self.assertEqual(issuer["email"], "desk@example.org")
        self.assertEqual(issuer["website"], "https://example.org")
        self.assertNotIn("Route d'Arlon", issuer["lines"])
        html = _letterhead_html(issuer)
        self.assertIn("desk@example.org", html)
        self.assertIn("https://example.org", html)
        self.assertIn("12 Rue de l&#x27;Exemple", html)
        self.assertNotIn("secretariat@", html)

    def test_partial_profile_omits_blank_lines_and_the_word_none(self):
        FederationProfile.objects.create(
            name="Example Federation",
            address_line1="4 Rue Factice",
            address_line2="None",
            postal_code="",
            locality="",
            email="partial@example.org",
            website=" none ",
        )
        issuer = _issuer()
        self.assertEqual(issuer["lines"][0], "4 Rue Factice")
        self.assertNotIn("None", issuer["lines"])
        self.assertEqual(issuer["email"], "partial@example.org")
        self.assertEqual(issuer["website"], "")
        html = _letterhead_html(issuer)
        self.assertIn("partial@example.org", html)
        self.assertIn("4 Rue Factice", html)
        self.assertNotIn("secretariat@", html)
        self.assertNotIn("luxembourgtaekwondo", html)
        self.assertNotIn(">None<", html)
        self.assertNotIn("Website:", html)
        self.assertNotIn("Email:", html)

    def test_an_empty_profile_keeps_the_address_and_hides_contact_lines(self):
        FederationProfile.objects.create(
            name="Example Federation",
            address_line1="",
            address_line2="  ",
            postal_code="",
            locality="",
            email="",
            website="",
        )
        issuer = _issuer()
        self.assertEqual(issuer["lines"], list(_LTF_LETTERHEAD["lines"]))
        self.assertEqual(issuer["email"], "")
        self.assertEqual(issuer["website"], "")
        html = _letterhead_html(issuer)
        self.assertIn("3, Route d&#x27;Arlon", html)
        self.assertNotIn("secretariat@", html)
        self.assertNotIn("luxembourgtaekwondo", html)
        self.assertNotIn(">None<", html)

    def test_user_text_is_escaped_in_the_letterhead(self):
        FederationProfile.objects.create(
            name="Example Federation",
            address_line1="12 <Rue> de Test",
            email="desk@example.org",
            website="https://example.org",
        )
        html = _letterhead_html(_issuer())
        self.assertIn("12 &lt;Rue&gt; de Test", html)
        self.assertNotIn("12 <Rue>", html)
