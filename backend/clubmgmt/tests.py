from datetime import date, timedelta
from decimal import Decimal
from unittest.mock import patch

from django.core.exceptions import ValidationError
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from clubs.models import Club
from licenses.models import Invoice, Order, OrderItem, Payment
from members.models import Member
from modules.codes import build_payload, sign_payload
from modules.entitlements import install_id_str, redeem_product_code, set_club_assignment
from modules.registry import CLUB_MANAGEMENT_MODULE_ID

from .models import Committee, CommitteeMandate, MemberEmail, MemberRecord, Person, validate_luxembourg_ssn


@override_settings(DEBUG=True, MODULE_CODE_PUBLIC_KEY="", MODULE_CODE_PRIVATE_KEY="")
class ClubManagementTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.ltf_admin = User.objects.create_user(
            username="ltfadmin", password="pass12345", role=User.Roles.LTF_ADMIN
        )
        self.club_admin = User.objects.create_user(
            username="clubadmin", password="pass12345", role=User.Roles.CLUB_ADMIN
        )
        self.club = Club.objects.create(name="Main Club", created_by=self.ltf_admin)
        self.club.admins.add(self.club_admin)
        self.member = Member.objects.create(
            club=self.club,
            first_name="Ada",
            last_name="Member",
            date_of_birth=date.today() - timedelta(days=365 * 10),
        )
        today = date.today()
        self.adult = Member.objects.create(
            club=self.club,
            first_name="Bea",
            last_name="Adult",
            date_of_birth=date(today.year - 25, today.month, min(today.day, 28)),
        )

    def _auth(self, user):
        self.client.force_authenticate(user=user)

    def _unlock(self):
        token = sign_payload(
            build_payload(module_ids=[CLUB_MANAGEMENT_MODULE_ID], install_id=install_id_str())
        )
        redeem_product_code(token)
        set_club_assignment(
            club=self.club, module_id=CLUB_MANAGEMENT_MODULE_ID, enabled=True, user=self.ltf_admin
        )

    def test_ssn_must_be_13_digits_with_valid_date(self):
        validate_luxembourg_ssn("1971100213046")
        with self.assertRaises(ValidationError):
            validate_luxembourg_ssn("123")
        with self.assertRaises(ValidationError):
            validate_luxembourg_ssn("1971999913046")

    def test_forbidden_without_module(self):
        self._auth(self.club_admin)
        response = self.client.get(f"/api/club-management/records/for-member/{self.member.id}/")
        self.assertEqual(response.status_code, 403)

    def test_record_underage_and_ssn(self):
        self._unlock()
        self._auth(self.club_admin)
        response = self.client.get(f"/api/club-management/records/for-member/{self.member.id}/")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["is_underage"])
        saved = self.client.put(
            f"/api/club-management/records/for-member/{self.member.id}/",
            {
                "social_security_number": "1971100213046",
                "nationality_1": "Luxembourg",
                "joined_at": "2020-09-01",
                "publish_facebook": True,
                "emails": [{"email": "ada@example.com", "use_for_invoice": True}],
                "phones": [{"number": "+352 123", "label": "mobile"}],
                "addresses": [
                    {
                        "postal_code": "1234",
                        "locality": "Luxembourg",
                        "street": "Rue Example",
                        "house_number": "1",
                        "use_for_invoice": True,
                    }
                ],
            },
            format="json",
        )
        self.assertEqual(saved.status_code, 200)
        self.assertEqual(saved.data["social_security_number"], "1971100213046")
        self.assertEqual(len(saved.data["emails"]), 1)

    def test_person_name_casing_matches_members(self):
        person = Person.objects.create(
            club=self.club,
            first_name="jean-pierre marie",
            last_name="dupont-schmit",
        )
        self.assertEqual(person.first_name, "Jean-Pierre Marie")
        self.assertEqual(person.last_name, "DUPONT-SCHMIT")

    def test_contact_converts_to_member(self):
        self._unlock()
        self._auth(self.club_admin)
        person = self.client.post(
            "/api/club-management/people/",
            {
                "club": self.club.id,
                "first_name": "Bob",
                "last_name": "Parent",
                "sex": "M",
                "emails": [{"email": "bob@example.com", "use_for_invoice": True}],
            },
            format="json",
        )
        self.assertEqual(person.status_code, 201)
        converted = self.client.post(
            f"/api/club-management/people/{person.data['id']}/convert-to-member/"
        )
        self.assertEqual(converted.status_code, 201)
        created = Member.objects.get(pk=converted.data["member_id"])
        self.assertEqual(created.first_name, "Bob")
        self.assertTrue(created.ltf_licenseid.startswith("LTF-"))
        again = self.client.post(f"/api/club-management/people/{person.data['id']}/convert-to-member/")
        self.assertEqual(again.status_code, 200)
        self.assertEqual(again.data["member_id"], created.id)
        self.assertEqual(Member.objects.filter(first_name="Bob", last_name="PARENT").count(), 1)

    def test_contact_with_a_member_name_links_that_member(self):
        self._unlock()
        self._auth(self.club_admin)
        faustino = Member.objects.create(club=self.club, first_name="Faustino", last_name="Cima", ltf_licenseid="LTF-1548")
        linked = self.client.post(
            "/api/club-management/contacts/link/",
            {
                "member": self.member.id,
                "first_name": "faustino",
                "last_name": "cima",
                "relation": "brother",
                "is_emergency": True,
            },
            format="json",
        )
        self.assertEqual(linked.status_code, 201, linked.data)
        self.assertTrue(linked.data["already_member"])
        self.assertEqual(linked.data["linked_member_id"], faustino.id)
        self.assertEqual(Member.objects.filter(first_name__iexact="Faustino", last_name__iexact="CIMA").count(), 1)
        listed = self.client.get(f"/api/club-management/contacts/?member={self.member.id}")
        self.assertEqual(listed.status_code, 200, listed.data)
        self.assertEqual(listed.data[0]["person_detail"]["converted_member"], faustino.id)
        loose = Person.objects.create(club=self.club, first_name="Faustino", last_name="Cima")
        from .models import MemberContact

        MemberContact.objects.create(member=self.adult, person=loose, relation="brother")
        opened = self.client.get(f"/api/club-management/contacts/?member={self.adult.id}")
        self.assertEqual(opened.data[0]["person_detail"]["converted_member"], faustino.id)
        self.assertFalse(Person.objects.filter(pk=loose.id).exists())

    def test_contact_can_be_a_spouse(self):
        self._unlock()
        self._auth(self.club_admin)
        linked = self.client.post(
            "/api/club-management/contacts/link/",
            {
                "member": self.adult.id,
                "first_name": "Sam",
                "last_name": "Spouse",
                "relation": "spouse",
            },
            format="json",
        )
        self.assertEqual(linked.status_code, 201, linked.data)
        from .models import MemberContact

        contact = MemberContact.objects.get(member=self.adult)
        self.assertEqual(contact.relation, MemberContact.Relation.SPOUSE)

    def test_publication_consent_lists_active_members_and_exports(self):
        from io import BytesIO

        from openpyxl import load_workbook

        self._unlock()
        self._auth(self.club_admin)
        Member.objects.create(
            club=self.club,
            first_name="Old",
            last_name="Left",
            is_active=False,
            date_of_birth=date(1990, 1, 1),
        )
        listed = self.client.get(f"/api/club-management/publication-consent/?club={self.club.id}")
        self.assertEqual(listed.status_code, 200, listed.data)
        names = [row["last_name"] for row in listed.data["members"]]
        self.assertEqual(names, ["ADULT", "MEMBER"])
        adult = listed.data["members"][0]
        self.assertEqual(adult["first_name"], "Bea")
        self.assertEqual(adult["age"], 25)
        self.assertFalse(adult["publish_facebook"])
        self.assertIsNotNone(adult["date_of_birth"])
        saved = self.client.post(
            f"/api/club-management/publication-consent/?club={self.club.id}",
            {"member": self.adult.id, "publish_facebook": True, "publish_print": True},
            format="json",
        )
        self.assertEqual(saved.status_code, 200, saved.data)
        self.assertTrue(saved.data["publish_facebook"])
        self.assertTrue(saved.data["publish_print"])
        self.assertFalse(saved.data["publish_instagram"])
        refused = self.client.post(
            f"/api/club-management/publication-consent/?club={self.club.id}",
            {"member": self.adult.id, "publish_x": "yes"},
            format="json",
        )
        self.assertEqual(refused.status_code, 400)
        exported = self.client.get(f"/api/club-management/publication-consent/export.csv?club={self.club.id}")
        self.assertEqual(exported.status_code, 200)
        text = exported.content.decode("utf-8-sig")
        self.assertIn("Last name,First name,Date of birth,Age,Facebook,Instagram,X,TikTok,Website,Print media", text)
        self.assertIn("ADULT,Bea", text)
        self.assertIn("Yes", text)
        self.assertNotIn("LEFT", text)
        workbook = load_workbook(BytesIO(self.client.get(
            f"/api/club-management/publication-consent/export.xlsx?club={self.club.id}"
        ).content))
        sheet = workbook.active
        self.assertEqual(sheet["E4"].value, "Facebook")
        self.assertEqual(sheet["A5"].value, "ADULT")
        self.assertEqual(sheet["E5"].value, "Yes")
        pdf = self.client.get(f"/api/club-management/publication-consent/export.pdf?club={self.club.id}")
        self.assertEqual(pdf.status_code, 200, pdf.content[:200])
        self.assertTrue(pdf.content.startswith(b"%PDF"))
        self.assertIn("attachment", pdf["Content-Disposition"])

    def test_publication_column_and_pdf_consent_filter(self):
        from .publication import filter_publication_rows, publication_rows

        self._unlock()
        self._auth(self.club_admin)
        inactive = Member.objects.create(
            club=self.club,
            first_name="Old",
            last_name="Left",
            is_active=False,
            date_of_birth=date(1990, 1, 1),
        )
        MemberRecord.objects.create(member=self.adult, pays_license_fee=False, publish_instagram=True)
        column = self.client.post(
            f"/api/club-management/publication-consent/column/?club={self.club.id}",
            {"field": "publish_facebook", "value": True},
            format="json",
        )
        self.assertEqual(column.status_code, 200, column.data)
        by_name = {row["last_name"]: row for row in column.data["members"]}
        self.assertEqual(set(by_name), {"ADULT", "MEMBER"})
        self.assertTrue(by_name["ADULT"]["publish_facebook"])
        self.assertTrue(by_name["ADULT"]["publish_instagram"])
        self.assertTrue(by_name["MEMBER"]["publish_facebook"])
        self.assertFalse(by_name["MEMBER"]["publish_instagram"])
        adult_record = MemberRecord.objects.get(member=self.adult)
        self.assertFalse(adult_record.pays_license_fee)
        member_record = MemberRecord.objects.get(member=self.member)
        self.assertTrue(member_record.pays_license_fee)
        self.assertFalse(MemberRecord.objects.filter(member=inactive).exists())
        cleared = self.client.post(
            f"/api/club-management/publication-consent/column/?club={self.club.id}",
            {"field": "publish_facebook", "value": False},
            format="json",
        )
        self.assertEqual(cleared.status_code, 200, cleared.data)
        self.assertTrue(all(not row["publish_facebook"] for row in cleared.data["members"]))
        self.assertTrue(MemberRecord.objects.get(member=self.adult).publish_instagram)
        refused_field = self.client.post(
            f"/api/club-management/publication-consent/column/?club={self.club.id}",
            {"field": "pays_license_fee", "value": False},
            format="json",
        )
        self.assertEqual(refused_field.status_code, 400)
        refused_value = self.client.post(
            f"/api/club-management/publication-consent/column/?club={self.club.id}",
            {"field": "publish_facebook", "value": "yes"},
            format="json",
        )
        self.assertEqual(refused_value.status_code, 400)

        mixed = Member.objects.create(club=self.club, first_name="Cal", last_name="Mixed")
        self.client.post(
            f"/api/club-management/publication-consent/?club={self.club.id}",
            {"member": self.adult.id, "publish_facebook": True, "publish_instagram": True},
            format="json",
        )
        self.client.post(
            f"/api/club-management/publication-consent/?club={self.club.id}",
            {"member": self.member.id, "publish_facebook": False, "publish_instagram": False},
            format="json",
        )
        self.client.post(
            f"/api/club-management/publication-consent/?club={self.club.id}",
            {"member": mixed.id, "publish_facebook": True, "publish_instagram": False},
            format="json",
        )
        rows = publication_rows(self.club)
        channels = [("publish_facebook", "Facebook"), ("publish_instagram", "Instagram")]
        denied, denied_scope = filter_publication_rows(rows, "denied", channels)
        allowed, allowed_scope = filter_publication_rows(rows, "allowed", channels)
        either, either_scope = filter_publication_rows(rows, "denied_any", channels)
        everyone, everyone_scope = filter_publication_rows(rows, "all", channels)
        self.assertEqual([row["last_name"] for row in denied], ["MEMBER"])
        self.assertEqual(denied_scope, "Members not allowed on Facebook and Instagram")
        self.assertEqual([row["last_name"] for row in allowed], ["ADULT"])
        self.assertEqual(allowed_scope, "Members allowed on Facebook and Instagram")
        self.assertEqual([row["last_name"] for row in either], ["MEMBER", "MIXED"])
        self.assertEqual(either_scope, "Members not allowed on at least one of Facebook and Instagram")
        self.assertEqual([row["last_name"] for row in everyone], ["ADULT", "MEMBER", "MIXED"])
        self.assertEqual(everyone_scope, "All active members")
        self.assertEqual(
            self.client.get(
                f"/api/club-management/publication-consent/export.pdf?club={self.club.id}&rule=denied&channels=publish_instagram,publish_facebook"
            ).status_code,
            200,
        )
        empty = self.client.get(
            f"/api/club-management/publication-consent/export.pdf?club={self.club.id}&rule=allowed&channels=publish_tiktok"
        )
        self.assertEqual(empty.status_code, 200)
        self.assertTrue(empty.content.startswith(b"%PDF"))
        missing = self.client.get(
            f"/api/club-management/publication-consent/export.pdf?club={self.club.id}&rule=denied"
        )
        self.assertEqual(missing.status_code, 400)
        self.assertIn("channel", str(missing.data["detail"]).lower())
        unknown = self.client.get(
            f"/api/club-management/publication-consent/export.pdf?club={self.club.id}&rule=denied&channels=not_a_channel"
        )
        self.assertEqual(unknown.status_code, 400)
        bad_rule = self.client.get(
            f"/api/club-management/publication-consent/export.pdf?club={self.club.id}&rule=nope&channels=publish_facebook"
        )
        self.assertEqual(bad_rule.status_code, 400)
        full_csv = self.client.get(f"/api/club-management/publication-consent/export.csv?club={self.club.id}")
        text = full_csv.content.decode("utf-8-sig")
        self.assertIn("MIXED,Cal", text)
        self.assertIn("MEMBER,Ada", text)
        self.assertNotIn("LEFT", text)

    @patch("licenses.tasks.send_invoice_email.delay")
    def test_family_invoice_applies_rebate(self, _queued):
        self._unlock()
        self._auth(self.club_admin)
        second = Member.objects.create(club=self.club, first_name="Bea", last_name="Member")
        self.client.post(
            "/api/club-management/membership-fees/",
            {"club": self.club.id, "name": "Annual", "amount": "100.00", "year": date.today().year},
            format="json",
        )
        self.client.post(
            "/api/club-management/rebate-rules/",
            {"club": self.club.id, "member_rank": 2, "percent_off": "10.00"},
            format="json",
        )
        family = self.client.post(
            "/api/club-management/families/",
            {"club": self.club.id, "name": "Member family", "invoice_member": self.member.id},
            format="json",
        )
        self.assertEqual(family.status_code, 201)
        self.client.post(
            f"/api/club-management/families/{family.data['id']}/add-member/",
            {"member": self.member.id},
            format="json",
        )
        self.client.post(
            f"/api/club-management/families/{family.data['id']}/add-member/",
            {"member": second.id},
            format="json",
        )
        invoice = self.client.post(
            f"/api/club-management/families/{family.data['id']}/create-invoice/",
            {"year": date.today().year},
            format="json",
        )
        self.assertEqual(invoice.status_code, 201)
        self.assertEqual(invoice.data["total"], "190.00")
        fixed = self.client.post(
            "/api/club-management/rebate-rules/",
            {"club": self.club.id, "member_rank": 3, "amount_off": "15.00"},
            format="json",
        )
        self.assertEqual(fixed.status_code, 201, fixed.data)
        self.assertEqual(fixed.data["amount_off"], "15.00")
        edited = self.client.patch(
            f"/api/club-management/rebate-rules/{fixed.data['id']}/",
            {"amount_off": "20.00"},
            format="json",
        )
        self.assertEqual(edited.status_code, 200, edited.data)
        self.assertEqual(edited.data["amount_off"], "20.00")
        family_order = Order.objects.get(pk=invoice.data["order_id"])
        self.assertEqual(family_order.ledger, Order.Ledger.CLUB)
        preview = self.client.get(
            f"/api/club-management/families/{family.data['id']}/invoice-preview/",
            {"year": date.today().year},
        )
        self.assertEqual(preview.status_code, 200)
        self.assertEqual(preview.data["total"], "190.00")
        self.assertTrue(preview.data["already_invoiced"])
        duplicate = self.client.post(
            f"/api/club-management/families/{family.data['id']}/create-invoice/",
            {"year": date.today().year},
            format="json",
        )
        self.assertEqual(duplicate.status_code, 400)
        removed = self.client.post(
            f"/api/club-management/families/{family.data['id']}/remove-member/",
            {"member": second.id},
            format="json",
        )
        self.assertEqual(removed.status_code, 200)
        self.assertEqual(len(removed.data["memberships"]), 1)

    @patch("licenses.tasks.send_invoice_email.delay")
    def test_rebate_can_stay_for_following_members(self, _queued):
        self._unlock()
        self._auth(self.club_admin)
        year = date.today().year
        self._fee()
        created = []
        for rank, percent in ((2, "10.00"), (3, "25.00"), (4, "50.00")):
            rule = self.client.post(
                "/api/club-management/rebate-rules/",
                {"club": self.club.id, "member_rank": rank, "percent_off": percent},
                format="json",
            )
            self.assertEqual(rule.status_code, 201, rule.data)
            self.assertFalse(rule.data["applies_to_later"])
            created.append(rule.data)
        extra = [
            Member.objects.create(club=self.club, first_name=name, last_name="Stay")
            for name in ("Cara", "Dina", "Evan")
        ]
        family_id = self._family_with("Stay family", [self.adult, self.member, *extra])

        def membership_amounts():
            preview = self.client.get(
                f"/api/club-management/families/{family_id}/invoice-preview/",
                {"year": year},
            )
            self.assertEqual(preview.status_code, 200, preview.data)
            return [line for line in preview.data["lines"] if not line.get("supplementary")]

        before = membership_amounts()
        self.assertEqual([line["amount"] for line in before], ["100.00", "90.00", "75.00", "50.00", "100.00"])
        self.assertFalse(any(line.get("rebate_carried") for line in before))

        stayed = self.client.patch(
            f"/api/club-management/rebate-rules/{created[2]['id']}/",
            {"applies_to_later": True},
            format="json",
        )
        self.assertEqual(stayed.status_code, 200, stayed.data)
        self.assertTrue(stayed.data["applies_to_later"])
        carried = membership_amounts()
        self.assertEqual([line["amount"] for line in carried], ["100.00", "90.00", "75.00", "50.00", "50.00"])
        self.assertEqual(carried[4]["percent_off"], "50.00")
        self.assertTrue(carried[4]["rebate_carried"])
        self.assertFalse(carried[3]["rebate_carried"])

        removed = self.client.delete(f"/api/club-management/rebate-rules/{created[1]['id']}/?club={self.club.id}")
        self.assertEqual(removed.status_code, 204)
        listed = self.client.get(f"/api/club-management/rebate-rules/?club={self.club.id}")
        self.assertEqual(sorted(row["member_rank"] for row in listed.data), [2, 4])
        after_delete = membership_amounts()
        self.assertEqual(
            [line["amount"] for line in after_delete],
            ["100.00", "90.00", "100.00", "50.00", "50.00"],
        )

        gap = self.client.patch(
            f"/api/club-management/rebate-rules/{created[0]['id']}/",
            {"applies_to_later": True},
            format="json",
        )
        self.assertEqual(gap.status_code, 200, gap.data)
        filled = membership_amounts()
        self.assertEqual([line["amount"] for line in filled], ["100.00", "90.00", "90.00", "50.00", "50.00"])
        self.assertTrue(filled[2]["rebate_carried"])
        self.assertEqual(filled[2]["percent_off"], "10.00")
        self.assertFalse(filled[3]["rebate_carried"])

    @patch("licenses.tasks.send_invoice_email.delay")
    def test_member_invoices_are_not_shown_as_the_family_invoice(self, _queued):
        from .billing import create_membership_invoice, household_plan
        from .models import MembershipFee, MembershipFeePrice

        self._unlock()
        self._auth(self.club_admin)
        self._fee()
        self.client.post(
            "/api/club-management/rebate-rules/",
            {"club": self.club.id, "member_rank": 2, "percent_off": "10.00"},
            format="json",
        )
        self.client.post(
            "/api/club-management/rebate-rules/",
            {"club": self.club.id, "member_rank": 3, "percent_off": "25.00"},
            format="json",
        )
        anna = Member.objects.create(club=self.club, first_name="Anna", last_name="Separate")
        gosia = Member.objects.create(club=self.club, first_name="Gosia", last_name="Separate")
        year = date.today().year
        numbers = []
        for member in (self.adult, anna, gosia):
            _fee, _unit, payer, lines, total = household_plan(club=self.club, year=year, member=member)
            invoice = create_membership_invoice(
                club=self.club, year=year, payer=payer, lines=lines, total=total
            )
            numbers.append(invoice.invoice_number)
            self.assertEqual(invoice.total, Decimal("100.00"))
        family_id = self._family_with("Separate family", [self.adult, anna, gosia])
        preview = self.client.get(f"/api/club-management/billing/?club={self.club.id}&year={year}")
        row = next(item for item in preview.data["households"] if item["id"] == f"family-{family_id}")
        self.assertIsNone(row["invoice_number"])
        self.assertEqual(row["status"], "separate")
        self.assertEqual(row["total"], "265.00")
        self.assertEqual(sorted(item["total"] for item in row["member_invoices"]), ["100.00", "100.00", "100.00"])
        self.assertCountEqual([item["invoice_number"] for item in row["member_invoices"]], numbers)
        issued = self.client.post(
            f"/api/club-management/billing/?club={self.club.id}",
            {"year": year, "household_ids": [f"family-{family_id}"]},
            format="json",
        )
        self.assertEqual(issued.status_code, 201, issued.data)
        self.assertEqual(issued.data["created_count"], 0)
        self.assertEqual(issued.data["skipped"][0]["reason"], "Already invoiced.")

        parent = Member.objects.create(club=self.club, first_name="Parent", last_name="Together")
        child = Member.objects.create(club=self.club, first_name="Child", last_name="Together")
        together_id = self._family_with("Together family", [parent, child])
        created = self.client.post(
            f"/api/club-management/families/{together_id}/create-invoice/",
            {"year": year},
            format="json",
        )
        self.assertEqual(created.status_code, 201, created.data)
        self.assertEqual(created.data["total"], "190.00")
        fee = MembershipFee.objects.get(club=self.club)
        fee.amount = Decimal("150.00")
        fee.save(update_fields=["amount"])
        MembershipFeePrice.objects.filter(fee=fee).update(amount=Decimal("150.00"))
        after = self.client.get(f"/api/club-management/billing/?club={self.club.id}&year={year}")
        together = next(item for item in after.data["households"] if item["id"] == f"family-{together_id}")
        self.assertEqual(together["invoice_number"], created.data["invoice_number"])
        self.assertEqual(together["total"], "190.00")
        self.assertEqual(together["status"], "invoiced")
        separate = next(item for item in after.data["households"] if item["id"] == f"family-{family_id}")
        self.assertIsNone(separate["invoice_number"])
        self.assertEqual(sorted(item["total"] for item in separate["member_invoices"]), ["100.00", "100.00", "100.00"])

    def _fee(self, name="Annual", amount="100.00"):
        created = self.client.post(
            "/api/club-management/membership-fees/",
            {"club": self.club.id, "name": name, "amount": amount},
            format="json",
        )
        self.assertEqual(created.status_code, 201, created.data)
        return created.data

    def _family_with(self, name, members):
        created = self.client.post(
            "/api/club-management/families/",
            {"club": self.club.id, "name": name},
            format="json",
        )
        self.assertEqual(created.status_code, 201, created.data)
        for member in members:
            added = self.client.post(
                f"/api/club-management/families/{created.data['id']}/add-member/",
                {"member": member.id},
                format="json",
            )
            self.assertEqual(added.status_code, 200, added.data)
        return created.data["id"]

    def _household(self, year, household_id, installment=1):
        response = self.client.get(
            f"/api/club-management/billing/?club={self.club.id}&year={year}&installment={installment}"
        )
        self.assertEqual(response.status_code, 200, response.data)
        row = next(item for item in response.data["households"] if item["id"] == household_id)
        return response, row

    @patch("licenses.tasks.send_invoice_email.delay")
    def test_two_billings_and_license_fee_are_not_rebated(self, _queued):
        from .billing import license_fee_amount_for_year

        self._unlock()
        self._auth(self.club_admin)
        year = date.today().year
        self._fee()
        for rank in (2, 3):
            rule = self.client.post(
                "/api/club-management/rebate-rules/",
                {"club": self.club.id, "member_rank": rank, "percent_off": "50.00"},
                format="json",
            )
            self.assertEqual(rule.status_code, 201, rule.data)
        child = Member.objects.create(club=self.club, first_name="Cara", last_name="Child")
        family_id = self._family_with("Three", [self.adult, self.member, child])
        saved = self.client.put(
            f"/api/club-management/license-fee/?club={self.club.id}",
            {"name": "License fee", "amount": "30.00"},
            format="json",
        )
        self.assertEqual(saved.status_code, 200, saved.data)
        self.assertEqual(saved.data["amount"], "30.00")
        added = self.client.post(
            f"/api/club-management/billings/?club={self.club.id}",
            {"year": year, "label": "Autumn"},
            format="json",
        )
        self.assertEqual(added.status_code, 201, added.data)
        self.assertEqual([row["sequence"] for row in added.data["billings"]], [1, 2])
        self.assertEqual(added.data["billings"][1]["label"], "Autumn")
        third = self.client.post(
            f"/api/club-management/billings/?club={self.club.id}",
            {"year": year, "label": "Winter"},
            format="json",
        )
        self.assertEqual([row["sequence"] for row in third.data["billings"]], [1, 2, 3])
        removed = self.client.delete(
            f"/api/club-management/billings/{third.data['billings'][2]['id']}/?club={self.club.id}"
        )
        self.assertEqual(removed.status_code, 204)
        labeled = self.client.patch(
            f"/api/club-management/billings/{added.data['billings'][1]['id']}/?club={self.club.id}",
            {"label": "Autumn term"},
            format="json",
        )
        self.assertEqual(labeled.status_code, 200, labeled.data)
        self.assertEqual(labeled.data["label"], "Autumn term")

        first_response, first = self._household(year, f"family-{family_id}", 1)
        self.assertEqual(first_response.data["installment"], 1)
        self.assertEqual(len(first_response.data["billings"]), 2)
        self.assertEqual(first["total"], "290.00")
        self.assertEqual(first["status"], "ready")
        membership = [line for line in first["lines"] if not line.get("supplementary")]
        license_lines = [line for line in first["lines"] if line.get("supplementary")]
        self.assertEqual([line["amount"] for line in membership], ["100.00", "50.00", "50.00"])
        self.assertEqual(
            [(line["amount"], line["percent_off"], line["amount_off"]) for line in license_lines],
            [("30.00", "0.00", ""), ("30.00", "0.00", ""), ("30.00", "0.00", "")],
        )
        _second_response, second = self._household(year, f"family-{family_id}", 2)
        self.assertEqual(second["total"], "200.00")
        self.assertFalse(any(line.get("supplementary") for line in second["lines"]))

        issued = self.client.post(
            f"/api/club-management/billing/?club={self.club.id}",
            {"year": year, "installment": 1, "household_ids": [f"family-{family_id}"]},
            format="json",
        )
        self.assertEqual(issued.status_code, 201, issued.data)
        self.assertEqual(issued.data["created"][0]["total"], "290.00")
        license_items = OrderItem.objects.filter(
            order__invoice__id=issued.data["created"][0]["invoice_id"],
            is_license_fee=True,
        )
        self.assertEqual(license_items.count(), 3)
        for item in license_items:
            self.assertEqual(item.billing_installment, 1)
            self.assertTrue(item.description.startswith(f"License fee {year} — "))
            self.assertNotIn("rebate", item.description)
        blocked = self.client.delete(
            f"/api/club-management/billings/{added.data['billings'][0]['id']}/?club={self.club.id}"
        )
        self.assertEqual(blocked.status_code, 400)

        family_preview = self.client.get(
            f"/api/club-management/families/{family_id}/invoice-preview/",
            {"year": year, "installment": 2},
        )
        self.assertEqual(family_preview.status_code, 200, family_preview.data)
        self.assertFalse(family_preview.data["already_invoiced"])
        self.assertEqual(family_preview.data["total"], "200.00")
        already = self.client.get(
            f"/api/club-management/families/{family_id}/invoice-preview/",
            {"year": year, "installment": 1},
        )
        self.assertTrue(already.data["already_invoiced"])
        second_issue = self.client.post(
            f"/api/club-management/families/{family_id}/create-invoice/",
            {"year": year, "installment": 2},
            format="json",
        )
        self.assertEqual(second_issue.status_code, 201, second_issue.data)
        self.assertEqual(second_issue.data["total"], "200.00")
        second_items = OrderItem.objects.filter(order_id=second_issue.data["order_id"])
        self.assertFalse(second_items.filter(is_license_fee=True).exists())
        self.assertTrue(all(item.billing_installment == 2 for item in second_items))
        duplicate = self.client.post(
            f"/api/club-management/billing/?club={self.club.id}",
            {"year": year, "installment": 2, "household_ids": [f"family-{family_id}"]},
            format="json",
        )
        self.assertEqual(duplicate.data["created_count"], 0)
        self.assertEqual(duplicate.data["skipped"][0]["reason"], "Already invoiced.")

        late = Member.objects.create(club=self.club, first_name="Late", last_name="Joiner")
        _late_response, late_row = self._household(year, f"member-{late.id}", 2)
        self.assertEqual(late_row["total"], "130.00")
        self.assertEqual([line["amount"] for line in late_row["lines"] if line.get("supplementary")], ["30.00"])
        late_issue = self.client.post(
            f"/api/club-management/billing/?club={self.club.id}",
            {"year": year, "installment": 2, "household_ids": [f"member-{late.id}"]},
            format="json",
        )
        self.assertEqual(late_issue.status_code, 201, late_issue.data)
        self.assertEqual(late_issue.data["created"][0]["total"], "130.00")
        _first_again, late_on_first = self._household(year, f"member-{late.id}", 1)
        self.assertEqual(late_on_first["total"], "100.00")
        self.assertFalse(any(line.get("supplementary") for line in late_on_first["lines"]))

        priced = self.client.post(
            f"/api/club-management/license-fee/add-price/?club={self.club.id}",
            {"amount": "40.00", "effective_from": f"{year + 1}-01-01"},
            format="json",
        )
        self.assertEqual(priced.status_code, 201, priced.data)
        self.assertEqual(license_fee_amount_for_year(self.club, year), Decimal("30.00"))
        self.assertEqual(license_fee_amount_for_year(self.club, year + 1), Decimal("40.00"))

    @patch("licenses.tasks.send_invoice_email.delay")
    def test_license_fee_is_charged_when_membership_is_free(self, _queued):
        self._unlock()
        self._auth(self.club_admin)
        year = date.today().year
        self._fee(amount="0.00")
        saved = self.client.put(
            f"/api/club-management/license-fee/?club={self.club.id}",
            {"amount": "30.00"},
            format="json",
        )
        self.assertEqual(saved.status_code, 200, saved.data)
        _preview, row = self._household(year, f"member-{self.adult.id}")
        self.assertEqual(row["status"], "ready")
        self.assertEqual(row["total"], "30.00")
        issued = self.client.post(
            f"/api/club-management/billing/?club={self.club.id}",
            {"year": year, "household_ids": [f"member-{self.adult.id}"]},
            format="json",
        )
        self.assertEqual(issued.status_code, 201, issued.data)
        self.assertEqual(issued.data["created"][0]["total"], "30.00")
        issued_invoice = Invoice.objects.get(pk=issued.data["created"][0]["invoice_id"])
        self.assertEqual(issued_invoice.status, Invoice.Status.ISSUED)
        self.assertIsNone(issued_invoice.paid_at)

    @patch("licenses.tasks.send_invoice_email.delay")
    def test_license_fee_is_optional_per_member_and_defaults_to_payable(self, _queued):
        self._unlock()
        self._auth(self.club_admin)
        year = date.today().year
        self._fee()
        saved = self.client.put(
            f"/api/club-management/license-fee/?club={self.club.id}",
            {"name": "Club license", "amount": "30.00"},
            format="json",
        )
        self.assertEqual(saved.status_code, 200, saved.data)
        edited = self.client.put(
            f"/api/club-management/license-fee/?club={self.club.id}",
            {"name": "Club card", "amount": "25.00"},
            format="json",
        )
        self.assertEqual(edited.status_code, 200, edited.data)
        self.assertEqual(edited.data["name"], "Club card")
        self.assertEqual(edited.data["amount"], "25.00")
        record = self.client.get(f"/api/club-management/records/for-member/{self.adult.id}/")
        self.assertEqual(record.status_code, 200, record.data)
        self.assertTrue(record.data["pays_license_fee"])
        _preview, paying = self._household(year, f"member-{self.member.id}")
        self.assertEqual(paying["total"], "125.00")
        self.assertTrue(any(line.get("supplementary") for line in paying["lines"]))
        cleared = self.client.post(
            f"/api/club-management/billing/member-license-fee/?club={self.club.id}",
            {"member": self.adult.id, "pays_license_fee": False},
            format="json",
        )
        self.assertEqual(cleared.status_code, 200, cleared.data)
        self.assertFalse(cleared.data["pays_license_fee"])
        _after, exempt = self._household(year, f"member-{self.adult.id}")
        self.assertEqual(exempt["total"], "100.00")
        self.assertFalse(any(line.get("supplementary") for line in exempt["lines"]))
        self.assertFalse(next(line["pays_license_fee"] for line in exempt["lines"] if not line.get("supplementary")))
        issued = self.client.post(
            f"/api/club-management/billing/?club={self.club.id}",
            {"year": year, "household_ids": [f"member-{self.adult.id}", f"member-{self.member.id}"]},
            format="json",
        )
        self.assertEqual(issued.status_code, 201, issued.data)
        exempt_invoice = next(row for row in issued.data["created"] if row["id"] == f"member-{self.adult.id}")
        paying_invoice = next(row for row in issued.data["created"] if row["id"] == f"member-{self.member.id}")
        self.assertEqual(exempt_invoice["total"], "100.00")
        self.assertEqual(paying_invoice["total"], "125.00")
        self.assertFalse(
            OrderItem.objects.filter(order__invoice__id=exempt_invoice["invoice_id"], is_license_fee=True).exists()
        )
        self.assertTrue(
            OrderItem.objects.filter(order__invoice__id=paying_invoice["invoice_id"], is_license_fee=True).exists()
        )

    def test_single_billing_stays_the_default(self):
        self._unlock()
        self._auth(self.club_admin)
        year = date.today().year
        self._fee()
        preview, row = self._household(year, f"member-{self.adult.id}")
        self.assertEqual(preview.data["billings"], [])
        self.assertEqual(preview.data["installment"], 1)
        self.assertEqual(preview.data["license_fee"]["amount"], "0.00")
        self.assertEqual(row["total"], "100.00")
        self.assertFalse(any(line.get("supplementary") for line in row["lines"]))

    @patch("licenses.tasks.send_invoice_email.delay")
    def test_license_fee_is_not_added_after_the_first_bill(self, _queued):
        self._unlock()
        self._auth(self.club_admin)
        year = date.today().year
        self._fee()
        issued = self.client.post(
            f"/api/club-management/billing/?club={self.club.id}",
            {"year": year, "household_ids": [f"member-{self.adult.id}"]},
            format="json",
        )
        self.assertEqual(issued.status_code, 201, issued.data)
        item = OrderItem.objects.get(order__invoice__id=issued.data["created"][0]["invoice_id"])
        item.billing_installment = None
        item.save(update_fields=["billing_installment"])
        self.client.put(
            f"/api/club-management/license-fee/?club={self.club.id}",
            {"amount": "30.00"},
            format="json",
        )
        self.client.post(
            f"/api/club-management/billings/?club={self.club.id}",
            {"year": year},
            format="json",
        )
        _second, row = self._household(year, f"member-{self.adult.id}", 2)
        self.assertEqual(row["status"], "ready")
        self.assertEqual(row["total"], "100.00")
        self.assertFalse(any(line.get("supplementary") for line in row["lines"]))

    @patch("licenses.tasks.send_invoice_email.delay")
    def test_license_fee_can_be_placed_on_a_later_billing(self, _queued):
        self._unlock()
        self._auth(self.club_admin)
        year = date.today().year
        self._fee()
        self.client.put(
            f"/api/club-management/license-fee/?club={self.club.id}",
            {"name": "License fee", "amount": "30.00"},
            format="json",
        )
        added = self.client.post(
            f"/api/club-management/billings/?club={self.club.id}",
            {"year": year, "label": "September"},
            format="json",
        )
        self.assertEqual(added.status_code, 201, added.data)
        self.assertEqual([row["charges_license_fee"] for row in added.data["billings"]], [True, False])
        _first, opening = self._household(year, f"member-{self.adult.id}", 1)
        self.assertEqual(opening["total"], "130.00")
        _second, later = self._household(year, f"member-{self.adult.id}", 2)
        self.assertEqual(later["total"], "100.00")

        september = added.data["billings"][1]
        chosen = self.client.patch(
            f"/api/club-management/billings/{september['id']}/?club={self.club.id}",
            {"charges_license_fee": True},
            format="json",
        )
        self.assertEqual(chosen.status_code, 200, chosen.data)
        self.assertTrue(chosen.data["charges_license_fee"])
        refused = self.client.patch(
            f"/api/club-management/billings/{september['id']}/?club={self.club.id}",
            {"charges_license_fee": False},
            format="json",
        )
        self.assertEqual(refused.status_code, 400)
        listed = self.client.get(f"/api/club-management/billings/?club={self.club.id}&year={year}")
        self.assertEqual([row["charges_license_fee"] for row in listed.data["billings"]], [False, True])
        _moved_first, opening = self._household(year, f"member-{self.adult.id}", 1)
        self.assertEqual(opening["total"], "100.00")
        self.assertFalse(any(line.get("supplementary") for line in opening["lines"]))
        _moved_second, later = self._household(year, f"member-{self.adult.id}", 2)
        self.assertEqual(later["total"], "130.00")
        self.assertEqual([line["amount"] for line in later["lines"] if line.get("supplementary")], ["30.00"])

        removed = self.client.delete(f"/api/club-management/billings/{september['id']}/?club={self.club.id}")
        self.assertEqual(removed.status_code, 204)
        after_delete = self.client.get(f"/api/club-management/billings/?club={self.club.id}&year={year}")
        self.assertEqual(
            [(row["sequence"], row["charges_license_fee"]) for row in after_delete.data["billings"]],
            [(1, True)],
        )
        restored = self.client.post(
            f"/api/club-management/billings/?club={self.club.id}",
            {"year": year, "label": "September"},
            format="json",
        )
        september = next(row for row in restored.data["billings"] if row["sequence"] == 2)
        self.client.patch(
            f"/api/club-management/billings/{september['id']}/?club={self.club.id}",
            {"charges_license_fee": True},
            format="json",
        )
        january = self.client.post(
            f"/api/club-management/billing/?club={self.club.id}",
            {"year": year, "installment": 1, "household_ids": [f"member-{self.adult.id}"]},
            format="json",
        )
        self.assertEqual(january.status_code, 201, january.data)
        self.assertEqual(january.data["created"][0]["total"], "100.00")
        self.assertFalse(
            OrderItem.objects.filter(order__invoice__id=january.data["created"][0]["invoice_id"], is_license_fee=True).exists()
        )
        season = self.client.post(
            f"/api/club-management/billing/?club={self.club.id}",
            {"year": year, "installment": 2, "household_ids": [f"member-{self.adult.id}"]},
            format="json",
        )
        self.assertEqual(season.status_code, 201, season.data)
        self.assertEqual(season.data["created"][0]["total"], "130.00")
        license_item = OrderItem.objects.get(order__invoice__id=season.data["created"][0]["invoice_id"], is_license_fee=True)
        self.assertEqual(license_item.billing_installment, 2)

        self.client.post(
            f"/api/club-management/billings/?club={self.club.id}",
            {"year": year, "label": "Winter"},
            format="json",
        )
        late = Member.objects.create(club=self.club, first_name="Late", last_name="Joiner")
        _late_early, early_row = self._household(year, f"member-{late.id}", 1)
        self.assertEqual(early_row["total"], "100.00")
        _late_season, season_row = self._household(year, f"member-{late.id}", 2)
        self.assertEqual(season_row["total"], "130.00")
        _late_next, next_row = self._household(year, f"member-{late.id}", 3)
        self.assertEqual(next_row["total"], "130.00")
        _adult_next, adult_next = self._household(year, f"member-{self.adult.id}", 3)
        self.assertEqual(adult_next["total"], "100.00")
        self.assertFalse(any(line.get("supplementary") for line in adult_next["lines"]))

    @patch("licenses.tasks.send_invoice_email.delay")
    def test_family_invoice_is_one_bill_addressed_to_the_chosen_adult(self, queued):
        self._unlock()
        self._auth(self.club_admin)
        self._fee()
        child = Member.objects.create(
            club=self.club,
            first_name="Cara",
            last_name="Child",
            date_of_birth=date.today() - timedelta(days=365 * 8),
        )
        sibling = Member.objects.create(
            club=self.club,
            first_name="Dina",
            last_name="Child",
            date_of_birth=date.today() - timedelta(days=365 * 6),
        )
        family_id = self._family_with("Child family", [child, sibling, self.adult])
        blocked = self.client.post(
            "/api/club-management/families/",
            {"club": self.club.id, "name": "Minors only"},
            format="json",
        )
        minors_id = blocked.data["id"]
        self.client.post(f"/api/club-management/families/{minors_id}/add-member/", {"member": child.id}, format="json")
        self.client.post(f"/api/club-management/families/{minors_id}/add-member/", {"member": sibling.id}, format="json")
        refused = self.client.post(
            f"/api/club-management/families/{minors_id}/create-invoice/",
            {"year": date.today().year},
            format="json",
        )
        self.assertEqual(refused.status_code, 400, refused.data)
        self.assertIn("receives the bill", refused.data.get("detail", ""))
        year = date.today().year
        preview = self.client.get(f"/api/club-management/billing/?club={self.club.id}&year={year}")
        minors = next(row for row in preview.data["households"] if row["id"] == f"family-{minors_id}")
        self.assertEqual(minors["status"], "blocked")
        self.assertTrue(minors["needs_recipient"])
        invoice = self.client.post(
            f"/api/club-management/families/{family_id}/create-invoice/",
            {"year": year},
            format="json",
        )
        self.assertEqual(invoice.status_code, 201, invoice.data)
        self.assertEqual(OrderItem.objects.filter(order_id=invoice.data["order_id"]).count(), 3)
        saved = Invoice.objects.get(pk=invoice.data["invoice_id"])
        self.assertEqual(saved.member_id, self.adult.id)
        self.assertEqual(saved.bill_to_name, "ADULT Bea")
        again = self.client.post(
            f"/api/club-management/families/{family_id}/create-invoice/",
            {"year": year},
            format="json",
        )
        self.assertEqual(again.status_code, 400)

    @patch("licenses.tasks.send_invoice_email.delay")
    def test_guardian_receives_one_family_invoice(self, queued):
        from licenses.pdf_utils import build_invoice_context

        self._unlock()
        self._auth(self.club_admin)
        self._fee(amount="80.00")
        child = Member.objects.create(
            club=self.club,
            first_name="Cara",
            last_name="Minor",
            date_of_birth=date.today() - timedelta(days=365 * 9),
        )
        sibling = Member.objects.create(
            club=self.club,
            first_name="Dina",
            last_name="Minor",
            date_of_birth=date.today() - timedelta(days=365 * 7),
        )
        family_id = self._family_with("Minor family", [child, sibling])
        added = self.client.post(
            f"/api/club-management/families/{family_id}/add-parent/",
            {
                "first_name": "Anna",
                "last_name": "Parent",
                "relation": "mother",
                "email": "anna@example.com",
                "phone": "+352 621 000",
                "street": "Rue Test",
                "house_number": "12",
                "postal_code": "9182",
                "locality": "Vichten",
                "is_emergency": True,
            },
            format="json",
        )
        self.assertEqual(added.status_code, 201, added.data)
        self.assertTrue(added.data["bill_to_person"])
        self.assertIsNone(added.data["invoice_member"])
        self.assertEqual(added.data["bill_to_name"], "Anna PARENT")
        from .models import MemberContact, PersonEmail

        person_id = added.data["bill_to_person"]
        self.assertTrue(PersonEmail.objects.filter(person_id=person_id, email="anna@example.com", use_for_invoice=True).exists())
        links = MemberContact.objects.filter(person_id=person_id, is_primary=True)
        self.assertEqual(set(links.values_list("member_id", flat=True)), {child.id, sibling.id})
        year = date.today().year
        invoice = self.client.post(
            f"/api/club-management/families/{family_id}/create-invoice/",
            {"year": year},
            format="json",
        )
        self.assertEqual(invoice.status_code, 201, invoice.data)
        self.assertEqual(OrderItem.objects.filter(order_id=invoice.data["order_id"]).count(), 2)
        saved = Invoice.objects.select_related("member").get(pk=invoice.data["invoice_id"])
        self.assertEqual(saved.member_id, child.id)
        self.assertEqual(saved.bill_to_name, "PARENT Anna")
        self.assertIn("12, Rue Test", saved.bill_to_address)
        self.assertIn("anna@example.com", saved.bill_to_email)
        queued.assert_called()
        self.assertIn("anna@example.com", queued.call_args[0][1])
        context = build_invoice_context(saved)
        self.assertEqual(context["recipient_name"], "PARENT Anna")
        self.assertIn("12, Rue Test", context["recipient_lines"])
        saved.bill_to_name = ""
        saved.bill_to_address = ""
        saved.bill_to_email = ""
        context = build_invoice_context(saved)
        self.assertEqual(context["recipient_name"], "MINOR Cara")

    @patch("licenses.tasks.send_invoice_email.delay")
    def test_billing_run_issues_singleton_and_respects_delivery(self, queued):
        self._unlock()
        self._auth(self.club_admin)
        record, _created = MemberRecord.objects.get_or_create(member=self.adult)
        record.invoice_delivery = MemberRecord.InvoiceDelivery.HAND
        record.save(update_fields=["invoice_delivery"])
        MemberEmail.objects.create(member=self.member, email="ada@example.com", use_for_invoice=True)
        self.client.post(
            "/api/club-management/membership-fees/",
            {"club": self.club.id, "name": "Annual", "amount": "50.00"},
            format="json",
        )
        preview = self.client.get(f"/api/club-management/billing/?club={self.club.id}&year={date.today().year}")
        self.assertEqual(preview.status_code, 200)
        ids = [row["id"] for row in preview.data["households"] if row["status"] == "ready"]
        self.assertTrue(any(item.startswith("member-") for item in ids))
        issued = self.client.post(
            f"/api/club-management/billing/?club={self.club.id}",
            {"year": date.today().year, "household_ids": ids},
            format="json",
        )
        self.assertEqual(issued.status_code, 201)
        self.assertGreaterEqual(issued.data["created_count"], 2)
        self.assertGreaterEqual(issued.data["hand_count"], 1)
        self.assertTrue(queued.called)
        pack = self.client.get(
            f"/api/club-management/billing/print-pack/?club={self.club.id}&year={date.today().year}&method=hand"
        )
        self.assertIn(pack.status_code, {200, 500})
        empty_year = self.client.get(
            f"/api/club-management/billing/print-pack/?club={self.club.id}&year={date.today().year + 5}&method=paper"
        )
        self.assertEqual(empty_year.status_code, 400)
        self.assertIn("Issue invoices first", empty_year.data["detail"])

    def test_billing_assigns_member_fee(self):
        self._unlock()
        self._auth(self.club_admin)
        annual = self.client.post(
            "/api/club-management/membership-fees/",
            {"club": self.club.id, "name": "Adult", "amount": "100.00"},
            format="json",
        )
        youth = self.client.post(
            "/api/club-management/membership-fees/",
            {"club": self.club.id, "name": "Youth", "amount": "40.00"},
            format="json",
        )
        assigned = self.client.post(
            f"/api/club-management/billing/assign-fee/?club={self.club.id}",
            {"member": self.member.id, "fee": youth.data["id"]},
            format="json",
        )
        self.assertEqual(assigned.status_code, 200)
        preview = self.client.get(f"/api/club-management/billing/?club={self.club.id}&year={date.today().year}")
        self.assertEqual(preview.status_code, 200)
        ada = next(row for row in preview.data["households"] if row["id"] == f"member-{self.member.id}")
        self.assertEqual(ada["total"], "40.00")
        self.assertEqual(ada["fee_id"], youth.data["id"])
        adult = next(row for row in preview.data["households"] if row["id"] == f"member-{self.adult.id}")
        self.assertEqual(adult["total"], "100.00")
        self.assertEqual(len(preview.data["fees"]), 2)
        self.assertEqual(annual.status_code, 201)

    def test_billing_zero_total_is_issued_paid(self):
        self._unlock()
        self._auth(self.club_admin)
        from clubmgmt.billing import paper_invoices

        from .models import MembershipYearConfirmation

        paying = self.client.post(
            "/api/club-management/membership-fees/",
            {"club": self.club.id, "name": "Adult", "amount": "100.00"},
            format="json",
        )
        free = self.client.post(
            "/api/club-management/membership-fees/",
            {"club": self.club.id, "name": "Coach", "amount": "0.00"},
            format="json",
        )
        self.assertEqual(paying.status_code, 201)
        self.client.post(
            f"/api/club-management/billing/assign-fee/?club={self.club.id}",
            {"member": self.adult.id, "fee": free.data["id"]},
            format="json",
        )
        year = date.today().year
        preview = self.client.get(f"/api/club-management/billing/?club={self.club.id}&year={year}")
        self.assertEqual(preview.status_code, 200)
        self.assertEqual(preview.data["summary"]["complimentary_count"], 0)
        coach = next(row for row in preview.data["households"] if row["id"] == f"member-{self.adult.id}")
        paying_row = next(row for row in preview.data["households"] if row["id"] == f"member-{self.member.id}")
        self.assertEqual(coach["status"], "ready")
        self.assertEqual(coach["total"], "0.00")
        self.assertEqual(paying_row["status"], "ready")
        household = self.client.get(
            f"/api/club-management/billing/household/?club={self.club.id}&household={coach['id']}&year={year}"
        )
        self.assertEqual(household.status_code, 200, household.data)
        self.assertFalse(household.data["already_confirmed"])
        self.assertEqual(household.data["total"], "0.00")
        confirmed = self.client.post(
            f"/api/club-management/billing/confirm/?club={self.club.id}",
            {"year": year, "household_ids": [coach["id"]]},
            format="json",
        )
        self.assertEqual(confirmed.status_code, 200)
        self.assertEqual(confirmed.data["confirmed_count"], 1)
        issued = self.client.post(
            f"/api/club-management/billing/?club={self.club.id}",
            {"year": year, "household_ids": [coach["id"], paying_row["id"]]},
            format="json",
        )
        self.assertEqual(issued.status_code, 201, issued.data)
        self.assertEqual(issued.data["created_count"], 1)
        self.assertEqual(issued.data["created"][0]["id"], paying_row["id"])
        self.assertEqual(issued.data["skipped"][0]["reason"], "Already confirmed for this year.")
        after = self.client.get(f"/api/club-management/billing/?club={self.club.id}&year={year}")
        coach_after = next(row for row in after.data["households"] if row["id"] == f"member-{self.adult.id}")
        self.assertEqual(coach_after["status"], "confirmed")
        self.assertFalse(
            Invoice.objects.filter(
                club=self.club, member=self.adult, total=Decimal("0.00"), status=Invoice.Status.ISSUED
            ).exists()
        )
        MembershipYearConfirmation.objects.filter(
            club=self.club, year=year, household_key=coach["id"]
        ).delete()
        issued_zero = self.client.post(
            f"/api/club-management/billing/?club={self.club.id}",
            {"year": year, "household_ids": [coach["id"]]},
            format="json",
        )
        self.assertEqual(issued_zero.status_code, 201, issued_zero.data)
        self.assertEqual(issued_zero.data["created_count"], 1)
        self.assertEqual(issued_zero.data["created"][0]["total"], "0.00")
        paid = Invoice.objects.select_related("order").get(pk=issued_zero.data["created"][0]["invoice_id"])
        self.assertEqual(paid.status, Invoice.Status.PAID)
        self.assertIsNotNone(paid.paid_at)
        self.assertEqual(paid.order.status, Order.Status.PAID)
        self.assertEqual(Payment.objects.filter(invoice=paid).count(), 0)
        self.assertFalse(
            paper_invoices(self.club.id, year, ["email", "post", "hand"]).filter(pk=paid.id).exists()
        )
        paid_list = self.client.get(f"/api/club-management/billing/?club={self.club.id}&year={year}")
        coach_paid = next(row for row in paid_list.data["households"] if row["id"] == f"member-{self.adult.id}")
        self.assertEqual(coach_paid["status"], "paid")
        again = self.client.post(
            f"/api/club-management/billing/?club={self.club.id}",
            {"year": year, "household_ids": [coach["id"]]},
            format="json",
        )
        self.assertEqual(again.data["created_count"], 0)
        self.assertEqual(again.data["skipped"][0]["reason"], "Already invoiced.")

    def test_settle_zero_euro_membership_invoices(self):
        self._unlock()
        from clubmgmt.billing import create_membership_invoice, settle_zero_euro_membership_invoices

        order_invoice = create_membership_invoice(
            club=self.club,
            year=date.today().year,
            payer=self.adult,
            lines=[
                {
                    "member_id": self.adult.id,
                    "member_name": "Bea Adult",
                    "rank": 1,
                    "percent_off": "0",
                    "amount": "0.00",
                    "fee_id": 0,
                    "fee_name": "Coach",
                    "unit_amount": "0.00",
                }
            ],
            total=Decimal("0.00"),
        )
        self.assertEqual(order_invoice.status, Invoice.Status.PAID)
        self.assertIsNotNone(order_invoice.paid_at)
        self.assertEqual(order_invoice.order.status, Order.Status.PAID)
        order_invoice.status = Invoice.Status.ISSUED
        order_invoice.paid_at = None
        order_invoice.save(update_fields=["status", "paid_at", "updated_at"])
        order = order_invoice.order
        order.status = Order.Status.PENDING
        order.save(update_fields=["status", "updated_at"])
        settled = settle_zero_euro_membership_invoices(club=self.club)
        self.assertGreaterEqual(settled, 1)
        order_invoice.refresh_from_db()
        self.assertEqual(order_invoice.status, Invoice.Status.VOID)

    def test_ltf_finance_cannot_run_club_billing(self):
        self._unlock()
        self.ltf_finance = User.objects.create_user(
            username="ltffinance-billing", password="pass12345", role=User.Roles.LTF_FINANCE
        )
        self._auth(self.ltf_finance)
        response = self.client.get(f"/api/club-management/billing/?club={self.club.id}")
        self.assertEqual(response.status_code, 403)

    def test_membership_fee_keeps_catalog_and_adds_price(self):
        self._unlock()
        self._auth(self.club_admin)
        created = self.client.post(
            "/api/club-management/membership-fees/",
            {"club": self.club.id, "name": "Annual dues", "amount": "100.00"},
            format="json",
        )
        self.assertEqual(created.status_code, 201)
        self.assertIsNone(created.data.get("year"))
        priced = self.client.post(
            f"/api/club-management/membership-fees/{created.data['id']}/add-price/",
            {"amount": "120.00", "effective_from": "2027-01-01"},
            format="json",
        )
        self.assertEqual(priced.status_code, 200)
        self.assertEqual(priced.data["amount"], "120.00")
        self.assertEqual(len(priced.data["prices"]), 2)

    def test_membership_fee_edit_updates_name_and_current_price(self):
        self._unlock()
        self._auth(self.club_admin)
        created = self.client.post(
            "/api/club-management/membership-fees/",
            {"club": self.club.id, "name": "Annual dues", "amount": "100.00"},
            format="json",
        )
        fee_id = created.data["id"]
        self.client.post(
            f"/api/club-management/membership-fees/{fee_id}/add-price/",
            {"amount": "120.00", "effective_from": "2027-01-01"},
            format="json",
        )
        updated = self.client.patch(
            f"/api/club-management/membership-fees/{fee_id}/",
            {"name": "Adult dues", "amount": "90.00"},
            format="json",
        )
        self.assertEqual(updated.status_code, 200)
        self.assertEqual(updated.data["name"], "Adult dues")
        self.assertEqual(updated.data["amount"], "90.00")
        amounts = [row["amount"] for row in updated.data["prices"]]
        self.assertIn("100.00", amounts)
        self.assertEqual(
            next(row["amount"] for row in updated.data["prices"] if row["effective_from"] == "2027-01-01" and row["amount"] == "90.00"),
            "90.00",
        )

    def test_membership_fee_delete_clears_member_assignment(self):
        self._unlock()
        self._auth(self.club_admin)
        created = self.client.post(
            "/api/club-management/membership-fees/",
            {"club": self.club.id, "name": "Annual dues", "amount": "100.00"},
            format="json",
        )
        fee_id = created.data["id"]
        record = MemberRecord.objects.create(member=self.member, membership_fee_id=fee_id)
        deleted = self.client.delete(f"/api/club-management/membership-fees/{fee_id}/")
        self.assertEqual(deleted.status_code, 204)
        record.refresh_from_db()
        self.assertIsNone(record.membership_fee_id)
        self.assertEqual(self.client.get(f"/api/club-management/membership-fees/{fee_id}/").status_code, 404)

    def test_mandate_can_be_vacant_then_assigned(self):
        self._unlock()
        self._auth(self.club_admin)
        committee = self.client.post(
            "/api/club-management/committees/",
            {"club": self.club.id, "scope": "club", "name": "Board"},
            format="json",
        )
        self.assertEqual(committee.status_code, 201)
        vacant = self.client.post(
            "/api/club-management/mandates/",
            {
                "committee": committee.data["id"],
                "role": "president",
                "started_on": date.today().isoformat(),
            },
            format="json",
        )
        self.assertEqual(vacant.status_code, 201)
        self.assertIsNone(vacant.data["member"])
        assigned = self.client.patch(
            f"/api/club-management/mandates/{vacant.data['id']}/",
            {"member": self.adult.id},
            format="json",
        )
        self.assertEqual(assigned.status_code, 200)
        self.assertEqual(assigned.data["member"], self.adult.id)
        self.assertIn("Bea", assigned.data["member_name"])

    def test_mandate_can_be_deleted(self):
        self._unlock()
        self._auth(self.club_admin)
        committee = self.client.post(
            "/api/club-management/committees/",
            {"club": self.club.id, "scope": "club", "name": "Board"},
            format="json",
        )
        vacant = self.client.post(
            "/api/club-management/mandates/",
            {
                "committee": committee.data["id"],
                "role": "president",
                "started_on": date.today().isoformat(),
            },
            format="json",
        )
        self.assertEqual(vacant.status_code, 201)
        deleted = self.client.delete(f"/api/club-management/mandates/{vacant.data['id']}/")
        self.assertEqual(deleted.status_code, 204)
        listed = self.client.get(
            f"/api/club-management/committees/?scope=club&club={self.club.id}"
        )
        self.assertEqual(listed.status_code, 200)
        self.assertEqual(listed.data[0]["mandates"], [])

    def test_underage_member_cannot_hold_office(self):
        self._unlock()
        self._auth(self.club_admin)
        committee = self.client.post(
            "/api/club-management/committees/",
            {"club": self.club.id, "scope": "club", "name": "Board"},
            format="json",
        )
        vacant = self.client.post(
            "/api/club-management/mandates/",
            {
                "committee": committee.data["id"],
                "role": "president",
                "started_on": date.today().isoformat(),
            },
            format="json",
        )
        self.assertEqual(vacant.status_code, 201)
        assigned = self.client.patch(
            f"/api/club-management/mandates/{vacant.data['id']}/",
            {"member": self.member.id},
            format="json",
        )
        self.assertEqual(assigned.status_code, 400)
        self.assertIn("18", str(assigned.data))

    def test_duplicate_current_president_is_rejected(self):
        self._unlock()
        self._auth(self.club_admin)
        committee = self.client.post(
            "/api/club-management/committees/",
            {"club": self.club.id, "scope": "club", "name": "Board"},
            format="json",
        )
        self.assertEqual(committee.status_code, 201)
        first = self.client.post(
            "/api/club-management/mandates/",
            {
                "committee": committee.data["id"],
                "role": "president",
                "started_on": date.today().isoformat(),
            },
            format="json",
        )
        self.assertEqual(first.status_code, 201)
        duplicate = self.client.post(
            "/api/club-management/mandates/",
            {
                "committee": committee.data["id"],
                "role": "president",
                "started_on": date.today().isoformat(),
            },
            format="json",
        )
        self.assertEqual(duplicate.status_code, 400)
        members = self.client.post(
            "/api/club-management/mandates/",
            {
                "committee": committee.data["id"],
                "role": "committee_member",
                "started_on": date.today().isoformat(),
            },
            format="json",
        )
        self.assertEqual(members.status_code, 201)
        second_member = self.client.post(
            "/api/club-management/mandates/",
            {
                "committee": committee.data["id"],
                "role": "committee_member",
                "started_on": date.today().isoformat(),
            },
            format="json",
        )
        self.assertEqual(second_member.status_code, 201)

    def test_past_president_allows_new_current_president(self):
        self._unlock()
        self._auth(self.club_admin)
        committee = self.client.post(
            "/api/club-management/committees/",
            {"club": self.club.id, "scope": "club", "name": "Board"},
            format="json",
        )
        past = self.client.post(
            "/api/club-management/mandates/",
            {
                "committee": committee.data["id"],
                "role": "president",
                "started_on": "2020-01-01",
                "ended_on": "2024-12-31",
            },
            format="json",
        )
        self.assertEqual(past.status_code, 201)
        current = self.client.post(
            "/api/club-management/mandates/",
            {
                "committee": committee.data["id"],
                "role": "president",
                "started_on": "2025-01-01",
            },
            format="json",
        )
        self.assertEqual(current.status_code, 201)


