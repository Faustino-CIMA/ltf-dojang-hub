import io
import json
import zipfile
from decimal import Decimal

from django.test import TestCase, override_settings
from openpyxl import load_workbook
from rest_framework.test import APIClient

from accounts.models import User
from clubmgmt.models import (
    Family,
    FamilyMember,
    FamilyRebateRule,
    MemberContact,
    MemberEmail,
    MemberPhone,
    MemberRecord,
    Person,
    PersonAddress,
    PersonEmail,
    PersonPhone,
)
from clubs.models import Club
from members.models import Member
from members.ssn_countries import luxembourg_check_digits
from members.test_verification import _open_grace
from modules.codes import build_payload, sign_payload
from modules.entitlements import install_id_str, redeem_product_code, set_club_assignment
from modules.registry import CLUB_MANAGEMENT_MODULE_ID
from ops.models import OpsAuditLog


def _lu(body: str) -> str:
    return body + luxembourg_check_digits(body)


@override_settings(DEBUG=True, MODULE_CODE_PUBLIC_KEY="", MODULE_CODE_PRIVATE_KEY="")
class HouseholdExportTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_user(username="house-admin", password="pass12345", role=User.Roles.CLUB_ADMIN)
        self.coach = User.objects.create_user(username="house-coach", password="pass12345", role=User.Roles.COACH)
        self.ltf = User.objects.create_user(username="house-ltf", password="pass12345", role=User.Roles.LTF_ADMIN)
        _open_grace(self.admin, self.coach, self.ltf)
        self.club = Club.objects.create(name="Example Club", city="Luxembourg", address="1 Road", created_by=self.admin)
        self.club.admins.add(self.admin)
        self.club.trainers.add(self.coach)
        token = sign_payload(build_payload(module_ids=[CLUB_MANAGEMENT_MODULE_ID], install_id=install_id_str()))
        redeem_product_code(token)
        set_club_assignment(club=self.club, module_id=CLUB_MANAGEMENT_MODULE_ID, enabled=True, user=self.ltf)
        self.ada = Member.objects.create(
            club=self.club,
            first_name="Ada",
            last_name="EXAMPLE",
            sex=Member.Sex.FEMALE,
            ltf_licenseid="LTF-FAM-1",
            email="ada@example.test",
        )
        self.ben = Member.objects.create(
            club=self.club,
            first_name="Ben",
            last_name="EXAMPLE",
            sex=Member.Sex.MALE,
            ltf_licenseid="LTF-FAM-2",
        )
        MemberRecord.objects.create(
            member=self.ada,
            social_security_number=_lu("19711002130"),
            social_security_country="LU",
            medical_notes="clinic secret",
        )
        MemberEmail.objects.create(member=self.ada, email="ada@family.example.test", use_for_invoice=True)
        MemberPhone.objects.create(member=self.ada, number="+352621000111", label="mobile")
        self.mother = Person.objects.create(
            club=self.club, first_name="Noor", last_name="EXAMPLE", sex=Person.Sex.FEMALE
        )
        PersonEmail.objects.create(person=self.mother, email="noor@example.test", use_for_invoice=True)
        PersonPhone.objects.create(person=self.mother, number="+352621000000", label="mobile")
        PersonAddress.objects.create(
            person=self.mother,
            street="1 Example Road",
            house_number="1",
            postal_code="1234",
            locality="Luxembourg",
            country="LU",
        )
        for child, primary in ((self.ada, True), (self.ben, True)):
            MemberContact.objects.create(
                member=child,
                person=self.mother,
                relation=MemberContact.Relation.MOTHER,
                is_emergency=True,
                is_primary=primary,
            )
        self.family = Family.objects.create(
            club=self.club,
            name="EXAMPLE household",
            bill_to_person=self.mother,
            bill_to_delivery="email",
        )
        FamilyMember.objects.create(family=self.family, member=self.ada, sort_order=1)
        FamilyMember.objects.create(family=self.family, member=self.ben, sort_order=2)
        FamilyRebateRule.objects.create(
            club=self.club,
            member_rank=2,
            percent_off=Decimal("10.00"),
            applies_to_later=False,
        )
        self.other = Club.objects.create(name="Other Club", city="Esch", address="2 Road", created_by=self.admin)
        stranger = Person.objects.create(club=self.other, first_name="Hidden", last_name="PERSON", sex=Person.Sex.FEMALE)
        PersonEmail.objects.create(person=stranger, email="hidden@example.test")
        self.header = {"HTTP_X_DESK": f"club_admin:{self.club.id}"}
        self.sheets = ["members", "emails", "contacts", "families"]

    def test_one_file_keeps_the_links_and_writes_each_person_once(self):
        self.client.force_authenticate(user=self.admin)
        summary = self.client.get("/api/club-data/export/", **self.header)
        self.assertTrue(summary.data["club_management"])
        exported = self.client.post(
            "/api/club-data/export/",
            {"sheets": self.sheets, "format": "json", "locale": "en"},
            format="json",
            **self.header,
        )
        self.assertEqual(exported.status_code, 200, exported.content[:400])
        body = json.loads(exported.content)
        self.assertEqual(len(body["people"]), 1)
        person = body["people"][0]
        self.assertEqual([person["last_name"], person["first_name"]], ["EXAMPLE", "Noor"])
        self.assertEqual(person["phones"][0]["number"], "+352621000000")
        self.assertNotIn("clinic secret", exported.content.decode())
        self.assertNotIn(_lu("19711002130"), exported.content.decode())
        self.assertNotIn("hidden@example.test", exported.content.decode())
        family = body["families"][0]
        self.assertEqual(family["name"], "EXAMPLE household")
        self.assertEqual(family["bill_to_person_ref"], person["person_ref"])
        self.assertEqual(
            [(row["first_name"], row["sort_order"]) for row in family["members"]],
            [("Ada", "1"), ("Ben", "2")],
        )
        contact_refs = [
            row["person_ref"]
            for member in body["members"]
            for row in member.get("contacts", [])
        ]
        self.assertEqual(contact_refs, [person["person_ref"], person["person_ref"]])
        self.assertEqual(body["rebate_rules"][0]["member_rank"], "2")
        self.assertEqual(body["rebate_rules"][0]["percent_off"], "10.00")
        ada = next(row for row in body["members"] if row["member_ref"] == "LTF-FAM-1")
        self.assertEqual(ada["emails"][0]["email"], "ada@family.example.test")
        self.assertNotIn("medical_notes", exported.content.decode())

        book_response = self.client.post(
            "/api/club-data/export/",
            {"sheets": self.sheets, "format": "xlsx", "locale": "en"},
            format="json",
            **self.header,
        )
        book = load_workbook(io.BytesIO(book_response.content))
        self.assertIn("people", book.sheetnames)
        self.assertIn("families", book.sheetnames)
        self.assertIn("family_members", book.sheetnames)
        self.assertIn("rebate_rules", book.sheetnames)
        self.assertNotIn("medical_checkups", book.sheetnames)
        people_rows = list(book["people"].iter_rows(values_only=True))
        self.assertEqual(list(people_rows[1][:3]), ["person_ref", "last_name", "first_name"])
        self.assertEqual(len(people_rows), 3)
        self.assertEqual(people_rows[2][1], "EXAMPLE")
        self.assertEqual(people_rows[2][2], "Noor")

        zipped = self.client.post(
            "/api/club-data/export/",
            {"sheets": self.sheets, "format": "csv", "locale": "en"},
            format="json",
            **self.header,
        )
        with zipfile.ZipFile(io.BytesIO(zipped.content)) as archive:
            people_csv = archive.read("people.csv").decode()
            self.assertEqual(people_csv.count("Noor"), 1)
            self.assertIn("family_members.csv,family_members,2", archive.read("manifest.csv").decode())
            self.assertIn("+352621000000", archive.read("person_phones.csv").decode())

        audit = OpsAuditLog.objects.filter(action="data.export", target_id=str(self.club.id)).latest("id")
        self.assertTrue(audit.metadata["contacts_included"])
        stored = json.dumps(audit.metadata)
        self.assertNotIn("+352621000000", stored)
        self.assertNotIn("clinic secret", stored)
        self.assertNotIn(_lu("19711002130"), stored)

    @override_settings(CELERY_TASK_ALWAYS_EAGER=True, CELERY_TASK_EAGER_PROPAGATES=True)
    def test_the_pdf_has_one_heading_per_family_and_the_last_name_first(self):
        self.client.force_authenticate(user=self.admin)
        queued = self.client.post(
            "/api/club-data/export/",
            {"sheets": self.sheets, "format": "pdf", "locale": "en"},
            format="json",
            **self.header,
        )
        self.assertEqual(queued.status_code, 202, queued.content)
        report = self.client.get(f"/api/club-data/export/jobs/{queued.json()['id']}/file/", **self.header)
        payload = b"".join(report.streaming_content)
        self.assertTrue(payload.startswith(b"%PDF"))
        from pypdf import PdfReader

        text = "\n".join(page.extract_text() or "" for page in PdfReader(io.BytesIO(payload)).pages)
        self.assertIn("EXAMPLE household", text)
        self.assertLess(text.index("EXAMPLE household"), text.index("EXAMPLE Ada"))
        self.assertIn("EXAMPLE Ben", text)
        self.assertIn("EXAMPLE Noor", text)
        self.assertNotIn("Ada EXAMPLE", text)
        self.assertNotIn("Noor EXAMPLE", text)
        self.assertIn("Mother", text)
        self.assertIn("10.00%", text)
        self.assertNotIn("clinic secret", text)
        self.assertNotIn(_lu("19711002130"), text)
        self.assertEqual(text.count("EXAMPLE household"), 1)

    def test_without_club_management_the_household_is_refused(self):
        quiet = Club.objects.create(name="Quiet Club", city="Esch", address="3 Road", created_by=self.admin)
        quiet.admins.add(self.admin)
        self.client.force_authenticate(user=self.admin)
        refused = self.client.post(
            "/api/club-data/export/",
            {"sheets": ["families"], "format": "json", "locale": "en"},
            format="json",
            HTTP_X_DESK=f"club_admin:{quiet.id}",
        )
        self.assertEqual(refused.status_code, 403)
        self.assertIn("Club management", refused.data["detail"])
        self.client.force_authenticate(user=self.coach)
        coach = self.client.post(
            "/api/club-data/export/",
            {"sheets": self.sheets, "format": "json"},
            format="json",
            HTTP_X_DESK=f"coach:{self.club.id}",
        )
        self.assertEqual(coach.status_code, 403)
        plain = APIClient()
        plain.force_authenticate(user=self.admin)
        members_only = plain.post(
            "/api/club-data/export/",
            {"sheets": ["members"], "format": "xlsx", "locale": "en"},
            format="json",
            **self.header,
        )
        book = load_workbook(io.BytesIO(members_only.content))
        self.assertEqual(book.sheetnames, ["members"])
        audit = OpsAuditLog.objects.filter(action="data.export").latest("id")
        self.assertFalse(audit.metadata["contacts_included"])
