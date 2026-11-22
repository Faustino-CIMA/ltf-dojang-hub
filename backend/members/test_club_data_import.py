import io
import json
import zipfile

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from openpyxl import Workbook, load_workbook
from rest_framework.test import APIClient

from accounts.models import User
from clubmgmt.models import MemberRecord
from clubs.models import Club
from members.club_data_import import MAX_BYTES, parse_upload
from members.models import Member
from members.ssn_countries import luxembourg_check_digits
from members.ssn_mask import MASKED_SOCIAL_SECURITY_NUMBER
from members.test_verification import _open_grace
from ops.models import OpsAuditLog


def _lu(body: str) -> str:
    return body + luxembourg_check_digits(body)


class ClubDataImportTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_user(username="import-admin", password="pass12345", role=User.Roles.CLUB_ADMIN)
        self.coach = User.objects.create_user(username="import-coach", password="pass12345", role=User.Roles.COACH)
        _open_grace(self.admin, self.coach)
        self.club = Club.objects.create(name="Example Club", city="Luxembourg", address="1 Road", created_by=self.admin)
        self.club.admins.add(self.admin)
        self.club.trainers.add(self.coach)
        self.header = {"HTTP_X_DESK": f"club_admin:{self.club.id}"}

    def test_template_puts_the_last_name_first_and_uses_fake_rows(self):
        self.client.force_authenticate(user=self.admin)
        french = self.client.get(
            "/api/club-data/import/template/",
            {"file_format": "xlsx", "locale": "fr"},
            **self.header,
        )
        self.assertEqual(french.status_code, 200, french.content[:300])
        book = load_workbook(io.BytesIO(french.content))
        self.assertEqual(book.sheetnames, ["members", "licences", "grades"])
        rows = list(book["members"].iter_rows(values_only=True))
        self.assertEqual(rows[0][1], "Nom")
        self.assertEqual(rows[0][2], "Prénom")
        self.assertEqual(rows[1][1], "last_name")
        self.assertEqual(rows[1][2], "first_name")
        self.assertIn("EXAMPLE", rows[2])
        self.assertIn("Ada", rows[2])
        self.assertNotIn(_lu("19711002130"), [cell for cell in rows[2]])

    def test_check_masks_the_number_and_a_dry_run_writes_nothing(self):
        self.client.force_authenticate(user=self.admin)
        number = _lu("19711002130")
        Member.objects.create(
            club=self.club,
            first_name="Ada",
            last_name="EXAMPLE",
            sex=Member.Sex.FEMALE,
            ltf_licenseid="LTF-EX-0001",
        )
        before = Member.objects.count()
        book = Workbook()
        sheet = book.active
        sheet.title = "members"
        sheet.append(["Last name", "First name", "LTF license ID", "Social security number", "Social security country"])
        sheet.append(["last_name", "first_name", "ltf_licenseid", "social_security_number", "social_security_country"])
        sheet.append(["EXAMPLE", "Ada", "LTF-EX-0001", number, "LU"])
        formula = book.create_sheet("grades")
        formula.append(["Member reference", "To grade", "Promotion date"])
        formula.append(["member_ref", "to_grade", "promotion_date"])
        formula.append(["LTF-EX-0001", "=9th Kup", "2026-03-01"])
        payload = io.BytesIO()
        book.save(payload)
        uploaded = SimpleUploadedFile(
            "club.xlsx",
            payload.getvalue(),
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        response = self.client.post("/api/club-data/import/", {"file": uploaded}, format="multipart", **self.header)
        self.assertEqual(response.status_code, 201, response.content[:400])
        self.assertEqual(response.data["sheets"][0]["fields"][1], "last_name")
        self.assertEqual(response.data["sheets"][0]["fields"][2], "first_name")
        self.assertLess(
            response.data["sheets"][0]["fields"].index("last_name"),
            response.data["sheets"][0]["fields"].index("first_name"),
        )
        body = json.dumps(response.data)
        self.assertNotIn(number, body)
        checked = self.client.post(
            f"/api/club-data/import/{response.data['id']}/check/",
            {"mapping": {}, "actions": {}},
            format="json",
            **self.header,
        )
        self.assertEqual(checked.status_code, 200, checked.content[:500])
        text = json.dumps(checked.data)
        self.assertNotIn(number, text)
        member_row = next(row for row in checked.data["rows"] if row["sheet"] == "members")
        self.assertEqual(member_row["preview"]["social_security_number"], MASKED_SOCIAL_SECURITY_NUMBER)
        self.assertEqual(member_row["action"], "update")
        self.assertIn("possible_duplicate", member_row["codes"])
        grade_row = next(row for row in checked.data["rows"] if row["sheet"] == "grades")
        self.assertEqual(grade_row["preview"]["to_grade"], "=9th Kup")
        self.assertIn("unknown_grade", grade_row["codes"])
        dry = self.client.post(
            f"/api/club-data/import/{response.data['id']}/dry-run/",
            {"mapping": {}},
            format="json",
            **self.header,
        )
        self.assertEqual(dry.status_code, 200, dry.content[:400])
        self.assertFalse(dry.data["saved"])
        self.assertTrue(dry.data["dry_run"])
        self.assertEqual(Member.objects.count(), before)
        audit = OpsAuditLog.objects.filter(action="data.import").latest("id")
        dumped = json.dumps(audit.metadata)
        self.assertNotIn(number, dumped)
        self.assertNotIn("EXAMPLE", audit.message)
        self.assertTrue(audit.metadata["numbers_included"])

    def test_missing_last_name_and_a_saved_mapping(self):
        self.client.force_authenticate(user=self.admin)
        saved = self.client.post(
            "/api/club-data/import/mappings/",
            {
                "name": "French file",
                "sheet": "members",
                "headers": ["Nom", "Prénom"],
                "mapping": {"Nom": "last_name", "Prénom": "first_name"},
            },
            format="json",
            **self.header,
        )
        self.assertEqual(saved.status_code, 201, saved.content)
        raw = "Nom,Prénom\n,Ada\n".encode()
        uploaded = SimpleUploadedFile("people.csv", raw, content_type="text/csv")
        response = self.client.post("/api/club-data/import/", {"file": uploaded}, format="multipart", **self.header)
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(response.data["sheets"][0]["saved"]["name"], "French file")
        self.assertEqual(response.data["sheets"][0]["suggested"]["Nom"], "last_name")
        checked = self.client.post(
            f"/api/club-data/import/{response.data['id']}/check/",
            {"mapping": response.data["sheets"][0]["suggested"] and {"members": response.data["sheets"][0]["suggested"]}},
            format="json",
            **self.header,
        )
        self.assertEqual(checked.status_code, 200, checked.content[:400])
        self.assertEqual(checked.data["rows"][0]["status"], "error")
        self.assertIn("missing_last_name", checked.data["rows"][0]["codes"])

    def test_refuses_a_coach_a_macro_and_a_zip_that_escapes(self):
        self.client.force_authenticate(user=self.coach)
        refused = self.client.get(
            "/api/club-data/import/template/",
            {"file_format": "xlsx"},
            HTTP_X_DESK=f"coach:{self.club.id}",
        )
        self.assertEqual(refused.status_code, 403)
        self.client.force_authenticate(user=self.admin)
        macro = SimpleUploadedFile("book.xlsm", b"PK", content_type="application/vnd.ms-excel.sheet.macroEnabled.12")
        blocked = self.client.post("/api/club-data/import/", {"file": macro}, format="multipart", **self.header)
        self.assertEqual(blocked.status_code, 400)
        nested = io.BytesIO()
        with zipfile.ZipFile(nested, "w") as archive:
            archive.writestr("../members.csv", "last_name\nEXAMPLE\n")
        slipped = SimpleUploadedFile("tables.zip", nested.getvalue(), content_type="application/zip")
        rejected = self.client.post("/api/club-data/import/", {"file": slipped}, format="multipart", **self.header)
        self.assertEqual(rejected.status_code, 400)
        with self.assertRaises(Exception) as raised:
            parse_upload(b"x" * (MAX_BYTES + 1), "csv")
        self.assertEqual(raised.exception.code, "too_large")
        self.assertEqual(MemberRecord.objects.count(), 0)
