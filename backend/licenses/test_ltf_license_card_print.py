from datetime import date, timedelta
from io import BytesIO

from django.utils import translation, timezone
from pypdf import PdfReader
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import DeskGrant, StaffMfaGrace, User
from clubs.models import Club
from members.models import Member

from .card_rendering import build_preview_data
from .models import (
    CardFormatPreset,
    CardTemplate,
    CardTemplateVersion,
    License,
    LicenseType,
    PaperProfile,
    PrintJob,
)
from .print_filenames import license_card_download_filename


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
                "text": "{{member.first_name}} {{member.last_name}}",
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
                "id": "sex",
                "type": "text",
                "x_mm": "4.00",
                "y_mm": "22.00",
                "width_mm": "20.00",
                "height_mm": "6.00",
                "text": "{{member.sex}}",
            },
            {
                "id": "status",
                "type": "text",
                "x_mm": "28.00",
                "y_mm": "22.00",
                "width_mm": "30.00",
                "height_mm": "6.00",
                "text": "{{license.status}}",
            },
            {
                "id": "role",
                "type": "text",
                "x_mm": "4.00",
                "y_mm": "30.00",
                "width_mm": "40.00",
                "height_mm": "6.00",
                "text": "{{primary_license_role}}",
            },
        ],
        "metadata": {"unit": "mm"},
    }


class LicenseCardFilenameTests(APITestCase):
    def test_filename_keeps_number_then_last_name_then_first_name(self):
        self.assertEqual(
            license_card_download_filename(
                license_number="LTF-2026-00123",
                last_name="Müller",
                first_name="Ana Maria",
                year=2026,
                license_id=9,
            ),
            "LTF-2026-00123_Muller_Ana_Maria.pdf",
        )

    def test_blank_license_number_falls_back_to_year_and_id(self):
        self.assertEqual(
            license_card_download_filename(
                license_number="",
                last_name="Holder",
                first_name="Sample",
                year=2026,
                license_id=12,
            ),
            "LTF-2026-00012_Holder_Sample.pdf",
        )


class LtfLicenseCardPrintTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            username="card-print-admin",
            password="pass12345",
            role=User.Roles.LTF_ADMIN,
        )
        self.finance = User.objects.create_user(
            username="card-print-finance",
            password="pass12345",
            role=User.Roles.LTF_FINANCE,
        )
        self.club_admin = User.objects.create_user(
            username="card-print-club",
            password="pass12345",
            role=User.Roles.CLUB_ADMIN,
        )
        self.viewer = User.objects.create_user(
            username="card-print-viewer",
            password="pass12345",
            role=User.Roles.LTF_FINANCE,
        )
        today = timezone.localdate()
        for user in (self.admin, self.finance, self.club_admin, self.viewer):
            StaffMfaGrace.objects.update_or_create(
                user=user,
                defaults={
                    "grace_until": today + timedelta(days=30),
                    "no_grace": False,
                    "extended": False,
                },
            )
        DeskGrant.objects.create(
            user=self.admin,
            desk=DeskGrant.Desk.LTF_FINANCE,
            level=DeskGrant.Level.FULL,
            source=DeskGrant.Source.LEGACY,
            valid_from=today,
        )
        DeskGrant.objects.create(
            user=self.viewer,
            desk=DeskGrant.Desk.LTF_ADMIN,
            level=DeskGrant.Level.READ_ONLY,
            source=DeskGrant.Source.LEGACY,
            valid_from=today - timedelta(days=1),
            valid_until=today + timedelta(days=30),
            reason="Look",
        )
        self.club_a = Club.objects.create(name="Card Print A", created_by=self.admin)
        self.club_b = Club.objects.create(name="Card Print B", created_by=self.admin)
        self.club_a.admins.add(self.club_admin)
        self.card_format = CardFormatPreset.objects.get(code="3c")
        self.paper = PaperProfile.objects.get(code="sigel-lp798")
        self.license_type = LicenseType.objects.create(name="Card Print Type", code="card-print-type")
        self.template = CardTemplate.objects.create(
            name="Standard 3C",
            is_default=True,
            created_by=self.admin,
            updated_by=self.admin,
        )
        self.published = CardTemplateVersion.objects.create(
            template=self.template,
            version_number=1,
            status=CardTemplateVersion.Status.PUBLISHED,
            card_format=self.card_format,
            paper_profile=self.paper,
            design_payload=_design(),
            created_by=self.admin,
            published_by=self.admin,
            published_at=timezone.now(),
        )
        self.member = Member.objects.create(
            club=self.club_a,
            first_name="Sample",
            last_name="Holder",
            sex=Member.Sex.MALE,
            date_of_birth=date(2016, 1, 9),
            ltf_licenseid="LTF-2026-00123",
            primary_license_role=Member.LicenseRole.ATHLETE,
        )
        self.license = License.objects.create(
            member=self.member,
            club=self.club_a,
            license_type=self.license_type,
            year=2026,
            status=License.Status.ACTIVE,
            start_date=date(2026, 1, 9),
            end_date=date(2026, 12, 31),
        )
        self.other_member = Member.objects.create(
            club=self.club_a,
            first_name="Page",
            last_name="Two",
            ltf_licenseid="LTF-2026-00002",
        )
        self.other_license = License.objects.create(
            member=self.other_member,
            club=self.club_a,
            license_type=self.license_type,
            year=2026,
            status=License.Status.PENDING,
        )
        self.far_member = Member.objects.create(
            club=self.club_b,
            first_name="Other",
            last_name="Club",
            ltf_licenseid="LTF-2026-00003",
        )
        self.far_license = License.objects.create(
            member=self.far_member,
            club=self.club_b,
            license_type=self.license_type,
            year=2026,
            status=License.Status.PENDING,
        )
        self.staff_member = Member.objects.create(
            club=None,
            first_name="Staff",
            last_name="Person",
            ltf_licenseid="LTF-2026-00009",
        )
        self.staff_license = License.objects.create(
            member=self.staff_member,
            club=None,
            license_type=self.license_type,
            year=2026,
            status=License.Status.ACTIVE,
        )

    def _pdf_text(self, content: bytes) -> str:
        return "\n".join((page.extract_text() or "") for page in PdfReader(BytesIO(content)).pages)

    def test_admin_desk_downloads_one_card_in_english_without_a_photo(self):
        self.client.force_authenticate(user=self.admin)
        with translation.override("de"):
            response = self.client.get(
                f"/api/licenses/{self.license.id}/card-pdf/",
                HTTP_X_DESK="ltf_admin",
                HTTP_ACCEPT_LANGUAGE="de",
            )
        self.assertEqual(response.status_code, status.HTTP_200_OK, getattr(response, "data", None))
        body = b"".join(response.streaming_content)
        self.assertTrue(body.startswith(b"%PDF"))
        disposition = response["Content-Disposition"]
        self.assertIn("LTF-2026-00123_HOLDER_Sample.pdf", disposition)
        text = self._pdf_text(body)
        self.assertIn("Sample", text)
        self.assertIn("HOLDER", text)
        self.assertIn("09 Jan 2016", text)
        self.assertIn("Jan", text)
        self.assertNotIn("Januar", text)
        self.assertIn("active", text)
        self.assertIn("Athlete", text)
        job = PrintJob.objects.get()
        self.assertEqual(job.paper_profile_id, self.paper.id)
        self.assertEqual(list(job.items.values_list("license_id", flat=True)), [self.license.id])

    def test_shared_renderer_stays_english_when_the_ui_language_is_german(self):
        seen = []
        from . import card_rendering

        real = card_rendering.format_ltf_date

        def spy(value):
            seen.append(translation.get_language())
            return real(value)

        card_rendering.format_ltf_date = spy
        try:
            with translation.override("de"):
                preview = build_preview_data(
                    template_version=self.published,
                    license_id=self.license.id,
                    member_id=self.member.id,
                    club_id=self.club_a.id,
                )
        finally:
            card_rendering.format_ltf_date = real
        self.assertTrue(seen)
        self.assertTrue(all(language == "en" for language in seen))
        context = preview["context"]
        self.assertIn("09 Jan 2016", context["member.date_of_birth"])
        self.assertEqual(context["member.sex"], "M")
        self.assertEqual(context["license.status"], "active")
        self.assertEqual(context["primary_license_role"], "Athlete")

    def test_finance_desk_club_desk_and_view_only_cannot_print(self):
        self.client.force_authenticate(user=self.admin)
        finance_desk = self.client.get(
            f"/api/licenses/{self.license.id}/card-pdf/",
            HTTP_X_DESK="ltf_finance",
        )
        self.assertEqual(finance_desk.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(finance_desk.data["detail"], "Not allowed.")

        self.client.force_authenticate(user=self.finance)
        finance_role = self.client.get(f"/api/licenses/{self.license.id}/card-pdf/")
        self.assertEqual(finance_role.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(finance_role.data["detail"], "Not allowed.")

        self.client.force_authenticate(user=self.club_admin)
        club = self.client.post(
            "/api/licenses/card-print/",
            {"license_ids": [self.license.id]},
            format="json",
            HTTP_X_DESK=f"club_admin:{self.club_a.id}",
        )
        self.assertEqual(club.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(club.data["detail"], "Not allowed.")

        self.client.force_authenticate(user=self.viewer)
        view_get = self.client.get(
            f"/api/licenses/{self.license.id}/card-pdf/",
            HTTP_X_DESK="ltf_admin",
        )
        view_post = self.client.post(
            "/api/licenses/card-print/",
            {"license_ids": [self.license.id]},
            format="json",
            HTTP_X_DESK="ltf_admin",
        )
        self.assertEqual(view_get.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(view_get.data["detail"], "desk_read_only")
        self.assertEqual(view_post.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(view_post.data["detail"], "desk_read_only")
        self.assertFalse(PrintJob.objects.exists())

    def test_missing_template_and_missing_club_are_info_refusals(self):
        self.client.force_authenticate(user=self.admin)
        self.template.is_active = False
        self.template.save(update_fields=["is_active"])
        missing = self.client.get(
            f"/api/licenses/{self.license.id}/card-pdf/",
            HTTP_X_DESK="ltf_admin",
        )
        self.assertEqual(missing.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(missing.data["detail"], "no_published_card_template")

        self.template.is_active = True
        self.template.save(update_fields=["is_active"])
        no_club = self.client.get(
            f"/api/licenses/{self.staff_license.id}/card-pdf/",
            HTTP_X_DESK="ltf_admin",
        )
        self.assertEqual(no_club.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(no_club.data["detail"], "license_has_no_club")

    def test_bulk_print_includes_ids_from_more_than_one_club(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.post(
            "/api/licenses/card-print/",
            {
                "license_ids": [
                    self.license.id,
                    self.other_license.id,
                    self.far_license.id,
                    self.staff_license.id,
                ]
            },
            format="json",
            HTTP_X_DESK="ltf_admin",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, getattr(response, "data", None))
        self.assertEqual(response.data["skipped_license_ids"], [self.staff_license.id])
        self.assertEqual(len(response.data["jobs"]), 2)
        printed = set(
            PrintJob.objects.values_list("items__license_id", flat=True)
        )
        self.assertEqual(printed, {self.license.id, self.other_license.id, self.far_license.id})
        for job in PrintJob.objects.select_related("paper_profile"):
            self.assertEqual(job.paper_profile.code, "sigel-lp798")
            self.assertEqual(job.status, PrintJob.Status.SUCCEEDED)
