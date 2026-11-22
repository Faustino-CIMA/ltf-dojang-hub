import io
import json
import zipfile
from datetime import date

from django.test import TestCase
from openpyxl import load_workbook
from rest_framework.test import APIClient

from accounts.models import User
from clubmgmt.models import MemberRecord
from clubs.models import Club
from licenses.models import License, LicenseType
from members.models import GradePromotionHistory, Member
from members.ssn_countries import luxembourg_check_digits
from members.ssn_mask import MASKED_SOCIAL_SECURITY_NUMBER
from members.test_verification import _open_grace
from ops.models import OpsAuditLog


def _lu(body: str) -> str:
    return body + luxembourg_check_digits(body)


class MemberOwnExportTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.owner = User.objects.create_user(username="own-member", password="pass12345", role=User.Roles.MEMBER)
        self.other = User.objects.create_user(username="own-other", password="pass12345", role=User.Roles.MEMBER)
        self.admin = User.objects.create_user(username="own-admin", password="pass12345", role=User.Roles.CLUB_ADMIN)
        self.coach = User.objects.create_user(username="own-coach", password="pass12345", role=User.Roles.COACH)
        _open_grace(self.owner, self.other, self.admin, self.coach)
        self.club = Club.objects.create(name="Example Club", city="Luxembourg", address="1 Road", created_by=self.admin)
        self.club.admins.add(self.admin)
        self.club.trainers.add(self.coach)
        self.number = _lu("19711002130")
        self.member = Member.objects.create(
            club=self.club,
            user=self.owner,
            first_name="Ada",
            last_name="EXAMPLE",
            sex=Member.Sex.FEMALE,
            ltf_licenseid="LTF-OWN-1",
            date_of_birth=date(1990, 1, 2),
        )
        MemberRecord.objects.create(
            member=self.member,
            social_security_number=self.number,
            social_security_country="LU",
        )
        kind = LicenseType.objects.create(name="Athlete own", code="athlete-own")
        License.objects.create(
            member=self.member,
            club=self.club,
            license_type=kind,
            year=2026,
            start_date=date(2026, 1, 1),
            end_date=date(2026, 12, 31),
            status=License.Status.ACTIVE,
        )
        GradePromotionHistory.objects.create(
            member=self.member,
            club=self.club,
            from_grade="10th Kup",
            to_grade="9th Kup",
            promotion_date=date(2026, 3, 1),
        )
        self.header = {"HTTP_X_DESK": f"club_admin:{self.club.id}"}

    def test_the_member_gets_the_number_in_json_and_bullets_in_the_pdf(self):
        self.client.force_authenticate(user=self.owner)
        exported = self.client.get(f"/api/members/{self.member.id}/my-data/?file_format=json&locale=en")
        self.assertEqual(exported.status_code, 200, exported.content[:300])
        self.assertIn(self.number, exported.content.decode())
        self.assertIn("9th Kup", exported.content.decode())
        report = self.client.get(f"/api/members/{self.member.id}/my-data/?file_format=pdf&locale=en")
        self.assertEqual(report.status_code, 200)
        payload = b"".join(report.streaming_content) if hasattr(report, "streaming_content") else report.content
        self.assertTrue(payload.startswith(b"%PDF"))
        from pypdf import PdfReader

        text = "\n".join(page.extract_text() or "" for page in PdfReader(io.BytesIO(payload)).pages)
        self.assertIn("9th Kup", text)
        self.assertIn(MASKED_SOCIAL_SECURITY_NUMBER, text)
        self.assertNotIn(self.number, text)
        self.assertEqual(OpsAuditLog.objects.filter(action="data.export").count(), 0)

    def test_a_club_admin_download_is_audited_and_a_coach_is_refused(self):
        self.client.force_authenticate(user=self.coach)
        refused = self.client.get(
            f"/api/members/{self.member.id}/my-data/?file_format=json",
            HTTP_X_DESK=f"coach:{self.club.id}",
        )
        self.assertEqual(refused.status_code, 403)
        self.client.force_authenticate(user=self.other)
        hidden = self.client.get(f"/api/members/{self.member.id}/my-data/?file_format=json")
        self.assertEqual(hidden.status_code, 403)
        self.client.force_authenticate(user=self.admin)
        exported = self.client.get(
            f"/api/members/{self.member.id}/my-data/?file_format=xlsx&locale=en",
            **self.header,
        )
        self.assertEqual(exported.status_code, 200, exported.content[:200])
        book = load_workbook(io.BytesIO(exported.content))
        rows = list(book["members"].iter_rows(values_only=True))
        flat = [cell for row in rows for cell in row]
        self.assertIn(self.number, flat)
        self.assertIn("9th Kup", [cell for row in book["grades"].iter_rows(values_only=True) for cell in row])
        audit = OpsAuditLog.objects.get(action="data.export", target_id=str(self.member.id))
        dumped = json.dumps(audit.metadata)
        self.assertNotIn(self.number, dumped)
        self.assertNotIn(self.number, audit.message)
        self.assertTrue(audit.metadata["numbers_included"])
        self.assertTrue(audit.metadata["own_file"])
        zipped = self.client.get(f"/api/members/{self.member.id}/my-data/?file_format=csv", **self.header)
        archive = zipfile.ZipFile(io.BytesIO(zipped.content))
        self.assertIn(self.number, archive.read("members.csv").decode())
