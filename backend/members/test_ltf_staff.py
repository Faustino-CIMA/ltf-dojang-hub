from datetime import date
from unittest.mock import patch

from django.core.cache import cache
from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from accounts.models import User
from clubs.models import Club
from licenses.card_rendering import _build_context, _compute_validity_badge
from licenses.history import expire_outdated_licenses
from licenses.models import License, LicenseHistoryEvent, LicenseType, Order
from licenses.tasks import activate_eligible_paid_licenses, reconcile_expired_licenses

from .models import LtfStaffFunction, Member


class LtfStaffApiTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.admin = User.objects.create_user(
            username="ltfadmin",
            password="pass12345",
            role=User.Roles.LTF_ADMIN,
        )
        self.finance = User.objects.create_user(
            username="finance",
            password="pass12345",
            role=User.Roles.LTF_FINANCE,
        )
        self.club_admin = User.objects.create_user(
            username="clubadmin",
            password="pass12345",
            role=User.Roles.CLUB_ADMIN,
        )
        self.existing_login = User.objects.create_user(
            username="secretarylogin",
            password="pass12345",
            role=User.Roles.LTF_FINANCE,
            email="secretary.login@ltf.lu",
        )
        self.club = Club.objects.create(name="Centre Luxembourg", created_by=self.admin)
        self.club.admins.add(self.club_admin)
        self.club_member = Member.objects.create(
            club=self.club,
            first_name="Sekou",
            last_name="Coulibaly",
        )
        self.license_type = LicenseType.objects.create(name="Annual", code="annual-staff")

    def test_admin_creates_staff_without_club_and_issues_license_without_order(self):
        self.client.force_authenticate(user=self.admin)
        with patch("accounts.email_utils.send_password_reset_email", return_value=(True, None)):
            response = self.client.post(
                "/api/members/ltf-staff/",
                {
                    "first_name": "Alexandr",
                    "last_name": "Nagornyi",
                    "email": "alex@nagornyi.lu",
                    "sex": "M",
                    "function": "media",
                    "license_type": self.license_type.id,
                    "license_year": 2026,
                    "create_login_role": "ltf_admin",
                },
                format="json",
            )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertIsNone(response.data["club"])
        self.assertTrue(response.data["is_ltf_staff"])
        self.assertEqual(response.data["ltf_staff"]["function"], "media")
        self.assertEqual(response.data["primary_license_role"], "Media")
        self.assertEqual(response.data["linked_user"]["role"], "ltf_admin")
        member = Member.objects.get(id=response.data["id"])
        licence = member.licenses.get()
        self.assertIsNone(licence.club_id)
        self.assertEqual(licence.status, License.Status.ACTIVE)
        self.assertEqual(Order.objects.count(), 0)
        self.assertEqual(licence.history_events.get().club_name_snapshot, "")
        from licenses.history import no_club_label

        self.assertEqual(no_club_label("en"), "No club")
        self.assertEqual(no_club_label("fr"), "Aucun club")
        self.assertEqual(no_club_label("de"), "Kein Verein")
        self.assertEqual(no_club_label("lb"), "Kee Veräin")
        context = _build_context(
            member=member,
            license_record=licence,
            club=None,
            sample_data=None,
        )
        self.assertEqual(context["club.name"], "LTF")

    def test_ltf_coach_follows_the_same_license_rules(self):
        self.client.force_authenticate(user=self.admin)
        created = self.client.post(
            "/api/members/ltf-staff/",
            {
                "first_name": "Mira",
                "last_name": "Keller",
                "function": "coach",
                "license_type": self.license_type.id,
                "license_year": 2026,
            },
            format="json",
        )
        self.assertEqual(created.status_code, status.HTTP_201_CREATED, created.data)
        self.assertIsNone(created.data["club"])
        self.assertEqual(created.data["ltf_staff"]["function"], "coach")
        self.assertEqual(created.data["primary_license_role"], "Staff")
        member = Member.objects.get(id=created.data["id"])
        licence = member.licenses.get()
        self.assertIsNone(licence.club_id)
        self.assertEqual(licence.status, License.Status.ACTIVE)
        self.assertEqual(Order.objects.count(), 0)
        context = _build_context(member=member, license_record=licence, club=None, sample_data=None)
        self.assertEqual(context["club.name"], "LTF")
        self.assertEqual(context["primary_license_role"], "Staff")
        listed = self.client.get("/api/members/?staff_function=coach")
        self.assertEqual([row["id"] for row in listed.data], [member.id])
        secretary = self.client.post(
            "/api/members/ltf-staff/",
            {"member_id": self.club_member.id, "function": "secretary"},
            format="json",
        )
        self.assertEqual(secretary.status_code, status.HTTP_201_CREATED, secretary.data)
        self.assertEqual(secretary.data["ltf_staff"]["function"], "secretary")

    def test_ltf_medic_follows_the_same_license_rules(self):
        self.client.force_authenticate(user=self.admin)
        created = self.client.post(
            "/api/members/ltf-staff/",
            {
                "first_name": "Noa",
                "last_name": "Medic",
                "function": "medic",
                "license_type": self.license_type.id,
                "license_year": 2026,
            },
            format="json",
        )
        self.assertEqual(created.status_code, status.HTTP_201_CREATED, created.data)
        self.assertIsNone(created.data["club"])
        self.assertEqual(created.data["ltf_staff"]["function"], "medic")
        self.assertEqual(created.data["primary_license_role"], "Staff")
        member = Member.objects.get(id=created.data["id"])
        licence = member.licenses.get()
        self.assertIsNone(licence.club_id)
        self.assertEqual(licence.status, License.Status.ACTIVE)
        self.assertEqual(Order.objects.count(), 0)
        context = _build_context(member=member, license_record=licence, club=None, sample_data=None)
        self.assertEqual(context["club.name"], "LTF")
        self.assertEqual(context["primary_license_role"], "Staff")
        listed = self.client.get("/api/members/?staff_function=medic")
        self.assertEqual([row["id"] for row in listed.data], [member.id])

    def test_photographer_rows_stay_on_the_same_person_as_ltf_media(self):
        import importlib

        from django.apps import apps

        migration = importlib.import_module("members.migrations.0019_ltf_staff_medic_and_media")
        row = LtfStaffFunction.objects.create(
            member=self.club_member,
            function="photographer",
        )
        migration.rename_photographer_to_media(apps, None)
        row.refresh_from_db()
        self.assertEqual(row.function, "media")
        self.assertEqual(row.member_id, self.club_member.id)
        self.client.force_authenticate(user=self.admin)
        legacy = self.client.post(
            "/api/members/ltf-staff/",
            {
                "first_name": "Pia",
                "last_name": "Lens",
                "function": "photographer",
                "license_type": self.license_type.id,
                "license_year": 2026,
            },
            format="json",
        )
        self.assertEqual(legacy.status_code, status.HTTP_201_CREATED, legacy.data)
        self.assertEqual(legacy.data["ltf_staff"]["function"], "media")
        self.assertEqual(legacy.data["primary_license_role"], "Media")
        member = Member.objects.get(id=legacy.data["id"])
        context = _build_context(
            member=member,
            license_record=member.licenses.get(),
            club=None,
            sample_data=None,
        )
        self.assertEqual(context["club.name"], "LTF")
        listed = self.client.get("/api/members/?staff_function=photographer")
        self.assertEqual(
            {row["id"] for row in listed.data},
            {member.id, self.club_member.id},
        )
        media = self.client.get("/api/members/?staff_function=media")
        self.assertEqual({row["id"] for row in media.data}, {member.id, self.club_member.id})

    def test_finance_cannot_create_or_issue_staff_licenses(self):
        self.client.force_authenticate(user=self.finance)
        response = self.client.post(
            "/api/members/ltf-staff/",
            {"first_name": "Pat", "last_name": "Feiereisen", "function": "other"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_club_member_can_also_be_staff_and_keeps_club_license_flow(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.post(
            "/api/members/ltf-staff/",
            {
                "member_id": self.club_member.id,
                "function": "secretary",
                "started_on": "2026-01-01",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data["club"], self.club.id)
        self.assertTrue(response.data["is_ltf_staff"])
        issue = self.client.post(
            f"/api/members/{self.club_member.id}/ltf-staff-license/",
            {"license_type": self.license_type.id, "year": 2026},
            format="json",
        )
        self.assertEqual(issue.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(issue.data["detail"], "club_member_uses_club_licence")

    def test_roster_filter_and_club_admin_cannot_see_staff_without_a_club(self):
        self.client.force_authenticate(user=self.admin)
        created = self.client.post(
            "/api/members/ltf-staff/",
            {"first_name": "Yassine", "last_name": "Trabelsi", "function": "other"},
            format="json",
        )
        self.assertEqual(created.status_code, status.HTTP_201_CREATED, created.data)
        staff_id = created.data["id"]
        self.client.post(
            "/api/members/ltf-staff/",
            {"member_id": self.club_member.id, "function": "secretary"},
            format="json",
        )

        staff_rows = self.client.get("/api/members/?roster=staff")
        staff_ids = {row["id"] for row in staff_rows.data}
        self.assertIn(staff_id, staff_ids)
        self.assertIn(self.club_member.id, staff_ids)

        club_rows = self.client.get("/api/members/?roster=club")
        club_ids = {row["id"] for row in club_rows.data}
        self.assertNotIn(staff_id, club_ids)
        self.assertIn(self.club_member.id, club_ids)

        self.client.force_authenticate(user=self.club_admin)
        visible = self.client.get("/api/members/")
        visible_ids = {row["id"] for row in visible.data}
        self.assertIn(self.club_member.id, visible_ids)
        self.assertNotIn(staff_id, visible_ids)

    def test_links_existing_ltf_login_and_revoke_then_delete(self):
        self.client.force_authenticate(user=self.admin)
        created = self.client.post(
            "/api/members/ltf-staff/",
            {
                "first_name": "Andrea",
                "last_name": "Di Iulio",
                "function": "secretary",
                "username": "secretarylogin",
                "license_type": self.license_type.id,
            },
            format="json",
        )
        self.assertEqual(created.status_code, status.HTTP_201_CREATED, created.data)
        member_id = created.data["id"]
        self.assertEqual(created.data["linked_user"]["username"], "secretarylogin")

        blocked = self.client.delete(f"/api/members/{member_id}/ltf-staff/")
        self.assertEqual(blocked.status_code, status.HTTP_409_CONFLICT)

        revoked = self.client.post(f"/api/members/{member_id}/revoke-ltf-staff-license/", {}, format="json")
        self.assertEqual(revoked.status_code, status.HTTP_200_OK)
        self.assertEqual(revoked.data["status"], "revoked")
        self.assertEqual(Order.objects.count(), 0)

        removed = self.client.delete(f"/api/members/{member_id}/ltf-staff/")
        self.assertEqual(removed.status_code, status.HTTP_200_OK)
        self.assertTrue(removed.data["deleted_member"])
        self.assertFalse(Member.objects.filter(id=member_id).exists())

    def test_delete_staff_function_keeps_the_club_member(self):
        self.client.force_authenticate(user=self.admin)
        self.client.post(
            "/api/members/ltf-staff/",
            {"member_id": self.club_member.id, "function": "secretary"},
            format="json",
        )
        response = self.client.delete(f"/api/members/{self.club_member.id}/ltf-staff/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data["deleted_member"])
        self.club_member.refresh_from_db()
        self.assertEqual(self.club_member.club_id, self.club.id)
        self.assertFalse(LtfStaffFunction.objects.filter(member=self.club_member).exists())

    def test_overview_counts_staff_separately_from_club_members(self):
        Member.objects.create(club=None, first_name="Remy", last_name="Alazoula", is_active=True)
        staff = Member.objects.get(last_name="ALAZOULA")
        LtfStaffFunction.objects.create(member=staff, function=LtfStaffFunction.Function.OTHER)
        cache.clear()
        self.client.force_authenticate(user=self.admin)
        response = self.client.get("/api/dashboard/overview/ltf-admin/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["cards"]["active_members"], 1)
        self.assertEqual(response.data["cards"]["ltf_staff"], 1)
        self.assertEqual(response.data["top_clubs"][0]["active_members"], 1)
        self.assertTrue(
            all(row["club_id"] != staff.id for row in response.data["top_clubs"])
        )

    def _staff_member(self, first_name, last_name):
        member = Member.objects.create(
            club=None,
            first_name=first_name,
            last_name=last_name,
            is_active=True,
        )
        LtfStaffFunction.objects.create(
            member=member,
            function=LtfStaffFunction.Function.SECRETARY,
        )
        return member

    def test_issue_refuses_a_past_year_and_keeps_next_year_pending(self):
        self.client.force_authenticate(user=self.admin)
        member = self._staff_member("Faustino", "Secretary")
        today = timezone.localdate()
        past = self.client.post(
            f"/api/members/{member.id}/ltf-staff-license/",
            {"license_type": self.license_type.id, "year": today.year - 1},
            format="json",
        )
        self.assertEqual(past.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(past.data["detail"], "past_year")
        self.assertFalse(member.licenses.exists())

        future = self.client.post(
            f"/api/members/{member.id}/ltf-staff-license/",
            {"license_type": self.license_type.id, "year": today.year + 1},
            format="json",
        )
        self.assertEqual(future.status_code, status.HTTP_201_CREATED, future.data)
        self.assertEqual(future.data["status"], License.Status.PENDING)
        pending = member.licenses.get()
        self.assertIsNone(pending.club_id)
        self.assertEqual(pending.start_date, date(today.year + 1, 1, 1))
        self.assertEqual(pending.end_date, date(today.year + 1, 12, 31))
        self.assertEqual(Order.objects.count(), 0)
        self.assertEqual(_compute_validity_badge(pending), License.Status.PENDING)

        too_far = self.client.post(
            f"/api/members/{member.id}/ltf-staff-license/",
            {"license_type": self.license_type.id, "year": today.year + 2},
            format="json",
        )
        self.assertEqual(too_far.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(too_far.data["detail"], "year_not_allowed")

        current = self.client.post(
            f"/api/members/{member.id}/ltf-staff-license/",
            {"license_type": self.license_type.id, "year": today.year},
            format="json",
        )
        self.assertEqual(current.status_code, status.HTTP_201_CREATED, current.data)
        self.assertEqual(current.data["status"], License.Status.ACTIVE)
        active = member.licenses.get(year=today.year)
        self.assertNotEqual(_compute_validity_badge(active), "expired")
        self.assertEqual(activate_eligible_paid_licenses(), 0)
        pending.refresh_from_db()
        self.assertEqual(pending.status, License.Status.PENDING)

    def test_expiry_and_activation_include_staff_licenses_without_a_club(self):
        member = self._staff_member("Mila", "Fox")
        today = timezone.localdate()
        past = License.objects.create(
            member=member,
            club=None,
            license_type=self.license_type,
            year=today.year - 1,
            status=License.Status.ACTIVE,
        )
        self.assertEqual(past.end_date, date(today.year - 1, 12, 31))
        current = License.objects.create(
            member=member,
            club=None,
            license_type=self.license_type,
            year=today.year,
            status=License.Status.PENDING,
            start_date=date(today.year, 1, 1),
            end_date=date(today.year, 12, 31),
        )

        expired_count = reconcile_expired_licenses()
        past.refresh_from_db()
        current.refresh_from_db()
        self.assertEqual(expired_count, 1)
        self.assertEqual(past.status, License.Status.EXPIRED)
        self.assertEqual(current.status, License.Status.PENDING)
        expired_event = past.history_events.get(event_type=LicenseHistoryEvent.EventType.EXPIRED)
        self.assertIsNone(expired_event.club_id)
        self.assertEqual(expired_event.club_name_snapshot, "")

        activated_count = activate_eligible_paid_licenses()
        current.refresh_from_db()
        self.assertEqual(activated_count, 1)
        self.assertEqual(current.status, License.Status.ACTIVE)
        self.assertEqual(Order.objects.count(), 0)

        untouched = License.objects.create(
            member=Member.objects.create(club=self.club, first_name="Lea", last_name="Weber"),
            club=self.club,
            license_type=self.license_type,
            year=today.year,
            status=License.Status.PENDING,
        )
        self.assertEqual(activate_eligible_paid_licenses(), 0)
        untouched.refresh_from_db()
        self.assertEqual(untouched.status, License.Status.PENDING)
        self.assertEqual(expire_outdated_licenses(), 0)

    def test_expired_staff_license_counts_as_expired_and_not_valid(self):
        member = self._staff_member("Remy", "Past")
        today = timezone.localdate()
        License.objects.create(
            member=member,
            club=None,
            license_type=self.license_type,
            year=today.year - 1,
            status=License.Status.EXPIRED,
            start_date=date(today.year - 1, 1, 1),
            end_date=date(today.year - 1, 12, 31),
        )
        cache.clear()
        self.client.force_authenticate(user=self.admin)
        overview = self.client.get("/api/dashboard/overview/ltf-admin/")
        self.assertEqual(overview.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(overview.data["cards"]["expired_licenses"], 1)
        queue = {
            row["key"]: row["count"] for row in overview.data["action_queue"]
        }
        self.assertGreaterEqual(queue["members_without_active_or_pending_license"], 1)
        missing = self.client.get("/api/members/?issue=no_valid_license")
        self.assertEqual(missing.status_code, status.HTTP_200_OK)
        self.assertIn(member.id, {row["id"] for row in missing.data})

    def test_ended_function_is_not_current_staff(self):
        member = Member.objects.create(club=self.club, first_name="Hugo", last_name="Lopes")
        LtfStaffFunction.objects.create(
            member=member,
            function=LtfStaffFunction.Function.SECRETARY,
            started_on=date(2020, 1, 1),
            ended_on=timezone.localdate(),
        )
        self.client.force_authenticate(user=self.admin)
        response = self.client.get("/api/members/?roster=staff")
        self.assertNotIn(member.id, {row["id"] for row in response.data})
