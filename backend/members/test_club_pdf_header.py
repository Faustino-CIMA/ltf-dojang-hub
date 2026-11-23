import io
import tempfile
from datetime import date

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.utils import timezone
from PIL import Image
from rest_framework.test import APIClient

from accounts.models import User
from clubs.models import BrandingAsset, Club
from licenses.pdf_utils import _club_issuer, club_pdf_header_html, render_statement_pdf
from members.club_data_export import build_own_file, build_pdf
from members.models import Member
from members.test_verification import _open_grace
from modules.codes import build_payload, sign_payload
from modules.entitlements import install_id_str, redeem_product_code, set_club_assignment
from modules.registry import CLUB_MANAGEMENT_MODULE_ID


def _png(name: str = "club-logo.png") -> SimpleUploadedFile:
    buffer = io.BytesIO()
    Image.new("RGB", (32, 32), color=(20, 90, 160)).save(buffer, format="PNG")
    return SimpleUploadedFile(name, buffer.getvalue(), content_type="image/png")


def _pdf_text(payload: bytes) -> str:
    from pypdf import PdfReader

    return "\n".join(page.extract_text() or "" for page in PdfReader(io.BytesIO(payload)).pages)


@override_settings(DEBUG=True, MODULE_CODE_PUBLIC_KEY="", MODULE_CODE_PRIVATE_KEY="")
class ClubPdfHeaderTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_user(username="header-admin", password="pass12345", role=User.Roles.CLUB_ADMIN)
        self.ltf = User.objects.create_user(username="header-ltf", password="pass12345", role=User.Roles.LTF_ADMIN)
        _open_grace(self.admin, self.ltf)
        self.club = Club.objects.create(
            name="Example <Club>",
            address_line1="12 Rue Factice",
            postal_code="1234",
            locality="Musterstadt",
            iban="LU120000000000000000",
            created_by=self.admin,
        )
        self.club.admins.add(self.admin)
        self.member = Member.objects.create(
            club=self.club,
            first_name="Ada",
            last_name="EXAMPLE",
            sex=Member.Sex.FEMALE,
            ltf_licenseid="LTF-HEAD-1",
            date_of_birth=date(1990, 1, 2),
        )
        token = sign_payload(build_payload(module_ids=[CLUB_MANAGEMENT_MODULE_ID], install_id=install_id_str()))
        redeem_product_code(token)
        set_club_assignment(club=self.club, module_id=CLUB_MANAGEMENT_MODULE_ID, enabled=True, user=self.ltf)

    def _logo(self):
        BrandingAsset.objects.create(
            scope_type=BrandingAsset.ScopeType.CLUB,
            asset_type=BrandingAsset.AssetType.LOGO,
            usage_type=BrandingAsset.UsageType.INVOICE,
            club=self.club,
            file=_png(),
            is_selected=True,
            uploaded_by=self.admin,
        )

    def test_the_header_reuses_the_club_invoice_issuer_and_skips_the_bank_line(self):
        with tempfile.TemporaryDirectory() as media_root:
            with self.settings(MEDIA_ROOT=media_root):
                self._logo()
                issuer = _club_issuer(self.club)
                html = club_pdf_header_html(self.club)
        self.assertEqual(issuer["lines"], ["12 Rue Factice", "L-1234 Musterstadt", "LUXEMBOURG"])
        self.assertIn("Example &lt;Club&gt;", html)
        self.assertNotIn("Example <Club>", html)
        self.assertIn("12 Rue Factice", html)
        self.assertIn("L-1234 Musterstadt", html)
        self.assertIn(issuer["logo_uri"], html)
        self.assertNotIn("LU12", html)
        self.assertIn('class="club-pdf-header"', html)

    def test_member_data_and_the_statement_print_that_header(self):
        with tempfile.TemporaryDirectory() as media_root:
            with self.settings(MEDIA_ROOT=media_root):
                self._logo()
                report = build_pdf({"members": []}, self.club.name, "en", {}, club=self.club)
                own, content_type, extension = build_own_file(self.member, "pdf", "en")
                statement = render_statement_pdf(
                    {
                        "title": "Ada EXAMPLE — 2026",
                        "club_name": self.club.name,
                        "club": self.club,
                        "rows": [],
                        "outstanding_total": "0.00",
                        "generated_at": timezone.now(),
                    },
                    base_url="http://testserver/",
                )
                self.client.force_authenticate(user=self.admin)
                response = self.client.get(
                    f"/api/club-statements/?club={self.club.id}&member={self.member.id}&year=2026",
                    HTTP_X_DESK=f"club_admin:{self.club.id}",
                )
        self.assertTrue(report and report.startswith(b"%PDF"))
        self.assertEqual((content_type, extension), ("application/pdf", "pdf"))
        self.assertTrue(own and own.startswith(b"%PDF"))
        self.assertTrue(statement and statement.startswith(b"%PDF"))
        self.assertEqual(response.status_code, 200, response.content[:200])
        downloaded = response.content
        for payload in (report, own, statement, downloaded):
            text = _pdf_text(payload)
            self.assertIn("12 Rue Factice", text)
            self.assertIn("L-1234 Musterstadt", text)
            self.assertIn("LUXEMBOURG", text)
            self.assertNotIn("LU12", text)
            self.assertIn(b"/Subtype /Image", payload)
