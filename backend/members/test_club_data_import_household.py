import json
from decimal import Decimal

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from accounts.models import User
from clubmgmt.models import Family, FamilyMember, FamilyRebateRule, MemberContact, MemberEmail, Person
from clubs.models import Club
from members.club_data_import import suggest_field
from members.models import Member
from members.test_verification import _open_grace
from modules.codes import build_payload, sign_payload
from modules.entitlements import install_id_str, redeem_product_code, set_club_assignment
from modules.registry import CLUB_MANAGEMENT_MODULE_ID


def _file(body: dict) -> SimpleUploadedFile:
    return SimpleUploadedFile("household.json", json.dumps(body).encode(), content_type="application/json")


def _body() -> dict:
    return {
        "members": [
            {
                "member_ref": "m-0001",
                "last_name": "EXAMPLE",
                "first_name": "Ada",
                "sex": "F",
                "date_of_birth": "1990-01-02",
                "ltf_licenseid": "LTF-EX-0001",
                "emails": [{"email": "ada@example.test", "use_for_invoice": "true"}],
                "phones": [{"number": "+352621000000", "label": "mobile"}],
                "addresses": [
                    {
                        "street": "Rue Factice",
                        "house_number": "12",
                        "postal_code": "1234",
                        "locality": "Musterstadt",
                        "country": "LU",
                        "use_for_invoice": "true",
                    }
                ],
                "contacts": [
                    {"person_ref": "p-0001", "relation": "mother", "is_emergency": "true", "is_primary": "true"}
                ],
            }
        ],
        "people": [
            {
                "person_ref": "p-0001",
                "last_name": "EXAMPLE",
                "first_name": "Noor",
                "sex": "F",
                "emails": [{"email": "noor@example.test", "use_for_invoice": "false"}],
                "phones": [{"number": "+352621000001", "label": "mobile"}],
            }
        ],
        "families": [
            {
                "family_ref": "f-0001",
                "name": "EXAMPLE household",
                "invoice_member_ref": "m-0001",
                "bill_to_person_ref": "p-0001",
                "delivery": "email",
                "members": [{"member_ref": "m-0001", "sort_order": "1"}],
            }
        ],
        "rebate_rules": [
            {"member_rank": "2", "percent_off": "10.00", "amount_off": "", "applies_to_later": "true"}
        ],
    }


@override_settings(
    DEBUG=True,
    MODULE_CODE_PUBLIC_KEY="",
    MODULE_CODE_PRIVATE_KEY="",
    CELERY_TASK_ALWAYS_EAGER=True,
    CELERY_TASK_EAGER_PROPAGATES=True,
)
class HouseholdImportTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_user(username="house-import", password="pass12345", role=User.Roles.CLUB_ADMIN)
        self.ltf = User.objects.create_user(username="house-ltf", password="pass12345", role=User.Roles.LTF_ADMIN)
        _open_grace(self.admin, self.ltf)
        self.club = Club.objects.create(name="Example Club", city="Luxembourg", created_by=self.admin)
        self.club.admins.add(self.admin)
        self.member = Member.objects.create(
            club=self.club,
            first_name="Ada",
            last_name="EXAMPLE",
            sex=Member.Sex.FEMALE,
            ltf_licenseid="LTF-EX-0001",
        )
        token = sign_payload(build_payload(module_ids=[CLUB_MANAGEMENT_MODULE_ID], install_id=install_id_str()))
        redeem_product_code(token)
        set_club_assignment(club=self.club, module_id=CLUB_MANAGEMENT_MODULE_ID, enabled=True, user=self.ltf)
        self.header = {"HTTP_X_DESK": f"club_admin:{self.club.id}"}
        self.client.force_authenticate(user=self.admin)

    def test_a_household_file_is_saved_and_can_be_undone(self):
        self.assertEqual(suggest_field("members", "usual_name"), "ignore")
        self.assertEqual(suggest_field("members", "Preferred name"), "ignore")
        uploaded = self.client.post(
            "/api/club-data/import/",
            {"file": _file(_body())},
            format="multipart",
            **self.header,
        )
        self.assertEqual(uploaded.status_code, 201, uploaded.content[:400])
        checked = self.client.post(
            f"/api/club-data/import/{uploaded.data['id']}/dry-run/",
            {"mapping": {}, "actions": {}},
            format="json",
            **self.header,
        )
        self.assertEqual(checked.status_code, 200, checked.content[:500])
        self.assertEqual(checked.data["counts"]["error"], 0, checked.data["rows"])
        self.assertGreater(checked.data["counts"]["create"], 0)
        self.assertEqual(MemberEmail.objects.count(), 0)
        committed = self.client.post(
            f"/api/club-data/import/{uploaded.data['id']}/commit/",
            {"mapping": {}, "actions": {}},
            format="json",
            **self.header,
        )
        self.assertEqual(committed.status_code, 202, committed.content[:400])
        self.assertEqual(committed.data["status"], "succeeded", committed.data)
        self.assertTrue(MemberEmail.objects.filter(member=self.member, email="ada@example.test", use_for_invoice=True).exists())
        contact = MemberContact.objects.get(member=self.member)
        self.assertEqual(contact.relation, "mother")
        self.assertTrue(contact.is_emergency)
        self.assertEqual(contact.person.first_name, "Noor")
        family = Family.objects.get(club=self.club, name="EXAMPLE household")
        self.assertEqual(family.bill_to_person_id, contact.person_id)
        self.assertEqual(FamilyMember.objects.get(family=family).sort_order, 1)
        self.assertEqual(FamilyRebateRule.objects.get(club=self.club).percent_off, Decimal("10.00"))
        undone = self.client.post(
            f"/api/club-data/import/batches/{committed.data['id']}/undo/",
            {"batch_id": str(committed.data["id"])},
            format="json",
            **self.header,
        )
        self.assertEqual(undone.status_code, 200, undone.content[:300])
        self.assertEqual(MemberEmail.objects.filter(member=self.member).count(), 0)
        self.assertEqual(MemberContact.objects.filter(member=self.member).count(), 0)
        self.assertFalse(Family.objects.filter(club=self.club).exists())
        self.assertFalse(Person.objects.filter(club=self.club).exists())

    def test_without_club_management_the_household_sheets_are_skipped(self):
        set_club_assignment(club=self.club, module_id=CLUB_MANAGEMENT_MODULE_ID, enabled=False, user=self.ltf)
        uploaded = self.client.post(
            "/api/club-data/import/",
            {"file": _file(_body())},
            format="multipart",
            **self.header,
        )
        self.assertEqual(uploaded.status_code, 201, uploaded.content[:300])
        checked = self.client.post(
            f"/api/club-data/import/{uploaded.data['id']}/check/",
            {"mapping": {}, "actions": {}},
            format="json",
            **self.header,
        )
        self.assertEqual(checked.status_code, 200, checked.content[:400])
        self.assertIn("families", [item["sheet"] for item in checked.data["warnings"]])
        self.assertFalse(any(row["sheet"] == "families" for row in checked.data["rows"]))
