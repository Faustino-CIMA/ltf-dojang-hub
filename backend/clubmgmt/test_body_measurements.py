from datetime import date
from decimal import Decimal

from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from clubs.models import Club
from members.models import Member
from modules.codes import build_payload, sign_payload
from modules.entitlements import install_id_str, redeem_product_code, set_club_assignment
from modules.registry import COMPETITION_MODULE_ID

from .body_measurements import kyorugi_category


@override_settings(DEBUG=True, MODULE_CODE_PUBLIC_KEY="", MODULE_CODE_PRIVATE_KEY="")
class BodyMeasurementApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.today = timezone.localdate()
        self.ltf_admin = User.objects.create_user(username="ltf-hw", password="pass12345", role=User.Roles.LTF_ADMIN)
        self.finance = User.objects.create_user(username="fin-hw", password="pass12345", role=User.Roles.LTF_FINANCE)
        self.club_admin = User.objects.create_user(username="club-hw", password="pass12345", role=User.Roles.CLUB_ADMIN)
        self.coach = User.objects.create_user(username="coach-hw", password="pass12345", role=User.Roles.COACH)
        self.other_admin = User.objects.create_user(username="other-hw", password="pass12345", role=User.Roles.CLUB_ADMIN)
        self.member_user = User.objects.create_user(username="member-hw", password="pass12345", role=User.Roles.MEMBER)
        self.club = Club.objects.create(name="Scale Club", created_by=self.ltf_admin)
        self.other = Club.objects.create(name="Other Scale", created_by=self.ltf_admin)
        self.plain = Club.objects.create(name="No Module", created_by=self.ltf_admin)
        self.club.admins.add(self.club_admin)
        self.club.trainers.add(self.coach)
        self.other.admins.add(self.other_admin)
        self.plain.admins.add(self.club_admin)
        self.athlete = Member.objects.create(
            club=self.club,
            first_name="Lea",
            last_name="Weber",
            sex=Member.Sex.FEMALE,
            date_of_birth=date(self.today.year - 16, 4, 2),
            user=self.member_user,
        )
        self.cadet = Member.objects.create(
            club=self.club,
            first_name="Noa",
            last_name="Klein",
            sex=Member.Sex.MALE,
            date_of_birth=date(self.today.year - 12, 1, 1),
        )
        self.child = Member.objects.create(
            club=self.club,
            first_name="Mia",
            last_name="Petit",
            sex=Member.Sex.FEMALE,
            date_of_birth=date(self.today.year - 8, 1, 1),
        )

    def _unlock(self, *clubs):
        token = sign_payload(build_payload(module_ids=[COMPETITION_MODULE_ID], install_id=install_id_str()))
        redeem_product_code(token)
        for club in clubs or (self.club, self.other):
            set_club_assignment(club=club, module_id=COMPETITION_MODULE_ID, enabled=True, user=self.ltf_admin)

    def _auth(self, user):
        self.client.force_authenticate(user=user)

    def test_club_admin_and_coach_can_record_weight_height_or_both(self):
        self._unlock()
        self._auth(self.club_admin)
        created = self.client.post(
            "/api/club-management/measurements/",
            {"member": self.athlete.id, "measured_on": "2026-03-01", "weight_kg": "62.4", "note": "After training"},
            format="json",
        )
        self.assertEqual(created.status_code, 201, created.data)
        self.assertEqual(created.data["weight_kg"], "62.4")
        self.assertIsNone(created.data["height_cm"])
        self.assertEqual(created.data["recorded_by"], self.club_admin.id)
        self._auth(self.coach)
        both = self.client.post(
            "/api/club-management/measurements/",
            {"member": self.athlete.id, "measured_on": "2026-04-01", "weight_kg": "63.0", "height_cm": 168},
            format="json",
        )
        self.assertEqual(both.status_code, 201, both.data)
        edited = self.client.patch(
            f"/api/club-management/measurements/{both.data['id']}/",
            {"height_cm": 169, "weight_kg": None},
            format="json",
        )
        self.assertEqual(edited.status_code, 200, edited.data)
        self.assertIsNone(edited.data["weight_kg"])
        self.assertEqual(edited.data["height_cm"], 169)
        listing = self.client.get(f"/api/club-management/measurements/?member={self.athlete.id}")
        self.assertEqual(listing.status_code, 200)
        self.assertEqual(listing.data["suggestion"]["category"], "-63 kg")
        self.assertEqual(listing.data["suggestion"]["age_class"], "junior")
        self.assertEqual(len(listing.data["results"]), 2)

    def test_other_club_member_and_ltf_roles_cannot_read_or_write(self):
        self._unlock()
        payload = {"member": self.athlete.id, "measured_on": "2026-03-01", "weight_kg": "50.0"}
        for user in (self.other_admin, self.member_user, self.ltf_admin, self.finance):
            self._auth(user)
            refused = self.client.post("/api/club-management/measurements/", payload, format="json")
            self.assertEqual(refused.status_code, 403, user.username)
            hidden = self.client.get(f"/api/club-management/measurements/?member={self.athlete.id}")
            self.assertEqual(hidden.status_code, 403, user.username)

    def test_a_club_without_the_module_cannot_record(self):
        self._unlock()
        plain_member = Member.objects.create(club=self.plain, first_name="Eva", last_name="Simon", sex="F")
        self._auth(self.club_admin)
        refused = self.client.post(
            "/api/club-management/measurements/",
            {"member": plain_member.id, "measured_on": "2026-03-01", "height_cm": 160},
            format="json",
        )
        self.assertEqual(refused.status_code, 403)

    def test_ranges_and_missing_value_are_refused(self):
        self._unlock()
        self._auth(self.club_admin)
        light = self.client.post(
            "/api/club-management/measurements/",
            {"member": self.athlete.id, "measured_on": "2026-03-01", "weight_kg": "9.9"},
            format="json",
        )
        self.assertEqual(light.status_code, 400)
        self.assertIn("weight_out_of_range", str(light.data))
        tall = self.client.post(
            "/api/club-management/measurements/",
            {"member": self.athlete.id, "measured_on": "2026-03-01", "height_cm": 231},
            format="json",
        )
        self.assertEqual(tall.status_code, 400)
        empty = self.client.post(
            "/api/club-management/measurements/",
            {"member": self.athlete.id, "measured_on": "2026-03-01"},
            format="json",
        )
        self.assertEqual(empty.status_code, 400)
        self.assertIn("measurement_required", str(empty.data))

    def test_suggestion_uses_world_categories_and_skips_regional_classes(self):
        self.assertEqual(kyorugi_category(Decimal("54.0"), "senior", "M"), "-54 kg")
        self.assertEqual(kyorugi_category(Decimal("54.1"), "senior", "M"), "-58 kg")
        self.assertEqual(kyorugi_category(Decimal("87.1"), "senior", "M"), "+87 kg")
        self.assertEqual(kyorugi_category(Decimal("73.0"), "senior", "F"), "-73 kg")
        self.assertEqual(kyorugi_category(Decimal("73.1"), "senior", "F"), "+73 kg")
        self.assertEqual(kyorugi_category(Decimal("33.0"), "cadet", "M"), "-33 kg")
        self.assertEqual(kyorugi_category(Decimal("65.1"), "cadet", "M"), "+65 kg")
        self.assertEqual(kyorugi_category(Decimal("42.0"), "junior", "F"), "-42 kg")
        self.assertEqual(kyorugi_category(Decimal("50"), "pupils", "M"), "")
        self._unlock()
        self._auth(self.coach)
        self.client.post(
            "/api/club-management/measurements/",
            {"member": self.cadet.id, "measured_on": "2026-05-01", "weight_kg": "40.2"},
            format="json",
        )
        cadet = self.client.get(f"/api/club-management/measurements/?member={self.cadet.id}")
        self.assertEqual(cadet.data["suggestion"]["age_class"], "cadet")
        self.assertEqual(cadet.data["suggestion"]["category"], "-41 kg")
        self.client.post(
            "/api/club-management/measurements/",
            {"member": self.child.id, "measured_on": "2026-05-01", "weight_kg": "28.0"},
            format="json",
        )
        pupils = self.client.get(f"/api/club-management/measurements/?member={self.child.id}")
        self.assertIsNone(pupils.data["suggestion"])

    def test_member_list_sorts_latest_values_only_for_the_club_module(self):
        self._unlock()
        heavier = Member.objects.create(club=self.club, first_name="Max", last_name="Hoffmann", sex="M")
        self._auth(self.club_admin)
        self.client.post(
            "/api/club-management/measurements/",
            {"member": self.athlete.id, "measured_on": "2026-01-01", "weight_kg": "48.0", "height_cm": 160},
            format="json",
        )
        self.client.post(
            "/api/club-management/measurements/",
            {"member": heavier.id, "measured_on": "2026-02-02", "weight_kg": "70.5"},
            format="json",
        )
        self.client.post(
            "/api/club-management/measurements/",
            {"member": heavier.id, "measured_on": "2026-06-01", "height_cm": 175},
            format="json",
        )
        listing = self.client.get(f"/api/members/?club_id={self.club.id}&ordering=latest_weight")
        self.assertEqual(listing.status_code, 200)
        weights = [(row["last_name"], row.get("latest_weight_kg"), row.get("latest_weight_on")) for row in listing.data]
        self.assertEqual(weights[0][1], "48.0")
        self.assertEqual(weights[0][2], "2026-01-01")
        self.assertIn(("HOFFMANN", "70.5", "2026-02-02"), weights)
        heights = self.client.get(f"/api/members/?club_id={self.club.id}&ordering=-latest_height")
        self.assertEqual(heights.data[0]["latest_height_cm"], 175)
        self.assertEqual(heights.data[0]["latest_height_on"], "2026-06-01")
        self._auth(self.ltf_admin)
        federation = self.client.get(f"/api/members/?club_id={self.club.id}")
        self.assertEqual(federation.status_code, 200)
        self.assertTrue(federation.data)
        self.assertNotIn("latest_weight_kg", federation.data[0])
        self.assertNotIn("latest_height_cm", federation.data[0])
