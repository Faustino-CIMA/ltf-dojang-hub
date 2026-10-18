from datetime import date
from decimal import Decimal

from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from accounts.models import User
from clubs.models import Club
from members.models import Member
from modules.codes import build_payload, sign_payload
from modules.entitlements import install_id_str, redeem_product_code, set_club_assignment
from modules.registry import CLUB_MANAGEMENT_MODULE_ID

from .body_measurements import BodyMeasurement


@override_settings(DEBUG=True, MODULE_CODE_PUBLIC_KEY="", MODULE_CODE_PRIVATE_KEY="")
class ClubTeamApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.ltf_admin = User.objects.create_user(username="ltf-team", password="pass12345", role=User.Roles.LTF_ADMIN)
        self.finance = User.objects.create_user(username="fin-team", password="pass12345", role=User.Roles.LTF_FINANCE)
        self.club_admin = User.objects.create_user(username="club-team", password="pass12345", role=User.Roles.CLUB_ADMIN)
        self.coach = User.objects.create_user(username="coach-team", password="pass12345", role=User.Roles.COACH)
        self.other_admin = User.objects.create_user(username="other-team", password="pass12345", role=User.Roles.CLUB_ADMIN)
        self.member_user = User.objects.create_user(username="member-team", password="pass12345", role=User.Roles.MEMBER)
        self.club = Club.objects.create(name="Team Club", created_by=self.ltf_admin)
        self.other = Club.objects.create(name="Other Team", created_by=self.ltf_admin)
        self.plain = Club.objects.create(name="No Module Team", created_by=self.ltf_admin)
        self.club.admins.add(self.club_admin)
        self.club.trainers.add(self.coach)
        self.other.admins.add(self.other_admin)
        self.plain.admins.add(self.club_admin)
        self.lea = Member.objects.create(club=self.club, first_name="Lea", last_name="Weber", sex=Member.Sex.FEMALE)
        self.mira = Member.objects.create(club=self.club, first_name="Mira", last_name="Keller", sex=Member.Sex.FEMALE)
        self.outsider = Member.objects.create(club=self.other, first_name="Noa", last_name="Klein", sex=Member.Sex.MALE)
        self.lea.user = self.member_user
        self.lea.save(update_fields=["user"])

    def _unlock(self, *clubs):
        token = sign_payload(build_payload(module_ids=[CLUB_MANAGEMENT_MODULE_ID], install_id=install_id_str()))
        redeem_product_code(token)
        for club in clubs or (self.club, self.other):
            set_club_assignment(club=club, module_id=CLUB_MANAGEMENT_MODULE_ID, enabled=True, user=self.ltf_admin)

    def _auth(self, user):
        self.client.force_authenticate(user=user)

    def test_club_admin_and_coach_manage_teams_and_members(self):
        self._unlock()
        self._auth(self.club_admin)
        created = self.client.post(
            "/api/club-management/teams/",
            {"club": self.club.id, "name": "Cadets", "discipline": "kyorugi", "note": "Competition"},
            format="json",
        )
        self.assertEqual(created.status_code, 201, created.data)
        team_id = created.data["id"]
        self.assertEqual(created.data["member_count"], 0)
        added = self.client.post(
            f"/api/club-management/teams/{team_id}/members/",
            {"member": self.lea.id},
            format="json",
        )
        self.assertEqual(added.status_code, 200, added.data)
        self.assertEqual(added.data["members"][0]["last_name"], "WEBER")
        self._auth(self.coach)
        poomsae = self.client.post(
            "/api/club-management/teams/",
            {"club": self.club.id, "name": "Poomsae A", "discipline": "poomsae"},
            format="json",
        )
        self.assertEqual(poomsae.status_code, 201, poomsae.data)
        also = self.client.post(
            f"/api/club-management/teams/{poomsae.data['id']}/members/",
            {"member": self.lea.id},
            format="json",
        )
        self.assertEqual(also.status_code, 200, also.data)
        listed = self.client.get(f"/api/club-management/teams/?club={self.club.id}")
        self.assertEqual(listed.status_code, 200, listed.data)
        self.assertEqual([row["name"] for row in listed.data], ["Cadets", "Poomsae A"])
        member = self.client.get(f"/api/members/{self.lea.id}/")
        self.assertEqual(member.status_code, 200, member.data)
        self.assertEqual({row["name"] for row in member.data["teams"]}, {"Cadets", "Poomsae A"})
        edited = self.client.patch(
            f"/api/club-management/teams/{team_id}/",
            {"note": "Updated"},
            format="json",
        )
        self.assertEqual(edited.status_code, 200, edited.data)
        self.assertEqual(edited.data["note"], "Updated")

    def test_permissions_and_cross_club_member(self):
        self._unlock()
        self._auth(self.club_admin)
        created = self.client.post(
            "/api/club-management/teams/",
            {"club": self.club.id, "name": "Cadets", "discipline": "kyorugi"},
            format="json",
        )
        team_id = created.data["id"]
        refused = self.client.post(
            f"/api/club-management/teams/{team_id}/members/",
            {"member": self.outsider.id},
            format="json",
        )
        self.assertEqual(refused.status_code, 400, refused.data)
        self.assertIn("member_other_club", str(refused.data))
        missing = self.client.post(
            "/api/club-management/teams/",
            {"club": self.club.id, "name": " ", "discipline": "sparring"},
            format="json",
        )
        self.assertEqual(missing.status_code, 400, missing.data)
        for user in (self.other_admin, self.member_user, self.ltf_admin, self.finance):
            self._auth(user)
            response = self.client.get(f"/api/club-management/teams/?club={self.club.id}")
            self.assertEqual(response.status_code, 403, (user.role, response.data))
            detail = self.client.get(f"/api/club-management/teams/{team_id}/")
            self.assertEqual(detail.status_code, 403, (user.role, detail.data))
        self._auth(self.club_admin)
        plain = self.client.post(
            "/api/club-management/teams/",
            {"club": self.plain.id, "name": "Hidden", "discipline": "kyorugi"},
            format="json",
        )
        self.assertEqual(plain.status_code, 403, plain.data)
        self._auth(self.ltf_admin)
        roster = self.client.get("/api/members/")
        self.assertEqual(roster.status_code, 200, roster.data)
        self.assertNotIn("teams", roster.data[0])

    def test_member_list_filters_a_team_and_keeps_latest_measurements(self):
        self._unlock()
        self._auth(self.club_admin)
        created = self.client.post(
            "/api/club-management/teams/",
            {"club": self.club.id, "name": "Cadets", "discipline": "kyorugi"},
            format="json",
        )
        team_id = created.data["id"]
        self.client.post(f"/api/club-management/teams/{team_id}/members/", {"member": self.lea.id}, format="json")
        BodyMeasurement.objects.create(member=self.lea, measured_on=date(2026, 8, 20), weight_kg=Decimal("62.4"), height_cm=170)
        BodyMeasurement.objects.create(member=self.mira, measured_on=date(2026, 6, 1), weight_kg=Decimal("48.0"), height_cm=158)
        listed = self.client.get(f"/api/members/?club_id={self.club.id}&teams={team_id}&ordering=-latest_weight")
        self.assertEqual(listed.status_code, 200, listed.data)
        rows = listed.data["results"] if isinstance(listed.data, dict) else listed.data
        self.assertEqual([row["id"] for row in rows], [self.lea.id])
        self.assertEqual(rows[0]["latest_weight_kg"], "62.4")
        self.assertEqual(rows[0]["teams"][0]["name"], "Cadets")
        both = self.client.get(f"/api/members/?club_id={self.club.id}&ordering=teams")
        both_rows = both.data["results"] if isinstance(both.data, dict) else both.data
        names = [row["last_name"] for row in both_rows]
        self.assertLess(names.index("WEBER"), names.index("KELLER"))
