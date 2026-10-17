from datetime import date
from unittest.mock import patch

from django.core.cache import cache
from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from accounts.models import User
from clubs.models import Club
from licenses.card_rendering import _build_context
from licenses.models import License, LicenseType, Order

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

    def test_admin_creates_staff_without_club_and_issues_licence_without_order(self):
        self.client.force_authenticate(user=self.admin)
        with patch("accounts.email_utils.send_password_reset_email", return_value=(True, None)):
            response = self.client.post(
                "/api/members/ltf-staff/",
                {
                    "first_name": "Alexandr",
                    "last_name": "Nagornyi",
                    "email": "alex@nagornyi.lu",
                    "sex": "M",
                    "function": "photographer",
                    "license_type": self.license_type.id,
                    "license_year": 2026,
                    "create_login_role": "ltf_admin",
                },
                format="json",
            )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertIsNone(response.data["club"])
        self.assertTrue(response.data["is_ltf_staff"])
        self.assertEqual(response.data["ltf_staff"]["function"], "photographer")
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

    def test_finance_cannot_create_or_issue_staff_licences(self):
        self.client.force_authenticate(user=self.finance)
        response = self.client.post(
            "/api/members/ltf-staff/",
            {"first_name": "Pat", "last_name": "Feiereisen", "function": "other"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_club_member_can_also_be_staff_and_keeps_club_licence_flow(self):
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
