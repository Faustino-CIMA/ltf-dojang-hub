import io
import zipfile
from datetime import date

from django.test import TestCase, override_settings
from openpyxl import load_workbook
from rest_framework.test import APIClient

from accounts.models import User
from clubmgmt.models import MemberRecord
from clubs.models import Club
from licenses.models import License, LicenseType
from members.models import GradePromotionHistory, Member
from members.ssn_countries import luxembourg_check_digits
from members.test_verification import _open_grace
from ops.models import OpsAuditLog


def _lu(body: str) -> str:
    return body + luxembourg_check_digits(body)


class ClubDataExportTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_user(username="export-admin", password="pass12345", role=User.Roles.CLUB_ADMIN)
        self.other_admin = User.objects.create_user(
            username="export-other", password="pass12345", role=User.Roles.CLUB_ADMIN
        )
        self.coach = User.objects.create_user(username="export-coach", password="pass12345", role=User.Roles.COACH)
        _open_grace(self.admin, self.other_admin, self.coach)
        self.club = Club.objects.create(name="Example Club", city="Luxembourg", address="1 Road", created_by=self.admin)
        self.other = Club.objects.create(name="Other Club", city="Esch", address="2 Road", created_by=self.admin)
        self.club.admins.add(self.admin)
        self.other.admins.add(self.other_admin)
        self.club.trainers.add(self.coach)
        self.person = Member.objects.create(
            club=self.club,
            first_name="Ada",
            last_name="=SILVA",
            sex=Member.Sex.FEMALE,
            email="ada@example.test",
            ltf_licenseid="LTF000001",
            date_of_birth=date(1990, 1, 2),
        )
        MemberRecord.objects.create(
            member=self.person,
            social_security_number=_lu("19711002130"),
            social_security_country="LU",
        )
        self.stranger = Member.objects.create(
            club=self.other, first_name="Bea", last_name="COSTA", sex=Member.Sex.FEMALE, ltf_licenseid="LTF000099"
        )
        kind = LicenseType.objects.create(name="Athlete export", code="athlete-export")
        License.objects.create(member=self.person, club=self.club, license_type=kind, year=2026, status=License.Status.ACTIVE)
        License.objects.create(
            member=self.stranger, club=self.other, license_type=kind, year=2026, status=License.Status.ACTIVE
        )
        GradePromotionHistory.objects.create(
            member=self.person,
            club=self.club,
            from_grade="10th Kup",
            to_grade="9th Kup",
            promotion_date=date(2026, 3, 1),
            notes="Club test",
        )
        self.header = {"HTTP_X_DESK": f"club_admin:{self.club.id}"}

    def test_xlsx_is_this_club_only_and_hides_the_number(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.post(
            "/api/club-data/export/",
            {"sheets": ["members", "licences"], "format": "xlsx", "locale": "en"},
            format="json",
            **self.header,
        )
        self.assertEqual(response.status_code, 200, response.content[:300])
        book = load_workbook(io.BytesIO(response.content))
        self.assertEqual(book.sheetnames, ["members", "licences"])
        members = list(book["members"].iter_rows(values_only=True))
        self.assertEqual(members[0][0], "Member reference")
        self.assertEqual(members[1][0], "member_ref")
        body = " ".join(str(cell) for row in members for cell in row)
        self.assertIn("LTF000001", body)
        self.assertIn("'=SILVA", body)
        self.assertNotIn(_lu("19711002130"), body)
        self.assertNotIn("LTF000099", body)
        licences = list(book["licences"].iter_rows(values_only=True))
        self.assertEqual(licences[2][0], "LTF000001")
        self.assertEqual(licences[2][1], "Athlete export")
        audit = OpsAuditLog.objects.get(action="data.export", target_id=str(self.club.id))
        self.assertNotIn(_lu("19711002130"), audit.message)
        self.assertFalse(audit.metadata["social_security_numbers"])
        self.assertEqual(audit.metadata["member_rows"], 1)

    def test_csv_zip_lists_the_tables(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.post(
            "/api/club-data/export/",
            {"sheets": ["members"], "format": "csv", "locale": "fr"},
            format="json",
            **self.header,
        )
        self.assertEqual(response.status_code, 200, response.content[:200])
        with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
            names = set(archive.namelist())
            self.assertEqual(names, {"members.csv", "manifest.csv"})
            text = archive.read("members.csv").decode("utf-8")
            self.assertTrue(text.startswith("Référence du membre"))
            self.assertIn("member_ref", text.splitlines()[1])
            self.assertNotIn(_lu("19711002130"), text)
            manifest = archive.read("manifest.csv").decode("utf-8")
            self.assertIn("members.csv,members,1", manifest)

    def test_another_role_and_another_club_are_refused(self):
        self.client.force_authenticate(user=self.coach)
        refused = self.client.post(
            "/api/club-data/export/",
            {"sheets": ["members"], "format": "csv", "locale": "en"},
            format="json",
            HTTP_X_DESK=f"coach:{self.club.id}",
        )
        self.assertEqual(refused.status_code, 403)
        self.client.force_authenticate(user=self.other_admin)
        other = self.client.get("/api/club-data/export/", HTTP_X_DESK=f"club_admin:{self.other.id}")
        self.assertEqual(other.status_code, 200, other.content)
        self.assertEqual(other.data["member_count"], 1)
        self.assertEqual(other.data["club_name"], "Other Club")
        self.assertEqual(OpsAuditLog.objects.filter(action="data.export").count(), 0)

    @override_settings(CELERY_TASK_ALWAYS_EAGER=True, CELERY_TASK_EAGER_PROPAGATES=True)
    def test_json_and_pdf_include_grades_and_mask_the_number(self):
        self.client.force_authenticate(user=self.admin)
        exported = self.client.post(
            "/api/club-data/export/",
            {"sheets": ["members", "grades"], "format": "json", "locale": "en"},
            format="json",
            **self.header,
        )
        self.assertEqual(exported.status_code, 200, exported.content[:300])
        body = exported.content.decode("utf-8")
        self.assertIn("9th Kup", body)
        self.assertNotIn(_lu("19711002130"), body)
        queued = self.client.post(
            "/api/club-data/export/",
            {"sheets": ["members", "grades"], "format": "pdf", "locale": "en"},
            format="json",
            **self.header,
        )
        self.assertEqual(queued.status_code, 202, queued.content)
        job_id = queued.json()["id"]
        status = self.client.get(f"/api/club-data/export/jobs/{job_id}/", **self.header)
        self.assertEqual(status.status_code, 200, status.content)
        self.assertEqual(status.data["status"], "succeeded")
        self.assertEqual(status.data["progress"], 100)
        report = self.client.get(f"/api/club-data/export/jobs/{job_id}/file/", **self.header)
        self.assertEqual(report.status_code, 200)
        payload = b"".join(report.streaming_content)
        self.assertTrue(payload.startswith(b"%PDF"))
        from pypdf import PdfReader

        text = "\n".join(page.extract_text() or "" for page in PdfReader(io.BytesIO(payload)).pages)
        number = _lu("19711002130")
        self.assertIn("9th Kup", text)
        self.assertIn("•" * 13, text)
        self.assertNotIn(number, text)
        self.assertNotIn(number[-4:], text)
        self.assertNotIn(number[:8], text)
