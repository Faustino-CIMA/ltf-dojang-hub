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

from .holidays import luxembourg_public_holidays
from .training_models import TrainingSession


@override_settings(DEBUG=True, MODULE_CODE_PUBLIC_KEY="", MODULE_CODE_PRIVATE_KEY="")
class TrainingTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_user(username="train-admin", password="pass12345", role=User.Roles.CLUB_ADMIN)
        self.coach = User.objects.create_user(
            username="train-coach",
            password="pass12345",
            role=User.Roles.COACH,
            first_name="Kim",
            last_name="Coach",
        )
        self.club = Club.objects.create(name="Training Club", created_by=self.admin)
        self.club.admins.add(self.admin)
        self.club.trainers.add(self.coach)
        self.child = Member.objects.create(
            club=self.club,
            first_name="Small",
            last_name="Child",
            date_of_birth=date(2016, 1, 1),
            sex=Member.Sex.MALE,
        )
        token = sign_payload(build_payload(module_ids=[CLUB_MANAGEMENT_MODULE_ID], install_id=install_id_str()))
        redeem_product_code(token)
        ClubModuleAssignment.objects.create(club=self.club, module_id=CLUB_MANAGEMENT_MODULE_ID, enabled=True)
        self.client.force_authenticate(user=self.admin)

    def test_holiday_is_skipped_unless_a_session_is_added_by_hand(self):
        national_day = date(2026, 6, 23)
        created = self.client.post(
            f"/api/club-management/training/series/?club={self.club.id}",
            {
                "name": "Kids",
                "audience": "kids",
                "weekday": national_day.weekday(),
                "start_time": "17:00",
                "end_time": "18:30",
                "valid_from": "2026-06-23",
                "valid_until": "2026-06-23",
                "skip_public_holidays": True,
                "coach_ids": [self.coach.id],
                "regular_ids": [self.child.id],
            },
            format="json",
        )
        self.assertEqual(created.status_code, 201, created.data)
        self.assertFalse(TrainingSession.objects.filter(held_on=national_day).exists())
        extra = self.client.post(
            f"/api/club-management/training/sessions/?club={self.club.id}",
            {
                "name": "Holiday extra",
                "audience": "adults",
                "held_on": "2026-06-23",
                "start_time": "17:00",
                "end_time": "18:30",
                "coach_ids": [self.coach.id],
            },
            format="json",
        )
        self.assertEqual(extra.status_code, 201, extra.data)
        saved = self.client.put(
            f"/api/club-management/training/sessions/{extra.data['id']}/attendance/?club={self.club.id}",
            {"member_ids": [self.child.id]},
            format="json",
        )
        self.assertEqual(saved.status_code, 200, saved.data)
        self.assertEqual(saved.data["session"]["status"], "held")
        self.assertIn(self.child.id, saved.data["session"]["present_ids"])
        self.assertEqual(saved.data["members"][0]["age"], 10)
        report = self.client.get(f"/api/club-management/training/coach-hours/?club={self.club.id}&year=2026")
        self.assertEqual(report.status_code, 200, report.data)
        first = report.data["periods"][0]["coaches"]
        self.assertEqual(first[0]["user_id"], self.coach.id)
        self.assertEqual(first[0]["hours"], "1.50")
        holidays = self.client.get(f"/api/club-management/training/holidays/?club={self.club.id}&year=2026")
        self.assertEqual(holidays.status_code, 200, holidays.data)
        self.assertTrue(any(row["starts_on"] == "2025-12-20" for row in holidays.data["school"]))
        self.assertTrue(any(row["date"] == "2026-06-23" for row in holidays.data["public"]))
        month = self.client.get(
            f"/api/club-management/training/sessions/?club={self.club.id}&from=2026-06-01&to=2026-06-30"
        )
        self.assertEqual(month.status_code, 200, month.data)
        self.assertTrue(any(row["held_on"] == "2026-06-23" for row in month.data))

    def test_school_holiday_is_skipped_and_a_coach_can_mark_the_roll(self):
        created = self.client.post(
            f"/api/club-management/training/series/?club={self.club.id}",
            {
                "name": "Adults",
                "audience": "adults",
                "weekday": date(2026, 7, 16).weekday(),
                "start_time": "19:00",
                "end_time": "20:30",
                "valid_from": "2026-07-16",
                "valid_until": "2026-07-16",
                "skip_school_holidays": True,
                "coach_ids": [self.coach.id],
            },
            format="json",
        )
        self.assertEqual(created.status_code, 201, created.data)
        self.assertFalse(TrainingSession.objects.filter(held_on=date(2026, 7, 16)).exists())
        self.client.force_authenticate(user=self.coach)
        denied = self.client.post(
            f"/api/club-management/training/series/?club={self.club.id}",
            {
                "name": "Nope",
                "audience": "kids",
                "weekday": 0,
                "start_time": "17:00",
                "end_time": "18:00",
                "valid_from": "2026-09-07",
                "valid_until": "2026-09-07",
            },
            format="json",
        )
        self.assertEqual(denied.status_code, 403, denied.data)
        self.client.force_authenticate(user=self.admin)
        extra = self.client.post(
            f"/api/club-management/training/sessions/?club={self.club.id}",
            {
                "name": "Summer extra",
                "audience": "kids",
                "held_on": "2026-07-16",
                "start_time": "10:00",
                "end_time": "11:00",
                "coach_ids": [self.coach.id],
            },
            format="json",
        )
        self.assertEqual(extra.status_code, 201, extra.data)
        self.client.force_authenticate(user=self.coach)
        saved = self.client.put(
            f"/api/club-management/training/sessions/{extra.data['id']}/attendance/?club={self.club.id}",
            {"member_ids": [self.child.id], "coach_ids": [self.coach.id]},
            format="json",
        )
        self.assertEqual(saved.status_code, 200, saved.data)
        cancelled = self.client.patch(
            f"/api/club-management/training/sessions/{extra.data['id']}/?club={self.club.id}",
            {"status": "cancelled"},
            format="json",
        )
        self.assertEqual(cancelled.status_code, 403, cancelled.data)
        self.client.force_authenticate(user=self.admin)
        cancelled = self.client.patch(
            f"/api/club-management/training/sessions/{extra.data['id']}/?club={self.club.id}",
            {"status": "cancelled"},
            format="json",
        )
        self.assertEqual(cancelled.status_code, 200, cancelled.data)
        blocked = self.client.put(
            f"/api/club-management/training/sessions/{extra.data['id']}/attendance/?club={self.club.id}",
            {"member_ids": [self.child.id]},
            format="json",
        )
        self.assertEqual(blocked.status_code, 400, blocked.data)

    def test_national_day_moves_to_saturday_when_23_june_is_a_sunday(self):
        dates = [day for day, _name in luxembourg_public_holidays(2024)]
        self.assertIn(date(2024, 6, 22), dates)
        self.assertNotIn(date(2024, 6, 23), dates)

    def _hold_class_on(self, held_on: str):
        created = self.client.post(
            f"/api/club-management/training/sessions/?club={self.club.id}",
            {
                "name": "Pay class",
                "audience": "adults",
                "held_on": held_on,
                "start_time": "17:00",
                "end_time": "18:30",
                "coach_ids": [self.coach.id],
            },
            format="json",
        )
        self.assertEqual(created.status_code, 201, created.data)
        saved = self.client.put(
            f"/api/club-management/training/sessions/{created.data['id']}/attendance/?club={self.club.id}",
            {"member_ids": [self.child.id], "coach_ids": [self.coach.id]},
            format="json",
        )
        self.assertEqual(saved.status_code, 200, saved.data)

    def test_monthly_and_quarterly_paydays_split_the_year(self):
        monthly = self.client.patch(
            f"/api/club-management/training/coach-hours/?club={self.club.id}&year=2026",
            {"pay_frequency": "monthly", "payday_day": 15},
            format="json",
        )
        self.assertEqual(monthly.status_code, 200, monthly.data)
        self.assertEqual(len(monthly.data["periods"]), 12)
        self._hold_class_on("2026-06-23")
        report = self.client.get(f"/api/club-management/training/coach-hours/?club={self.club.id}&year=2026")
        june = next(row for row in report.data["periods"] if row["ends_on"] == "2026-06-15")
        july = next(row for row in report.data["periods"] if row["ends_on"] == "2026-07-15")
        self.assertEqual(june["coaches"], [])
        self.assertEqual(july["coaches"][0]["hours"], "1.50")
        quarterly = self.client.patch(
            f"/api/club-management/training/coach-hours/?club={self.club.id}&year=2026",
            {"pay_frequency": "quarterly", "payday_day": 31, "quarter_anchor_month": 3},
            format="json",
        )
        self.assertEqual(quarterly.status_code, 200, quarterly.data)
        self.assertEqual(
            [row["ends_on"] for row in quarterly.data["periods"]],
            ["2026-03-31", "2026-06-30", "2026-09-30", "2026-12-31"],
        )
        summer = next(row for row in quarterly.data["periods"] if row["ends_on"] == "2026-06-30")
        self.assertEqual(summer["coaches"][0]["hours"], "1.50")

    def test_editing_a_class_moves_empty_sessions_to_the_new_day(self):
        created = self.client.post(
            f"/api/club-management/training/series/?club={self.club.id}",
            {
                "name": "Monday kids",
                "audience": "kids",
                "weekday": 0,
                "start_time": "17:00",
                "end_time": "18:00",
                "valid_from": "2026-06-01",
                "valid_until": "2026-06-02",
                "skip_public_holidays": False,
                "skip_school_holidays": False,
            },
            format="json",
        )
        self.assertEqual(created.status_code, 201, created.data)
        self.assertTrue(TrainingSession.objects.filter(series_id=created.data["id"], held_on=date(2026, 6, 1)).exists())
        edited = self.client.patch(
            f"/api/club-management/training/series/{created.data['id']}/?club={self.club.id}",
            {"weekday": 1, "name": "Tuesday kids", "generate": True},
            format="json",
        )
        self.assertEqual(edited.status_code, 200, edited.data)
        self.assertEqual(edited.data["name"], "Tuesday kids")
        self.assertFalse(TrainingSession.objects.filter(series_id=created.data["id"], held_on=date(2026, 6, 1)).exists())
        moved = TrainingSession.objects.get(series_id=created.data["id"], held_on=date(2026, 6, 2))
        self.assertEqual(moved.name, "Tuesday kids")
