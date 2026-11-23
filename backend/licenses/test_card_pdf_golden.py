"""One fake licence card. The extracted text, page count, and page size stay put.

This does not change how a card is drawn. It fails if the PDF text moves,
including if a date becomes 29.11.2026.
"""

from datetime import date, timedelta
from decimal import Decimal
from io import BytesIO
from unittest.mock import patch

from django.test import TestCase
from django.utils import timezone, translation
from pypdf import PdfReader

from accounts.models import StaffMfaGrace, User
from clubs.models import Club
from members.models import Member

from .card_rendering import build_preview_data, render_card_pdf_bytes
from .models import CardFormatPreset, CardTemplate, CardTemplateVersion, License, LicenseType, PaperProfile

# 85.00 mm by 55.00 mm, the 3C card, in PDF points (72 pt per inch).
_PAGE_WIDTH = Decimal("85.00") * Decimal("72") / Decimal("25.4")
_PAGE_HEIGHT = Decimal("55.00") * Decimal("72") / Decimal("25.4")

_GOLDEN_TEXT = "\n".join(
    [
        "EXAMPLE Ada",
        "29 Nov 2026",
        "29 Nov 2026 31 Dec 2026",
        "active",
    ]
)


def _design() -> dict:
    return {
        "elements": [
            {
                "id": "name",
                "type": "text",
                "x_mm": "4.00",
                "y_mm": "4.00",
                "width_mm": "70.00",
                "height_mm": "8.00",
                "text": "{{member.last_name}} {{member.first_name}}",
            },
            {
                "id": "born",
                "type": "text",
                "x_mm": "4.00",
                "y_mm": "14.00",
                "width_mm": "70.00",
                "height_mm": "6.00",
                "text": "{{member.date_of_birth}}",
            },
            {
                "id": "start",
                "type": "text",
                "x_mm": "4.00",
                "y_mm": "22.00",
                "width_mm": "35.00",
                "height_mm": "6.00",
                "text": "{{license.start_date}}",
            },
            {
                "id": "end",
                "type": "text",
                "x_mm": "40.00",
                "y_mm": "22.00",
                "width_mm": "35.00",
                "height_mm": "6.00",
                "text": "{{license.end_date}}",
            },
            {
                "id": "status",
                "type": "text",
                "x_mm": "4.00",
                "y_mm": "30.00",
                "width_mm": "30.00",
                "height_mm": "6.00",
                "text": "{{license.status}}",
            },
        ],
        "metadata": {"unit": "mm"},
    }


def _pdf_text(content: bytes) -> str:
    reader = PdfReader(BytesIO(content))
    lines = []
    for page in reader.pages:
        for line in (page.extract_text() or "").splitlines():
            cleaned = " ".join(line.split())
            if cleaned:
                lines.append(cleaned)
    return "\n".join(lines)


class LicenceCardPdfGoldenTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            username="card-golden-admin",
            password="pass12345",
            role=User.Roles.LTF_ADMIN,
        )
        StaffMfaGrace.objects.create(
            user=self.admin,
            grace_until=timezone.localdate() + timedelta(days=30),
        )
        self.club = Club.objects.create(name="Example Club", city="Luxembourg", created_by=self.admin)
        self.format = CardFormatPreset.objects.get(code="3c")
        self.paper = PaperProfile.objects.get(code="sigel-lp798")
        self.license_type = LicenseType.objects.create(name="Athlete", code="card-golden-athlete")
        self.template = CardTemplate.objects.create(
            name="Golden 3C",
            is_default=True,
            created_by=self.admin,
            updated_by=self.admin,
        )
        self.published = CardTemplateVersion.objects.create(
            template=self.template,
            version_number=1,
            status=CardTemplateVersion.Status.PUBLISHED,
            card_format=self.format,
            paper_profile=self.paper,
            design_payload=_design(),
            created_by=self.admin,
            published_by=self.admin,
            published_at=timezone.now(),
        )
        self.member = Member.objects.create(
            club=self.club,
            first_name="Ada",
            last_name="EXAMPLE",
            sex=Member.Sex.FEMALE,
            date_of_birth=date(2026, 11, 29),
            ltf_licenseid="LTF-EX-0001",
        )
        self.license = License.objects.create(
            member=self.member,
            club=self.club,
            license_type=self.license_type,
            year=2026,
            status=License.Status.ACTIVE,
            start_date=date(2026, 11, 29),
            end_date=date(2026, 12, 31),
        )

    def _render(self, language: str) -> bytes:
        with translation.override(language):
            preview = build_preview_data(
                template_version=self.published,
                license_id=self.license.id,
                member_id=self.member.id,
                club_id=self.club.id,
            )
        return render_card_pdf_bytes(preview)

    def test_one_fake_card_keeps_its_text_and_page(self):
        for language in ("en", "fr", "de", "lb"):
            with patch("clubs.display_dates.format_display_date") as shared:
                pdf = self._render(language)
            self.assertFalse(shared.called, language)
            self.assertTrue(pdf.startswith(b"%PDF"))
            reader = PdfReader(BytesIO(pdf))
            self.assertEqual(len(reader.pages), 1, language)
            box = reader.pages[0].mediabox
            self.assertAlmostEqual(float(box.width), float(_PAGE_WIDTH), places=1)
            self.assertAlmostEqual(float(box.height), float(_PAGE_HEIGHT), places=1)
            text = _pdf_text(pdf)
            self.assertEqual(text, _GOLDEN_TEXT, language)
            self.assertIn("29 Nov 2026", text)
            self.assertNotIn("29.11.2026", text)
            self.assertNotIn("31.12.2026", text)
