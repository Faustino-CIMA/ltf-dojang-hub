import io
import json
import zipfile

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import SimpleTestCase, TestCase, override_settings
from openpyxl import Workbook, load_workbook
from rest_framework.test import APIClient

from accounts.models import User
from clubmgmt.models import MemberRecord
from clubs.models import Club
from members.club_data_import import MAX_BYTES, ImportFileError, parse_upload
from licenses.models import LicenseType
from members.models import GradePromotionHistory, Member
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
        self.assertEqual(book.sheetnames[0], "Mode d'emploi")
        self.assertEqual(book.sheetnames[1:], ["members", "licences", "grades"])
        self.assertGreater(book["members"].column_dimensions["A"].width or 0, 0)
        self.assertEqual(book["members"].freeze_panes, "A3")
        self.assertTrue(str(book["members"].auto_filter.ref).startswith("A2:"))
        rows = list(book["members"].iter_rows(values_only=True))
        flat = [cell for row in rows for cell in row]
        self.assertNotIn("usual_name", flat)
        self.assertNotIn("Nom usuel", flat)
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
        self.assertNotIn("usual_name", response.data["sheets"][0]["fields"])
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

    def test_club_named_sheets_are_named_when_the_file_is_empty(self):
        self.client.force_authenticate(user=self.admin)
        book = Workbook()
        book.active.title = "Example Club"
        book.create_sheet("Other Club")
        payload = io.BytesIO()
        book.save(payload)
        raw = payload.getvalue()
        with self.assertRaises(ImportFileError) as raised:
            parse_upload(raw, "xlsx")
        self.assertEqual(raised.exception.code, "empty_file")
        self.assertEqual(raised.exception.sheets, ["Example Club", "Other Club"])
        upload = SimpleUploadedFile(
            "clubs.xlsx",
            raw,
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        refused = self.client.post("/api/club-data/import/", {"file": upload}, format="multipart", **self.header)
        self.assertEqual(refused.status_code, 400)
        self.assertEqual(refused.data["detail"], "empty_file")
        self.assertEqual(refused.data["sheets"], ["Example Club", "Other Club"])

    @override_settings(CELERY_TASK_ALWAYS_EAGER=True, CELERY_TASK_EAGER_PROPAGATES=True)
    def test_commit_then_undo_keeps_the_grade_and_hides_the_number(self):
        self.client.force_authenticate(user=self.admin)
        number = _lu("19711002130")
        LicenseType.objects.create(name="Athlete", code="athlete-import")
        book = Workbook()
        members = book.active
        members.title = "members"
        members.append(["Last name", "First name", "LTF license ID", "Social security number"])
        members.append(["last_name", "first_name", "ltf_licenseid", "social_security_number"])
        members.append(["EXAMPLE", "Noor", "LTF-EX-0099", number])
        grades = book.create_sheet("grades")
        grades.append(["Member reference", "From grade", "To grade", "Promotion date"])
        grades.append(["member_ref", "from_grade", "to_grade", "promotion_date"])
        grades.append(["LTF-EX-0099", "10th Kup", "9th Kup", "2026-03-01"])
        payload = io.BytesIO()
        book.save(payload)
        uploaded = SimpleUploadedFile(
            "people.xlsx",
            payload.getvalue(),
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        stored = self.client.post("/api/club-data/import/", {"file": uploaded}, format="multipart", **self.header)
        self.assertEqual(stored.status_code, 201, stored.content[:400])
        refused = self.client.post(
            f"/api/club-data/import/{stored.data['id']}/commit/",
            {"mapping": {"members": {"Last name": "ignore"}}},
            format="json",
            **self.header,
        )
        self.assertEqual(refused.status_code, 400)
        self.assertEqual(Member.objects.filter(last_name="EXAMPLE").count(), 0)
        committed = self.client.post(
            f"/api/club-data/import/{stored.data['id']}/commit/",
            {"mapping": {}},
            format="json",
            **self.header,
        )
        self.assertEqual(committed.status_code, 202, committed.content[:500])
        self.assertEqual(committed.data["status"], "succeeded")
        self.assertGreaterEqual(committed.data["rows_done"], 1)
        self.assertTrue(committed.data["grades_not_undone"])
        body = json.dumps(committed.data)
        self.assertNotIn(number, body)
        person = Member.objects.get(ltf_licenseid="LTF-EX-0099")
        self.assertTrue(GradePromotionHistory.objects.filter(member=person, to_grade="9th Kup").exists())
        result = self.client.get(
            f"/api/club-data/import/batches/{committed.data['id']}/result/?file_format=json",
            **self.header,
        )
        self.assertEqual(result.status_code, 200)
        self.assertNotIn(number, result.content.decode())
        wrong = self.client.post(
            f"/api/club-data/import/batches/{committed.data['id']}/undo/",
            {"batch_id": "0"},
            format="json",
            **self.header,
        )
        self.assertEqual(wrong.status_code, 400)
        undone = self.client.post(
            f"/api/club-data/import/batches/{committed.data['id']}/undo/",
            {"batch_id": str(committed.data["id"])},
            format="json",
            **self.header,
        )
        self.assertEqual(undone.status_code, 200, undone.content[:400])
        self.assertTrue(undone.data["undone"])
        self.assertGreaterEqual(undone.data["grades_kept"], 1)
        self.assertTrue(Member.objects.filter(pk=person.id).exists())
        self.assertTrue(GradePromotionHistory.objects.filter(member=person, to_grade="9th Kup").exists())
        audit = OpsAuditLog.objects.filter(action="data.import", metadata__phase="undo").latest("id")
        self.assertNotIn(number, json.dumps(audit.metadata))
        self.assertNotIn(number, audit.message)


class ClubDataDateGoldenTests(SimpleTestCase):
    def test_the_golden_club_data_date_table(self):
        from members.club_data_import import _parse_date

        rows = (
            ("2026-11-29", "2026-11-29", None),
            ("21/11/2026", "2026-11-21", None),
            ("21.11.2026", "2026-11-21", None),
            ("01/02/2026", "2026-02-01", "ambiguous_date"),
            ("", "", None),
            ("not-a-date", "", "bad_date"),
        )
        for raw, stored, code in rows:
            self.assertEqual(_parse_date(raw), (stored, code), raw)
