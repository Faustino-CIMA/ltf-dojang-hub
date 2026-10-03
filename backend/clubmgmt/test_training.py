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

    def _hold(self, held_on: str, start: str, end: str, coach_ids: list[int]) -> int:
        created = self.client.post(
            f"/api/club-management/training/sessions/?club={self.club.id}",
            {
                "name": "Pay class",
                "audience": "adults",
                "held_on": held_on,
                "start_time": start,
                "end_time": end,
                "coach_ids": coach_ids,
            },
            format="json",
        )
        self.assertEqual(created.status_code, 201, created.data)
        saved = self.client.put(
            f"/api/club-management/training/sessions/{created.data['id']}/attendance/?club={self.club.id}",
            {"member_ids": [self.child.id], "coach_ids": coach_ids},
            format="json",
        )
        self.assertEqual(saved.status_code, 200, saved.data)
        return created.data["id"]

    def _july(self, report):
        return next(row for row in report.data["periods"] if row["ends_on"] == "2026-07-15")

    def _row(self, period, user_id: int):
        return next(row for row in period["coaches"] if row["user_id"] == user_id)

    def test_coach_pay_uses_the_rate_basis_and_dated_tournament_costs(self):
        assistant = User.objects.create_user(
            username="train-assistant",
            password="pass12345",
            role=User.Roles.COACH,
            first_name="Ada",
            last_name="Assist",
        )
        traveller = User.objects.create_user(
            username="train-traveller",
            password="pass12345",
            role=User.Roles.COACH,
            first_name="Bea",
            last_name="Only",
        )
        self.club.trainers.add(assistant, traveller)
        stranger = User.objects.create_user(username="train-stranger", password="pass12345", role=User.Roles.COACH)
        monthly = self.client.patch(
            f"/api/club-management/training/coach-hours/?club={self.club.id}&year=2026",
            {"pay_frequency": "monthly", "payday_day": 15},
            format="json",
        )
        self.assertEqual(monthly.status_code, 200, monthly.data)
        self.assertIn("rates", monthly.data)
        self.assertIn("outings", monthly.data)
        rejected = self.client.post(
            f"/api/club-management/training/coach-pay-rates/?club={self.club.id}&year=2026",
            {"coach_id": stranger.id, "basis": "hourly", "rate": "10"},
            format="json",
        )
        self.assertEqual(rejected.status_code, 400, rejected.data)
        negative = self.client.post(
            f"/api/club-management/training/coach-pay-rates/?club={self.club.id}&year=2026",
            {"coach_id": self.coach.id, "basis": "hourly", "rate": "-1"},
            format="json",
        )
        self.assertEqual(negative.status_code, 400, negative.data)
        rated = self.client.post(
            f"/api/club-management/training/coach-pay-rates/?club={self.club.id}&year=2026",
            {"coach_id": self.coach.id, "basis": "hourly", "rate": "20,5"},
            format="json",
        )
        self.assertEqual(rated.status_code, 200, rated.data)
        kim_rate = next(row for row in rated.data["rates"] if row["user_id"] == self.coach.id)
        self.assertEqual(kim_rate["basis"], "hourly")
        self.assertEqual(kim_rate["rate"], "20.50")

        self._hold("2026-06-23", "17:00", "18:30", [self.coach.id])
        class_b = self._hold("2026-06-24", "18:00", "19:00", [self.coach.id])
        self._hold("2026-06-25", "10:00", "12:00", [self.coach.id, assistant.id])
        scheduled = self.client.post(
            f"/api/club-management/training/sessions/?club={self.club.id}",
            {
                "name": "Not held",
                "audience": "adults",
                "held_on": "2026-06-26",
                "start_time": "10:00",
                "end_time": "11:00",
                "coach_ids": [self.coach.id],
            },
            format="json",
        )
        self.assertEqual(scheduled.status_code, 201, scheduled.data)
        self.assertEqual(scheduled.data["status"], "scheduled")

        report = self.client.get(f"/api/club-management/training/coach-hours/?club={self.club.id}&year=2026")
        july = self._july(report)
        kim = self._row(july, self.coach.id)
        ada = self._row(july, assistant.id)
        self.assertEqual(kim["hours"], "4.50")
        self.assertEqual(kim["units"], "3")
        self.assertEqual(kim["training_pay"], "92.25")
        self.assertEqual(kim["total"], "92.25")
        self.assertEqual(ada["hours"], "2.00")
        self.assertEqual(ada["units"], "1")
        self.assertEqual(ada["rate"], "")
        self.assertEqual(ada["training_pay"], "0.00")
        june = next(row for row in report.data["periods"] if row["ends_on"] == "2026-06-15")
        self.assertEqual(june["coaches"], [])

        outing = self.client.post(
            f"/api/club-management/training/coach-outings/?club={self.club.id}&year=2026",
            {
                "coach_id": self.coach.id,
                "held_on": "2026-07-01",
                "name": "Open Luxembourg",
                "quantity": "3",
                "fuel_amount": "12.50",
                "hotel_amount": "80",
            },
            format="json",
        )
        self.assertEqual(outing.status_code, 200, outing.data)
        kim = self._row(self._july(outing), self.coach.id)
        self.assertEqual(kim["tournament_pay"], "61.50")
        self.assertEqual(kim["fuel"], "12.50")
        self.assertEqual(kim["hotel"], "80.00")
        self.assertEqual(kim["total"], "246.25")
        open_row = next(row for row in outing.data["outings"] if row["tournament"] == "Open Luxembourg")
        self.assertIsNone(open_row["coaching_amount"])
        self.assertEqual(open_row["coaching_pay"], "61.50")

        travel = self.client.post(
            f"/api/club-management/training/coach-outings/?club={self.club.id}&year=2026",
            {
                "coach_id": traveller.id,
                "held_on": "2026-06-20",
                "name": "Travel only",
                "quantity": "0",
                "coaching_amount": "0",
                "fuel_amount": "15",
                "hotel_amount": "40",
            },
            format="json",
        )
        self.assertEqual(travel.status_code, 200, travel.data)
        bea = self._row(self._july(travel), traveller.id)
        self.assertEqual(bea["hours"], "0.00")
        self.assertEqual(bea["units"], "0")
        self.assertEqual(bea["training_pay"], "0.00")
        self.assertEqual(bea["tournament_pay"], "0.00")
        self.assertEqual(bea["total"], "55.00")

        unit = self.client.post(
            f"/api/club-management/training/coach-pay-rates/?club={self.club.id}&year=2026",
            {"coach_id": self.coach.id, "basis": "unit", "rate": "10"},
            format="json",
        )
        kim = self._row(self._july(unit), self.coach.id)
        self.assertEqual(kim["hours"], "4.50")
        self.assertEqual(kim["training_pay"], "30.00")
        self.assertEqual(kim["tournament_pay"], "30.00")
        self.assertEqual(kim["total"], "152.50")

        flat = self.client.patch(
            f"/api/club-management/training/coach-outings/{open_row['id']}/?club={self.club.id}&year=2026",
            {"coaching_amount": "100"},
            format="json",
        )
        self.assertEqual(flat.status_code, 200, flat.data)
        kim = self._row(self._july(flat), self.coach.id)
        self.assertEqual(kim["tournament_pay"], "100.00")
        self.assertEqual(kim["total"], "222.50")

        expenses = self.client.patch(
            f"/api/club-management/training/coach-outings/{open_row['id']}/?club={self.club.id}&year=2026",
            {"coaching_amount": "0"},
            format="json",
        )
        kim = self._row(self._july(expenses), self.coach.id)
        self.assertEqual(kim["tournament_pay"], "0.00")
        self.assertEqual(kim["total"], "122.50")

        outside = self.client.post(
            f"/api/club-management/training/coach-outings/?club={self.club.id}&year=2026",
            {
                "coach_id": self.coach.id,
                "held_on": "2025-01-01",
                "name": "Last season",
                "fuel_amount": "9",
            },
            format="json",
        )
        self.assertEqual(outside.status_code, 200, outside.data)
        self.assertFalse(any(row["tournament"] == "Last season" for row in outside.data["outings"]))
        previous = self.client.get(f"/api/club-management/training/coach-hours/?club={self.club.id}&year=2025")
        last_season = next(row for row in previous.data["outings"] if row["tournament"] == "Last season")
        self.assertEqual(last_season["fuel_amount"], "9.00")
        january = next(row for row in previous.data["periods"] if row["ends_on"] == "2025-01-15")
        self.assertEqual(self._row(january, self.coach.id)["fuel"], "9.00")
        self.assertEqual(self._row(january, self.coach.id)["hours"], "0.00")

        higher = self.client.post(
            f"/api/club-management/training/coach-pay-rates/?club={self.club.id}&year=2026",
            {"coach_id": self.coach.id, "basis": "unit", "rate": "40"},
            format="json",
        )
        kim = self._row(self._july(higher), self.coach.id)
        self.assertEqual(kim["training_pay"], "120.00")
        self.assertEqual(kim["total"], "212.50")

        cancelled = self.client.patch(
            f"/api/club-management/training/sessions/{class_b}/?club={self.club.id}",
            {"status": "cancelled"},
            format="json",
        )
        self.assertEqual(cancelled.status_code, 200, cancelled.data)
        after_cancel = self.client.get(f"/api/club-management/training/coach-hours/?club={self.club.id}&year=2026")
        kim = self._row(self._july(after_cancel), self.coach.id)
        self.assertEqual(kim["hours"], "3.50")
        self.assertEqual(kim["units"], "2")
        self.assertEqual(kim["training_pay"], "80.00")
        self.assertEqual(kim["total"], "172.50")

        zero = self.client.post(
            f"/api/club-management/training/coach-pay-rates/?club={self.club.id}&year=2026",
            {"coach_id": self.coach.id, "basis": "hourly", "rate": "0"},
            format="json",
        )
        kim = self._row(self._july(zero), self.coach.id)
        self.assertEqual(kim["hours"], "3.50")
        self.assertEqual(kim["rate"], "0.00")
        self.assertEqual(kim["training_pay"], "0.00")
        self.assertEqual(kim["total"], "92.50")

        cleared = self.client.delete(
            f"/api/club-management/training/coach-pay-rates/{self.coach.id}/?club={self.club.id}&year=2026"
        )
        self.assertEqual(cleared.status_code, 200, cleared.data)
        kim = self._row(self._july(cleared), self.coach.id)
        self.assertEqual(kim["rate"], "")
        self.assertEqual(kim["hours"], "3.50")
        self.assertEqual(kim["training_pay"], "0.00")
        bea_row = next(row for row in cleared.data["outings"] if row["tournament"] == "Travel only")
        removed = self.client.delete(
            f"/api/club-management/training/coach-outings/{bea_row['id']}/?club={self.club.id}&year=2026"
        )
        self.assertFalse(any(row["user_id"] == traveller.id for row in self._july(removed)["coaches"]))

        self.client.force_authenticate(user=self.coach)
        hidden = self.client.get(f"/api/club-management/training/coach-hours/?club={self.club.id}&year=2026")
        self.assertEqual(hidden.status_code, 200, hidden.data)
        self.assertNotIn("rates", hidden.data)
        self.assertNotIn("outings", hidden.data)
        visible = self._row(self._july(hidden), self.coach.id)
        self.assertEqual(visible["hours"], "3.50")
        self.assertEqual(visible["units"], "2")
        self.assertNotIn("training_pay", visible)
        forbidden = self.client.post(
            f"/api/club-management/training/coach-pay-rates/?club={self.club.id}&year=2026",
            {"coach_id": self.coach.id, "basis": "hourly", "rate": "10"},
            format="json",
        )
        self.assertEqual(forbidden.status_code, 403, forbidden.data)
