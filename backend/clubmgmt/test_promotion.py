from datetime import date

from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from accounts.models import User
from clubs.models import Club
from members.models import Member
from modules.codes import build_payload, sign_payload
from modules.entitlements import install_id_str, redeem_product_code
from modules.models import ClubModuleAssignment
from modules.registry import CLUB_MANAGEMENT_MODULE_ID

from .promotion import next_grade


@override_settings(DEBUG=True, MODULE_CODE_PUBLIC_KEY="", MODULE_CODE_PRIVATE_KEY="")
class BeltPromotionTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_user(username="promo-admin", password="pass12345", role=User.Roles.CLUB_ADMIN)
        self.club = Club.objects.create(name="Promotion Club", created_by=self.admin)
        self.club.admins.add(self.admin)
        self.student = Member.objects.create(
            club=self.club,
            first_name="Ada",
            last_name="Youth",
            date_of_birth=date(2016, 1, 1),
            sex=Member.Sex.FEMALE,
            belt_rank="8th Kup",
        )
        token = sign_payload(build_payload(module_ids=[CLUB_MANAGEMENT_MODULE_ID], install_id=install_id_str()))
        redeem_product_code(token)
        ClubModuleAssignment.objects.create(club=self.club, module_id=CLUB_MANAGEMENT_MODULE_ID, enabled=True)
        self.client.force_authenticate(user=self.admin)

    def test_hours_gate_the_next_grade_and_a_pass_is_recorded(self):
        self.assertEqual(next_grade("", 10), "9th Kup")
        self.assertEqual(next_grade("10th Kup", 10), "9th Kup")
        self.assertEqual(next_grade("1st Kup", 14), "1st Poom")
        self.assertEqual(next_grade("1st Kup", 15), "1st Dan")
        rule = self.client.post(
            f"/api/club-management/training/promotion/rules/?club={self.club.id}",
            {"to_grade": "7th Kup", "required_hours": "1.50", "audience": ""},
            format="json",
        )
        self.assertEqual(rule.status_code, 201, rule.data)
        edited = self.client.patch(
            f"/api/club-management/training/promotion/rules/{rule.data['id']}/?club={self.club.id}",
            {"to_grade": "7th Kup", "required_hours": "2.00", "audience": "belt_test"},
            format="json",
        )
        self.assertEqual(edited.status_code, 200, edited.data)
        self.assertEqual(edited.data["required_hours"], "2.00")
        self.assertEqual(edited.data["audience"], "belt_test")
        restored = self.client.patch(
            f"/api/club-management/training/promotion/rules/{rule.data['id']}/?club={self.club.id}",
            {"required_hours": "1.50", "audience": ""},
            format="json",
        )
        self.assertEqual(restored.status_code, 200, restored.data)
        test = self.client.post(
            f"/api/club-management/training/promotion/tests/?club={self.club.id}",
            {"name": "Spring grading", "held_on": "2026-06-23"},
            format="json",
        )
        self.assertEqual(test.status_code, 201, test.data)
        before = self.client.get(f"/api/club-management/training/promotion/tests/{test.data['id']}/?club={self.club.id}")
        candidate = next(row for row in before.data["candidates"] if row["member_id"] == self.student.id)
        self.assertEqual(candidate["to_grade"], "7th Kup")
        self.assertFalse(candidate["ready"])
        session = self.client.post(
            f"/api/club-management/training/sessions/?club={self.club.id}",
            {
                "name": "Prep",
                "audience": "belt_test",
                "held_on": "2026-06-20",
                "start_time": "17:00",
                "end_time": "18:30",
            },
            format="json",
        )
        self.assertEqual(session.status_code, 201, session.data)
        marked = self.client.put(
            f"/api/club-management/training/sessions/{session.data['id']}/attendance/?club={self.club.id}",
            {"member_ids": [self.student.id]},
            format="json",
        )
        self.assertEqual(marked.status_code, 200, marked.data)
        ready = self.client.get(f"/api/club-management/training/promotion/tests/{test.data['id']}/?club={self.club.id}")
        candidate = next(row for row in ready.data["candidates"] if row["member_id"] == self.student.id)
        self.assertTrue(candidate["ready"])
        self.assertEqual(candidate["hours"], "1.50")
        passed = self.client.put(
            f"/api/club-management/training/promotion/tests/{test.data['id']}/result/?club={self.club.id}",
            {"member_id": self.student.id, "result": "passed"},
            format="json",
        )
        self.assertEqual(passed.status_code, 200, passed.data)
        self.student.refresh_from_db()
        self.assertEqual(self.student.belt_rank, "7th Kup")
        again = self.client.put(
            f"/api/club-management/training/promotion/tests/{test.data['id']}/result/?club={self.club.id}",
            {"member_id": self.student.id, "result": "passed"},
            format="json",
        )
        self.assertEqual(again.status_code, 400, again.data)