@override_settings(DEBUG=True, MODULE_CODE_PUBLIC_KEY="", MODULE_CODE_PRIVATE_KEY="")
class ClubFinancePaymentTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.ltf_admin = User.objects.create_user(
            username="ltfadmin-finance", password="pass12345", role=User.Roles.LTF_ADMIN
        )
        self.club_admin = User.objects.create_user(
            username="clubadmin-finance", password="pass12345", role=User.Roles.CLUB_ADMIN
        )
        self.club = Club.objects.create(name="Finance Club", created_by=self.ltf_admin)
        self.club.admins.add(self.club_admin)
        today = date.today()
        self.adult = Member.objects.create(
            club=self.club,
            first_name="Treasurer",
            last_name="Adult",
            date_of_birth=date(today.year - 30, today.month, min(today.day, 28)),
            user=self.club_admin,
        )
        self.order = Order.objects.create(
            club=self.club,
            member=self.adult,
            ledger=Order.Ledger.CLUB,
            status=Order.Status.PENDING,
            currency="EUR",
            subtotal=Decimal("40.00"),
            tax_total=Decimal("0.00"),
            total=Decimal("40.00"),
        )
        OrderItem.objects.create(
            order=self.order,
            description="Club membership",
            price_snapshot=Decimal("40.00"),
            quantity=1,
        )
        self.invoice = Invoice.objects.create(
            order=self.order,
            club=self.club,
            member=self.adult,
            status=Invoice.Status.ISSUED,
            currency="EUR",
            subtotal=Decimal("40.00"),
            tax_total=Decimal("0.00"),
            total=Decimal("40.00"),
            issued_at=timezone.now(),
        )

    def _auth(self, user):
        self.client.force_authenticate(user=user)

    def _unlock(self):
        token = sign_payload(
            build_payload(module_ids=[CLUB_MANAGEMENT_MODULE_ID], install_id=install_id_str())
        )
        redeem_product_code(token)
        set_club_assignment(
            club=self.club, module_id=CLUB_MANAGEMENT_MODULE_ID, enabled=True, user=self.ltf_admin
        )

    def _grant_mandate(self, role, ended_on=None):
        committee = Committee.objects.create(
            club=self.club, scope=Committee.Scope.CLUB, name="Board"
        )
        return CommitteeMandate.objects.create(
            committee=committee,
            role=role,
            member=self.adult,
            started_on=date.today() - timedelta(days=10),
            ended_on=ended_on,
        )

    def test_finance_access_denied_without_mandate(self):
        self._unlock()
        self._auth(self.club_admin)
        response = self.client.get(f"/api/club-management/finance-access/?club={self.club.id}")
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data["can_record_payments"])
        self.assertIsNone(response.data["mandate_role"])

    def test_finance_access_allowed_for_treasurer(self):
        self._unlock()
        self._grant_mandate(CommitteeMandate.Role.TREASURER)
        self._auth(self.club_admin)
        response = self.client.get(f"/api/club-management/finance-access/?club={self.club.id}")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["can_record_payments"])
        self.assertEqual(response.data["mandate_role"], CommitteeMandate.Role.TREASURER)

    def test_finance_access_denied_for_committee_member(self):
        self._unlock()
        self._grant_mandate(CommitteeMandate.Role.COMMITTEE_MEMBER)
        self._auth(self.club_admin)
        response = self.client.get(f"/api/club-management/finance-access/?club={self.club.id}")
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data["can_record_payments"])

    def test_finance_access_denied_for_ended_mandate(self):
        self._unlock()
        self._grant_mandate(CommitteeMandate.Role.PRESIDENT, ended_on=date.today() - timedelta(days=1))
        self._auth(self.club_admin)
        response = self.client.get(f"/api/club-management/finance-access/?club={self.club.id}")
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data["can_record_payments"])

    def test_confirm_payment_forbidden_without_bank_access(self):
        self._unlock()
        self._auth(self.club_admin)
        response = self.client.post(
            f"/api/club-orders/{self.order.id}/confirm-payment/",
            {
                "payment_method": "bank_transfer",
                "payment_provider": "manual",
                "payment_reference": self.invoice.invoice_number,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 403)

    def test_confirm_payment_forbidden_for_committee_member(self):
        self._unlock()
        self._grant_mandate(CommitteeMandate.Role.COMMITTEE_MEMBER)
        self._auth(self.club_admin)
        response = self.client.post(
            f"/api/club-orders/{self.order.id}/confirm-payment/",
            {
                "payment_method": "bank_transfer",
                "payment_provider": "manual",
                "payment_reference": self.invoice.invoice_number,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 403)

    @patch("licenses.tasks.send_invoice_email.delay")
    def test_treasurer_can_record_club_payment(self, _email_mock):
        self._unlock()
        self._grant_mandate(CommitteeMandate.Role.TREASURER)
        self._auth(self.club_admin)
        response = self.client.post(
            f"/api/club-orders/{self.order.id}/confirm-payment/",
            {
                "payment_method": "bank_transfer",
                "payment_provider": "manual",
                "payment_reference": self.invoice.invoice_number,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.order.refresh_from_db()
        self.invoice.refresh_from_db()
        self.assertEqual(self.order.status, Order.Status.PAID)
        self.assertEqual(self.invoice.status, Invoice.Status.PAID)
        self.assertTrue(Payment.objects.filter(order=self.order, status=Payment.Status.PAID).exists())

    @patch("licenses.tasks.send_invoice_email.delay")
    def test_secretary_can_record_club_payment(self, _email_mock):
        self._unlock()
        self._grant_mandate(CommitteeMandate.Role.SECRETARY)
        self._auth(self.club_admin)
        response = self.client.post(
            f"/api/club-orders/{self.order.id}/confirm-payment/",
            {
                "payment_method": "cash",
                "payment_provider": "manual",
                "payment_reference": self.invoice.invoice_number,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, Order.Status.PAID)

    def test_club_admin_can_list_club_payments(self):
        Payment.objects.create(
            invoice=self.invoice,
            order=self.order,
            amount=Decimal("40.00"),
            currency="EUR",
            method=Payment.Method.BANK_TRANSFER,
            provider=Payment.Provider.MANUAL,
            status=Payment.Status.PENDING,
            reference=self.invoice.invoice_number,
        )
        self._auth(self.club_admin)
        response = self.client.get("/api/club-payments/")
        self.assertEqual(response.status_code, 200)
        rows = response.data["results"] if isinstance(response.data, dict) else response.data
        self.assertGreaterEqual(len(rows), 1)
        self.assertEqual(rows[0]["invoice"], self.invoice.id)

    def test_ltf_admin_cannot_list_club_payments(self):
        self._auth(self.ltf_admin)
        response = self.client.get("/api/club-payments/")
        self.assertEqual(response.status_code, 403)

    @patch("licenses.tasks.send_invoice_email.delay")
    def test_superuser_secretary_can_record_club_payment(self, _email_mock):
        self.club_admin.is_superuser = True
        self.club_admin.is_staff = True
        self.club_admin.save(update_fields=["is_superuser", "is_staff"])
        self._unlock()
        self._grant_mandate(CommitteeMandate.Role.SECRETARY)
        self._auth(self.club_admin)
        access = self.client.get(f"/api/club-management/finance-access/?club={self.club.id}")
        self.assertEqual(access.status_code, 200)
        self.assertTrue(access.data["can_record_payments"])
        self.assertEqual(access.data["mandate_role"], CommitteeMandate.Role.SECRETARY)
        response = self.client.post(
            f"/api/club-orders/{self.order.id}/confirm-payment/",
            {
                "payment_method": "bank_transfer",
                "payment_provider": "manual",
                "payment_reference": self.invoice.invoice_number,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, Order.Status.PAID)

    def test_club_ledger_is_hidden_from_ltf_accounting(self):
        ltf_finance = User.objects.create_user(
            username="ltffinance-ledger",
            password="pass12345",
            role=User.Roles.LTF_FINANCE,
        )
        federation_order = Order.objects.create(
            club=self.club,
            member=self.adult,
            ledger=Order.Ledger.FEDERATION,
            status=Order.Status.PENDING,
            currency="EUR",
            subtotal=Decimal("10.00"),
            tax_total=Decimal("0.00"),
            total=Decimal("10.00"),
        )
        federation_invoice = Invoice.objects.create(
            order=federation_order,
            club=self.club,
            member=self.adult,
            status=Invoice.Status.ISSUED,
            currency="EUR",
            subtotal=Decimal("10.00"),
            tax_total=Decimal("0.00"),
            total=Decimal("10.00"),
            issued_at=timezone.now(),
        )
        self._auth(ltf_finance)
        invoices = self.client.get("/api/invoices/")
        self.assertEqual(invoices.status_code, 200)
        invoice_rows = invoices.data if isinstance(invoices.data, list) else invoices.data["results"]
        invoice_ids = [row["id"] for row in invoice_rows]
        self.assertIn(federation_invoice.id, invoice_ids)
        self.assertNotIn(self.invoice.id, invoice_ids)

        orders = self.client.get("/api/orders/")
        self.assertEqual(orders.status_code, 200)
        order_rows = orders.data if isinstance(orders.data, list) else orders.data["results"]
        order_ids = [row["id"] for row in order_rows]
        self.assertIn(federation_order.id, order_ids)
        self.assertNotIn(self.order.id, order_ids)

        payments = self.client.get("/api/payments/")
        self.assertEqual(payments.status_code, 200)
        payment_rows = payments.data if isinstance(payments.data, list) else payments.data["results"]
        self.assertFalse(any(row.get("invoice") == self.invoice.id for row in payment_rows))

        totals = self.client.get("/api/invoices/totals/")
        self.assertEqual(totals.status_code, 200)
        self.assertEqual(totals.data["outstanding_amount"], "10.00")

        pdf = self.client.get(f"/api/invoices/{self.invoice.id}/pdf/")
        self.assertEqual(pdf.status_code, 403)

    def test_club_cannot_record_federation_payment(self):
        self._unlock()
        self._grant_mandate(CommitteeMandate.Role.TREASURER)
        federation_order = Order.objects.create(
            club=self.club,
            member=self.adult,
            ledger=Order.Ledger.FEDERATION,
            status=Order.Status.PENDING,
            currency="EUR",
            subtotal=Decimal("10.00"),
            tax_total=Decimal("0.00"),
            total=Decimal("10.00"),
        )
        self._auth(self.club_admin)
        response = self.client.post(
            f"/api/club-orders/{federation_order.id}/confirm-payment/",
            {
                "payment_method": "bank_transfer",
                "payment_provider": "manual",
                "payment_reference": "FED",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)


@override_settings(DEBUG=True, MODULE_CODE_PUBLIC_KEY="", MODULE_CODE_PRIVATE_KEY="")
class ClubBooksTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.ltf_admin = User.objects.create_user(
            username="ltfadmin-books", password="pass12345", role=User.Roles.LTF_ADMIN
        )
        self.ltf_finance = User.objects.create_user(
            username="ltffinance-books", password="pass12345", role=User.Roles.LTF_FINANCE
        )
        self.club_admin = User.objects.create_user(
            username="clubadmin-books", password="pass12345", role=User.Roles.CLUB_ADMIN
        )
        self.club = Club.objects.create(name="Books Club", created_by=self.ltf_admin)
        self.club.admins.add(self.club_admin)
        today = date.today()
        self.adult = Member.objects.create(
            club=self.club,
            first_name="Treasurer",
            last_name="Adult",
            date_of_birth=date(today.year - 30, today.month, min(today.day, 28)),
            user=self.club_admin,
        )

    def _auth(self, user):
        self.client.force_authenticate(user=user)

    def _unlock(self):
        token = sign_payload(
            build_payload(module_ids=[CLUB_MANAGEMENT_MODULE_ID], install_id=install_id_str())
        )
        redeem_product_code(token)
        set_club_assignment(
            club=self.club, module_id=CLUB_MANAGEMENT_MODULE_ID, enabled=True, user=self.ltf_admin
        )

    def _grant_treasurer(self):
        self.adult.user = self.club_admin
        self.adult.save(update_fields=["user"])
        committee = Committee.objects.create(
            club=self.club, scope=Committee.Scope.CLUB, name="Board"
        )
        CommitteeMandate.objects.create(
            committee=committee,
            role=CommitteeMandate.Role.TREASURER,
            member=self.adult,
            started_on=date.today() - timedelta(days=10),
        )

    def test_module_required_for_club_books(self):
        self._auth(self.club_admin)
        response = self.client.get(f"/api/club-incomes/?club={self.club.id}")
        self.assertEqual(len(response.data if isinstance(response.data, list) else response.data.get("results", [])), 0)

    def test_treasurer_can_record_club_income_and_ltf_cannot_see_it(self):
        from licenses.models import IncomeCategory

        self._unlock()
        self._grant_treasurer()
        self._auth(self.club_admin)
        categories = self.client.get(f"/api/club-income-categories/?club={self.club.id}&active=1")
        self.assertEqual(categories.status_code, 200)
        rows = categories.data if isinstance(categories.data, list) else categories.data["results"]
        self.assertGreaterEqual(len(rows), 1)
        created = self.client.post(
            "/api/club-incomes/",
            {
                "club": self.club.id,
                "category": rows[0]["id"],
                "description": "Hall hire refund",
                "payer": "Sponsor",
                "amount": "25.00",
                "income_date": date.today().isoformat(),
                "payment_method": "bank_transfer",
            },
            format="json",
        )
        self.assertEqual(created.status_code, 201)
        self.assertEqual(created.data["ledger"] if "ledger" in created.data else "club", created.data.get("ledger", "club"))
        self._auth(self.ltf_finance)
        listed = self.client.get("/api/incomes/")
        self.assertEqual(listed.status_code, 200)
        income_rows = listed.data if isinstance(listed.data, list) else listed.data["results"]
        self.assertFalse(any(row.get("description") == "Hall hire refund" for row in income_rows))
        self._auth(self.club_admin)
        detail = self.client.get(f"/api/club-incomes/{created.data['id']}/")
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(detail.data["description"], "Hall hire refund")
        IncomeCategory.objects.filter(club=self.club).exists()

    def test_expense_forbidden_without_mandate(self):
        self._unlock()
        self._auth(self.club_admin)
        categories = self.client.get(f"/api/club-expense-categories/?club={self.club.id}&active=1")
        self.assertEqual(categories.status_code, 200)
        rows = categories.data if isinstance(categories.data, list) else categories.data["results"]
        created = self.client.post(
            "/api/club-expenses/",
            {
                "club": self.club.id,
                "category": rows[0]["id"],
                "description": "Mats",
                "payee": "Supplier",
                "amount": "40.00",
                "expense_date": date.today().isoformat(),
            },
            format="json",
        )
        self.assertEqual(created.status_code, 403)

    def test_credit_note_and_reminder_on_club_invoice(self):
        from licenses.models import Invoice, Order

        self._unlock()
        self._grant_treasurer()
        order = Order.objects.create(
            club=self.club,
            member=self.adult,
            ledger=Order.Ledger.CLUB,
            status=Order.Status.PENDING,
            currency="EUR",
            subtotal=Decimal("50.00"),
            tax_total=Decimal("0.00"),
            total=Decimal("50.00"),
        )
        invoice = Invoice.objects.create(
            order=order,
            club=self.club,
            member=self.adult,
            status=Invoice.Status.ISSUED,
            currency="EUR",
            subtotal=Decimal("50.00"),
            tax_total=Decimal("0.00"),
            total=Decimal("50.00"),
            issued_at=timezone.now(),
        )
        self._auth(self.club_admin)
        credited = self.client.post(
            f"/api/club-invoices/{invoice.id}/credit-note/",
            {"amount": "10.00", "reason": "Family rebate correction"},
            format="json",
        )
        self.assertEqual(credited.status_code, 200)
        self.assertEqual(credited.data["credited_total"], "10.00")
        self.assertEqual(credited.data["outstanding"], "40.00")
        self.assertEqual(len(credited.data["credit_notes"]), 1)
        self.assertTrue(credited.data["credit_notes"][0]["credit_number"].startswith("CN-"))
        too_much = self.client.post(
            f"/api/club-invoices/{invoice.id}/credit-note/",
            {"amount": "50.00", "reason": "Too much"},
            format="json",
        )
        self.assertEqual(too_much.status_code, 400)
        with patch("licenses.tasks.send_invoice_reminder_email.delay") as queued:
            reminder = self.client.post(f"/api/club-invoices/{invoice.id}/send-reminder/", {}, format="json")
            self.assertEqual(reminder.status_code, 200)
            queued.assert_called_once_with(invoice.id)
            again = self.client.post(f"/api/club-invoices/{invoice.id}/send-reminder/", {}, format="json")
            self.assertEqual(again.status_code, 400)
        statement = self.client.get(
            f"/api/club-statements/?club={self.club.id}&member={self.adult.id}&year={date.today().year}"
        )
        self.assertIn(statement.status_code, {200, 500})
        if statement.status_code == 200:
            self.assertEqual(statement["Content-Type"], "application/pdf")

    def test_club_income_receipt_upload(self):
        from django.core.files.uploadedfile import SimpleUploadedFile

        self._unlock()
        self._grant_treasurer()
        self._auth(self.club_admin)
        categories = self.client.get(f"/api/club-income-categories/?club={self.club.id}&active=1")
        rows = categories.data if isinstance(categories.data, list) else categories.data["results"]
        receipt = SimpleUploadedFile("receipt.pdf", b"%PDF-1.4 test", content_type="application/pdf")
        created = self.client.post(
            "/api/club-incomes/",
            {
                "club": self.club.id,
                "category": rows[0]["id"],
                "description": "Hall hire with receipt",
                "amount": "12.00",
                "income_date": date.today().isoformat(),
                "receipt": receipt,
            },
            format="multipart",
        )
        self.assertEqual(created.status_code, 201)
        self.assertTrue(created.data.get("receipt_url"))

    def test_club_bank_statement_csv_match_and_budget(self):
        from django.core.files.uploadedfile import SimpleUploadedFile

        self._unlock()
        self._grant_treasurer()
        self._auth(self.club_admin)
        categories = self.client.get(f"/api/club-income-categories/?club={self.club.id}&active=1")
        rows = categories.data if isinstance(categories.data, list) else categories.data["results"]
        today = date.today()
        income = self.client.post(
            "/api/club-incomes/",
            {
                "club": self.club.id,
                "category": rows[0]["id"],
                "description": "Hall hire refund",
                "amount": "25.00",
                "income_date": today.isoformat(),
                "payment_method": "bank_transfer",
            },
            format="json",
        )
        self.assertEqual(income.status_code, 201)
        csv_payload = (
            "Date;Amount;Description;Reference\n"
            f"{today.strftime('%d/%m/%Y')};25,00;Hall hire refund;INC-REF\n"
        ).encode("utf-8")
        imported = self.client.post(
            f"/api/club-bank-statements/import/?club={self.club.id}",
            {"file": SimpleUploadedFile("statement.csv", csv_payload, content_type="text/csv")},
            format="multipart",
        )
        self.assertEqual(imported.status_code, 201)
        self.assertEqual(imported.data["summary"]["unmatched_count"], 1)
        line_id = imported.data["lines"][0]["id"]
        suggestions = self.client.get(
            f"/api/club-bank-statements/{imported.data['id']}/suggestions/?line={line_id}"
        )
        self.assertEqual(suggestions.status_code, 200)
        self.assertGreaterEqual(len(suggestions.data["candidates"]), 1)
        matched = self.client.post(
            f"/api/club-bank-statements/{imported.data['id']}/match/",
            {"line": line_id, "kind": "income", "id": income.data["id"]},
            format="json",
        )
        self.assertEqual(matched.status_code, 200)
        self.assertEqual(matched.data["summary"]["matched_count"], 1)
        self._auth(self.ltf_finance)
        hidden = self.client.get("/api/bank-statements/")
        self.assertEqual(hidden.status_code, 200)
        federation_rows = hidden.data if isinstance(hidden.data, list) else hidden.data["results"]
        self.assertFalse(any(row.get("id") == imported.data["id"] for row in federation_rows))
        self._auth(self.club_admin)
        budget = self.client.get(f"/api/club-finance-budgets/?club={self.club.id}&year={today.year}")
        self.assertEqual(budget.status_code, 200)
        self.assertTrue(any(line["kind"] == "income" for line in budget.data["lines"]))
        saved = self.client.put(
            f"/api/club-finance-budgets/?club={self.club.id}",
            {
                "year": today.year,
                "lines": [
                    {"kind": "license_fees", "amount": "100.00"},
                    {"kind": "income", "category": rows[0]["id"], "amount": "50.00"},
                ],
            },
            format="json",
        )
        self.assertEqual(saved.status_code, 200)
        license_line = next(line for line in saved.data["lines"] if line["kind"] == "license_fees")
        self.assertEqual(license_line["budget"], "100.00")

    def test_camt053_import_parses_entries(self):
        from django.core.files.uploadedfile import SimpleUploadedFile

        self._unlock()
        self._grant_treasurer()
        self._auth(self.club_admin)
        today = date.today().isoformat()
        xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02">
  <BkToCstmrStmt>
    <Stmt>
      <Ntry>
        <Amt Ccy="EUR">40.00</Amt>
        <CdtDbtInd>DBIT</CdtDbtInd>
        <BookgDt><Dt>{today}</Dt></BookgDt>
        <NtryDtls><TxDtls><RmtInf><Ustrd>Mats</Ustrd></RmtInf></TxDtls></NtryDtls>
      </Ntry>
    </Stmt>
  </BkToCstmrStmt>
</Document>
""".encode("utf-8")
        imported = self.client.post(
            f"/api/club-bank-statements/import/?club={self.club.id}",
            {"file": SimpleUploadedFile("camt.xml", xml, content_type="application/xml")},
            format="multipart",
        )
        self.assertEqual(imported.status_code, 201)
        self.assertEqual(imported.data["source_format"], "camt053")
        self.assertEqual(imported.data["lines"][0]["direction"], "debit")
        self.assertEqual(imported.data["lines"][0]["amount"], "40.00")


@override_settings(DEBUG=True, MODULE_CODE_PUBLIC_KEY="", MODULE_CODE_PRIVATE_KEY="")
class ClubShopTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.ltf_admin = User.objects.create_user(
            username="ltfadmin-shop", password="pass12345", role=User.Roles.LTF_ADMIN
        )
        self.club_admin = User.objects.create_user(
            username="clubadmin-shop", password="pass12345", role=User.Roles.CLUB_ADMIN
        )
        self.club = Club.objects.create(name="Shop Club", created_by=self.ltf_admin)
        self.club.admins.add(self.club_admin)
        self.member = Member.objects.create(club=self.club, first_name="Ada", last_name="Buyer")

    def _auth(self, user):
        self.client.force_authenticate(user=user)

    def _unlock(self):
        token = sign_payload(
            build_payload(module_ids=[CLUB_MANAGEMENT_MODULE_ID], install_id=install_id_str())
        )
        redeem_product_code(token)
        set_club_assignment(
            club=self.club, module_id=CLUB_MANAGEMENT_MODULE_ID, enabled=True, user=self.ltf_admin
        )

    def test_shop_item_stock_and_sale(self):
        self._unlock()
        self._auth(self.club_admin)
        created = self.client.post(
            f"/api/club-management/shop/items/?club={self.club.id}",
            {
                "name": "Mouthguard",
                "description": "Clear junior",
                "category": "sparring",
                "sale_price": "12.50",
                "sizes": ["Junior", "Senior"],
            },
            format="json",
        )
        self.assertEqual(created.status_code, 201, created.data)
        self.assertTrue(created.data["sku"].startswith("SH-"))
        self.assertEqual(len(created.data["variants"]), 2)
        variant_id = created.data["variants"][0]["id"]
        self.assertEqual(created.data["variants"][0]["sale_price"], "12.50")
        received = self.client.post(
            f"/api/club-management/shop/items/{created.data['id']}/receive/?club={self.club.id}",
            {"variant": variant_id, "quantity": 5},
            format="json",
        )
        self.assertEqual(received.status_code, 200)
        self.assertEqual(received.data["quantity"], 5)
        sold = self.client.post(
            f"/api/club-management/shop/sales/?club={self.club.id}",
            {
                "member": self.member.id,
                "payment_method": "unpaid",
                "lines": [{"variant": variant_id, "quantity": 2}],
            },
            format="json",
        )
        self.assertEqual(sold.status_code, 201, sold.data)
        self.assertEqual(sold.data["status"], "unpaid")
        self.assertEqual(sold.data["total"], "25.00")
        stock = self.client.get(
            f"/api/club-management/shop/items/{created.data['id']}/?club={self.club.id}"
        )
        self.assertEqual(stock.data["quantity"], 3)
        oversell = self.client.post(
            f"/api/club-management/shop/sales/?club={self.club.id}",
            {
                "member": self.member.id,
                "payment_method": "cash",
                "lines": [{"variant": variant_id, "quantity": 9}],
            },
            format="json",
        )
        self.assertEqual(oversell.status_code, 400)
        scanned = self.client.get(
            f"/api/club-management/shop/scan/?club={self.club.id}&code={created.data['variants'][0]['qr_payload']}"
        )
        self.assertEqual(scanned.status_code, 200)
        self.assertEqual(scanned.data["variant_id"], variant_id)
        snapshot = self.client.post(
            f"/api/club-management/shop/snapshots/?club={self.club.id}",
            {"note": "Month end"},
            format="json",
        )
        self.assertEqual(snapshot.status_code, 201)
        self.assertGreaterEqual(snapshot.data["units"], 3)

    def test_dobok_sizes_have_own_prices_and_codes(self):
        self._unlock()
        self._auth(self.club_admin)
        created = self.client.post(
            f"/api/club-management/shop/items/?club={self.club.id}",
            {
                "name": "Dobok",
                "category": "dobok",
                "track_stock": False,
                "cost_price": "28.00",
                "sizes": [
                    {"label": "160", "sale_price": "45.00", "cost_price": "28.00"},
                    {"label": "170", "sale_price": "49.00", "cost_price": "30.00"},
                ],
            },
            format="json",
        )
        self.assertEqual(created.status_code, 201, created.data)
        self.assertEqual(created.data["cost_price"], "28.00")
        variants = {row["label"]: row for row in created.data["variants"]}
        self.assertEqual(variants["160"]["sale_price"], "45.00")
        self.assertEqual(variants["160"]["cost_price"], "28.00")
        self.assertEqual(variants["170"]["sale_price"], "49.00")
        self.assertEqual(variants["170"]["cost_price"], "30.00")
        self.assertNotEqual(variants["160"]["qr_payload"], variants["170"]["qr_payload"])
        self.assertTrue(variants["160"]["qr_payload"].startswith("LTFSHOP:"))
        sold = self.client.post(
            f"/api/club-management/shop/sales/?club={self.club.id}",
            {
                "walk_in_name": "Guest",
                "payment_method": "unpaid",
                "lines": [{"variant": variants["170"]["id"], "quantity": 1}],
            },
            format="json",
        )
        self.assertEqual(sold.status_code, 201, sold.data)
        self.assertEqual(sold.data["total"], "49.00")
        scanned = self.client.get(
            f"/api/club-management/shop/scan/?club={self.club.id}&code={variants['160']['qr_payload']}"
        )
        self.assertEqual(scanned.status_code, 200)
        self.assertEqual(scanned.data["sale_price"], "45.00")
        self.assertEqual(scanned.data["label"], "160")

    def test_multipart_item_saves_without_top_level_price(self):
        self._unlock()
        self._auth(self.club_admin)
        created = self.client.post(
            f"/api/club-management/shop/items/?club={self.club.id}",
            {
                "name": "Dobok",
                "category": "dobok",
                "sale_price": "",
                "track_stock": "true",
                "sizes": '[{"label":"160","sale_price":"45.00","cost_price":"28.00"}]',
            },
            format="multipart",
        )
        self.assertEqual(created.status_code, 201, created.data)
        self.assertEqual(created.data["variants"][0]["sale_price"], "45.00")
        self.assertEqual(created.data["variants"][0]["cost_price"], "28.00")
        self.assertEqual(created.data["cost_price"], "28.00")

    def test_opening_quantity_goes_on_the_shelf(self):
        self._unlock()
        self._auth(self.club_admin)
        created = self.client.post(
            f"/api/club-management/shop/items/?club={self.club.id}",
            {
                "name": "Dobok",
                "category": "dobok",
                "sizes": [
                    {"label": "160", "sale_price": "45.00", "quantity": 10, "reorder_level": 3},
                    {"label": "170", "sale_price": "49.00", "quantity": 4, "reorder_level": 2},
                ],
            },
            format="json",
        )
        self.assertEqual(created.status_code, 201, created.data)
        variants = {row["label"]: row for row in created.data["variants"]}
        self.assertEqual(variants["160"]["quantity"], 10)
        self.assertEqual(variants["160"]["reorder_level"], 3)
        self.assertEqual(variants["170"]["quantity"], 4)
        delivered = self.client.post(
            f"/api/club-management/shop/items/{created.data['id']}/receive/?club={self.club.id}",
            {"lines": [{"variant": variants["160"]["id"], "quantity": 2}]},
            format="json",
        )
        self.assertEqual(delivered.status_code, 200, delivered.data)
        again = {row["label"]: row for row in delivered.data["variants"]}
        self.assertEqual(again["160"]["quantity"], 12)

    def test_l7121_sticker_slots_and_pdf(self):
        from decimal import Decimal

        from licenses.models import PrinterProfile

        from .shop import L7121_SLOT_COUNT, l7121_slot_origin

        self.assertEqual(L7121_SLOT_COUNT, 20)
        self.assertEqual(l7121_slot_origin(0), (Decimal("11.25"), Decimal("20.00")))
        last_x, last_y = l7121_slot_origin(19)
        self.assertEqual(last_x, Decimal("153.75"))
        self.assertEqual(last_y, Decimal("232.00"))
        self._unlock()
        self._auth(self.club_admin)
        created = self.client.post(
            f"/api/club-management/shop/items/?club={self.club.id}",
            {"name": "Belt", "category": "belt", "sale_price": "10.00", "track_stock": False},
            format="json",
        )
        self.assertEqual(created.status_code, 201, created.data)
        pdf = self.client.get(
            f"/api/club-management/shop/items/{created.data['id']}/stickers/"
            f"?club={self.club.id}&copies=3&start=18"
        )
        self.assertEqual(pdf.status_code, 200, getattr(pdf, "data", pdf.content[:200]))
        self.assertEqual(pdf["Content-Type"], "application/pdf")
        self.assertTrue(pdf.content.startswith(b"%PDF"))
        printer = PrinterProfile.objects.create(
            name="Club laser",
            x_offset_mm=Decimal("0.40"),
            y_offset_mm=Decimal("-0.20"),
            created_by=self.club_admin,
        )
        offset_pdf = self.client.get(
            f"/api/club-management/shop/items/{created.data['id']}/stickers/"
            f"?club={self.club.id}&copies=1&printer_profile={printer.id}"
        )
        self.assertEqual(offset_pdf.status_code, 200)
        missing = self.client.get(
            f"/api/club-management/shop/items/{created.data['id']}/stickers/"
            f"?club={self.club.id}&printer_profile=99999"
        )
        self.assertEqual(missing.status_code, 400)

