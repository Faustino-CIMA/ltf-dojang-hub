from datetime import date
from decimal import Decimal

from django.test import SimpleTestCase, TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from clubs.models import Club
from licenses.models import License, LicenseType
from members.models import Member
from modules.codes import build_payload, sign_payload
from modules.entitlements import install_id_str, redeem_product_code, set_club_assignment
from modules.registry import CLUB_MANAGEMENT_MODULE_ID

from .body_measurements import BodyMeasurement, kyorugi_margin, poomsae_division
from .teams import WeightCategoryBand


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

    def test_roster_uses_the_discipline_and_keeps_measurements_on_the_member(self):
        self._unlock()
        year = timezone.localdate().year
        self.lea.date_of_birth = date(year - 16, 6, 1)
        self.lea.belt_rank = "4th Kup"
        self.lea.save()
        self.mira.date_of_birth = date(year - 8, 3, 1)
        self.mira.sex = Member.Sex.MALE
        self.mira.belt_rank = "8th Kup"
        self.mira.save()
        license_type = LicenseType.objects.create(name="Athlete", code="ath-roster")
        License.objects.create(
            member=self.lea,
            club=self.club,
            license_type=license_type,
            year=year,
            start_date=date(year, 1, 1),
            end_date=date(year, 12, 31),
            status=License.Status.ACTIVE,
        )
        License.objects.create(
            member=self.lea,
            club=self.club,
            license_type=license_type,
            year=year - 1,
            start_date=date(year - 1, 1, 1),
            end_date=date(year - 1, 12, 31),
            status=License.Status.EXPIRED,
        )
        BodyMeasurement.objects.create(
            member=self.lea,
            measured_on=date(year, 8, 20),
            weight_kg=Decimal("62.4"),
            height_cm=170,
        )
        BodyMeasurement.objects.create(member=self.mira, measured_on=date(year, 6, 1), weight_kg=Decimal("30.0"))
        self._auth(self.club_admin)
        kyorugi = self.client.post(
            "/api/club-management/teams/",
            {"club": self.club.id, "name": "Cadets", "discipline": "kyorugi"},
            format="json",
        )
        poomsae = self.client.post(
            "/api/club-management/teams/",
            {"club": self.club.id, "name": "Poomsae A", "discipline": "poomsae"},
            format="json",
        )
        self.client.post(f"/api/club-management/teams/{kyorugi.data['id']}/members/", {"member": self.lea.id}, format="json")
        self.client.post(f"/api/club-management/teams/{kyorugi.data['id']}/members/", {"member": self.mira.id}, format="json")
        self.client.post(f"/api/club-management/teams/{poomsae.data['id']}/members/", {"member": self.lea.id}, format="json")

        detail = self.client.get(f"/api/club-management/teams/{kyorugi.data['id']}/")
        self.assertEqual(detail.status_code, 200, detail.data)
        by_id = {row["id"]: row for row in detail.data["members"]}
        lea = by_id[self.lea.id]
        self.assertEqual(lea["birth_year"], year - 16)
        self.assertEqual(lea["age_class"], "junior")
        self.assertEqual(lea["belt_rank"], "4th Kup")
        self.assertEqual(lea["latest_weight_kg"], "62.4")
        self.assertEqual(lea["weight_category"], "-63 kg")
        self.assertEqual(lea["weight_delta_kg"], "-0.6")
        self.assertEqual(lea["latest_height_cm"], 170)
        self.assertEqual(lea["licence_status"], "active")
        self.assertEqual(lea["poomsae_division"], "junior")
        mira = by_id[self.mira.id]
        self.assertEqual(mira["age_class"], "pupils")
        self.assertEqual(mira["latest_weight_kg"], "30.0")
        self.assertEqual(mira["weight_category"], "")
        self.assertEqual(mira["weight_category_reason"], "pupils")
        self.assertEqual(mira["role"], "athlete")
        self.assertIsNone(mira["weight_delta_kg"])
        self.assertEqual(mira["poomsae_division"], "")
        self.assertEqual(mira["licence_status"], "none")

        forms = self.client.get(f"/api/club-management/teams/{poomsae.data['id']}/")
        shared = forms.data["members"][0]
        self.assertEqual(shared["id"], self.lea.id)
        self.assertEqual(shared["latest_weight_kg"], lea["latest_weight_kg"])
        self.assertEqual(shared["latest_weight_on"], lea["latest_weight_on"])
        self.assertEqual(shared["poomsae_division"], "junior")

    def test_weigh_in_competition_warnings_export_and_poomsae_groups(self):
        self._unlock()
        year = timezone.localdate().year
        self.lea.date_of_birth = date(year - 16, 6, 1)
        self.lea.belt_rank = "4th Kup"
        self.lea.save()
        self.mira.date_of_birth = date(year - 12, 3, 1)
        self.mira.sex = Member.Sex.MALE
        self.mira.save()
        noa = Member.objects.create(
            club=self.club,
            first_name="Noa",
            last_name="Hoffmann",
            sex=Member.Sex.FEMALE,
            date_of_birth=date(year - 16, 1, 2),
        )
        license_type = LicenseType.objects.create(name="Athlete", code="ath-extra")
        License.objects.create(
            member=self.lea,
            club=self.club,
            license_type=license_type,
            year=year,
            start_date=date(year, 1, 1),
            end_date=date(year, 6, 30),
            status=License.Status.ACTIVE,
        )
        BodyMeasurement.objects.create(member=self.lea, measured_on=date(year, 8, 20), weight_kg=Decimal("62.4"), height_cm=170)
        self._auth(self.club_admin)
        created = self.client.post(
            "/api/club-management/teams/",
            {"club": self.club.id, "name": "Cadets", "discipline": "kyorugi"},
            format="json",
        )
        team_id = created.data["id"]
        self.assertEqual(created.data["weight_margin_kg"], "1.0")
        for member in (self.lea, self.mira):
            self.client.post(f"/api/club-management/teams/{team_id}/members/", {"member": member.id}, format="json")
        weighed = self.client.post(
            f"/api/club-management/teams/{team_id}/weigh-in/",
            {
                "measured_on": f"{year}-09-01",
                "entries": [
                    {"member": self.mira.id, "weight_kg": "30.0"},
                    {"member": self.lea.id, "weight_kg": ""},
                ],
            },
            format="json",
        )
        self.assertEqual(weighed.status_code, 200, weighed.data)
        self.assertEqual(weighed.data["created"], 1)
        mira = next(row for row in weighed.data["team"]["members"] if row["id"] == self.mira.id)
        self.assertEqual(mira["latest_weight_kg"], "30.0")
        self.assertEqual(mira["latest_weight_on"], f"{year}-09-01")
        competition = self.client.patch(
            f"/api/club-management/teams/{team_id}/",
            {
                "competition_on": f"{year}-09-12",
                "competition_name": "Open",
                "weight_margin_kg": "1.0",
            },
            format="json",
        )
        self.assertEqual(competition.status_code, 200, competition.data)
        detail = self.client.get(f"/api/club-management/teams/{team_id}/")
        by_id = {row["id"]: row for row in detail.data["members"]}
        lea = by_id[self.lea.id]
        mira_row = by_id[self.mira.id]
        self.assertEqual(detail.data["competition_name"], "Open")
        self.assertEqual(lea["age_class"], "junior")
        self.assertEqual(lea["weight_category"], "-63 kg")
        self.assertEqual(lea["weight_delta_kg"], "-0.6")
        self.assertTrue(lea["weight_warning"])
        self.assertEqual(lea["licence_warning"], "expires")
        self.assertEqual(mira_row["licence_warning"], "missing")
        self.assertFalse(mira_row["weight_warning"])
        later = self.client.patch(
            f"/api/club-management/teams/{team_id}/",
            {"competition_on": f"{year + 1}-03-01"},
            format="json",
        )
        aged = next(row for row in later.data["members"] if row["id"] == self.lea.id)
        self.assertEqual(aged["age_class"], "senior")
        sheet = self.client.get(f"/api/club-management/teams/{team_id}/sheet.csv?lang=en")
        self.assertEqual(sheet.status_code, 200, sheet.content)
        text = sheet.content.decode("utf-8-sig")
        self.assertIn("Cadets", text)
        self.assertIn("Kyorugi", text)
        self.assertIn("62.4", text)
        self.assertIn("Licence expires before the competition", text)
        pdf = self.client.get(f"/api/club-management/teams/{team_id}/sheet.pdf?lang=fr")
        self.assertEqual(pdf.status_code, 200, pdf.content[:20])
        self.assertTrue(pdf.content.startswith(b"%PDF"))
        refused = self.client.post(
            f"/api/club-management/teams/{team_id}/groups/",
            {"kind": "pair", "members": [self.lea.id, self.mira.id]},
            format="json",
        )
        self.assertEqual(refused.status_code, 400, refused.data)
        self.assertIn("group_discipline", str(refused.data))

        poomsae = self.client.post(
            "/api/club-management/teams/",
            {"club": self.club.id, "name": "Poomsae A", "discipline": "poomsae"},
            format="json",
        )
        poomsae_id = poomsae.data["id"]
        for member in (self.lea, self.mira, noa):
            self.client.post(f"/api/club-management/teams/{poomsae_id}/members/", {"member": member.id}, format="json")
        same_sex = self.client.post(
            f"/api/club-management/teams/{poomsae_id}/groups/",
            {"kind": "pair", "members": [self.lea.id, noa.id]},
            format="json",
        )
        self.assertEqual(same_sex.status_code, 400, same_sex.data)
        self.assertIn("pair_mixed", str(same_sex.data))
        pair = self.client.post(
            f"/api/club-management/teams/{poomsae_id}/groups/",
            {"kind": "pair", "name": "A", "members": [self.lea.id, self.mira.id]},
            format="json",
        )
        self.assertEqual(pair.status_code, 201, pair.data)
        self.assertEqual(pair.data["groups"][0]["kind"], "pair")
        self.assertEqual({row["id"] for row in pair.data["groups"][0]["members"]}, {self.lea.id, self.mira.id})
        too_small = self.client.post(
            f"/api/club-management/teams/{poomsae_id}/groups/",
            {"kind": "team", "members": [self.lea.id, noa.id]},
            format="json",
        )
        self.assertEqual(too_small.status_code, 400, too_small.data)
        self.assertIn("team_size", str(too_small.data))
        third = Member.objects.create(
            club=self.club,
            first_name="Eva",
            last_name="Martin",
            sex=Member.Sex.FEMALE,
            date_of_birth=date(year - 15, 4, 4),
        )
        self.client.post(f"/api/club-management/teams/{poomsae_id}/members/", {"member": third.id}, format="json")
        mixed_trio = self.client.post(
            f"/api/club-management/teams/{poomsae_id}/groups/",
            {"kind": "team", "members": [self.lea.id, noa.id, self.mira.id]},
            format="json",
        )
        self.assertEqual(mixed_trio.status_code, 400, mixed_trio.data)
        self.assertIn("team_same_sex", str(mixed_trio.data))
        trio = self.client.post(
            f"/api/club-management/teams/{poomsae_id}/groups/",
            {"kind": "team", "name": "Forms", "members": [self.lea.id, noa.id, third.id]},
            format="json",
        )
        self.assertEqual(trio.status_code, 201, trio.data)
        self.assertEqual({row["kind"] for row in trio.data["groups"]}, {"pair", "team"})
        self._auth(self.ltf_admin)
        blocked = self.client.post(
            f"/api/club-management/teams/{team_id}/weigh-in/",
            {"measured_on": f"{year}-09-01", "entries": [{"member": self.lea.id, "weight_kg": "60.0"}]},
            format="json",
        )
        self.assertEqual(blocked.status_code, 403, blocked.data)

    def test_coaches_and_blank_weight_category(self):
        self._unlock()
        year = timezone.localdate().year
        self.coach.first_name = "Ann"
        self.coach.last_name = "Keller"
        self.coach.save(update_fields=["first_name", "last_name"])
        coach_member = Member.objects.create(
            club=self.club,
            user=self.coach,
            first_name="Ann",
            last_name="Keller",
            sex=Member.Sex.FEMALE,
            date_of_birth=date(1980, 4, 4),
        )
        minimes = Member.objects.create(
            club=self.club,
            first_name="Noa",
            last_name="Petit",
            sex=Member.Sex.MALE,
            date_of_birth=date(year - 10, 5, 5),
        )
        no_birth = Member.objects.create(club=self.club, first_name="Kim", last_name="Blank", sex=Member.Sex.FEMALE)
        no_sex = Member.objects.create(
            club=self.club,
            first_name="Sam",
            last_name="Unset",
            sex="",
            date_of_birth=date(year - 16, 1, 1),
        )
        height_only = Member.objects.create(
            club=self.club,
            first_name="Eva",
            last_name="Tall",
            sex=Member.Sex.FEMALE,
            date_of_birth=date(year - 16, 2, 2),
        )
        older = Member.objects.create(
            club=self.club,
            first_name="Marc",
            last_name="Senior",
            sex=Member.Sex.MALE,
            date_of_birth=date(year - 45, 3, 3),
        )
        BodyMeasurement.objects.create(member=minimes, measured_on=date(year, 6, 1), weight_kg=Decimal("32.5"))
        BodyMeasurement.objects.create(member=no_birth, measured_on=date(year, 6, 1), weight_kg=Decimal("55.0"))
        BodyMeasurement.objects.create(member=no_sex, measured_on=date(year, 6, 1), weight_kg=Decimal("62.4"))
        BodyMeasurement.objects.create(member=height_only, measured_on=date(year, 5, 1), weight_kg=Decimal("54.0"))
        BodyMeasurement.objects.create(member=height_only, measured_on=date(year, 8, 1), height_cm=170)
        BodyMeasurement.objects.create(member=older, measured_on=date(year, 6, 1), weight_kg=Decimal("54.1"))
        self._auth(self.club_admin)
        created = self.client.post(
            "/api/club-management/teams/",
            {"club": self.club.id, "name": "Cadets", "discipline": "kyorugi"},
            format="json",
        )
        team_id = created.data["id"]
        self.assertIn(coach_member.id, created.data["suggested_coach_ids"])
        for member in (minimes, no_birth, no_sex, height_only, older, coach_member):
            self.client.post(f"/api/club-management/teams/{team_id}/members/", {"member": member.id}, format="json")
        promoted = self.client.patch(
            f"/api/club-management/teams/{team_id}/members/{coach_member.id}/",
            {"role": "coach"},
            format="json",
        )
        self.assertEqual(promoted.status_code, 200, promoted.data)
        self.assertEqual(promoted.data["athlete_count"], 5)
        self.assertEqual(promoted.data["coach_count"], 1)
        self.assertEqual(promoted.data["member_count"], 6)
        listed = self.client.get(f"/api/club-management/teams/?club={self.club.id}")
        listed_row = next(row for row in listed.data if row["id"] == team_id)
        self.assertEqual(listed_row["athlete_count"], 5)
        self.assertEqual(listed_row["coach_count"], 1)
        by_id = {row["id"]: row for row in promoted.data["members"]}
        self.assertEqual(by_id[minimes.id]["weight_category"], "")
        self.assertEqual(by_id[minimes.id]["weight_category_reason"], "minimes")
        self.assertEqual(by_id[minimes.id]["latest_weight_kg"], "32.5")
        self.assertFalse(by_id[minimes.id]["weight_warning"])
        self.assertEqual(by_id[no_birth.id]["weight_category_reason"], "no_birth_date")
        self.assertEqual(by_id[no_sex.id]["weight_category_reason"], "no_sex")
        self.assertEqual(by_id[height_only.id]["weight_category"], "-55 kg")
        self.assertEqual(by_id[height_only.id]["latest_weight_kg"], "54.0")
        self.assertEqual(by_id[height_only.id]["weight_category_reason"], "")
        self.assertEqual(by_id[older.id]["age_class"], "senior")
        self.assertEqual(by_id[older.id]["weight_category"], "-58 kg")
        coach_row = by_id[coach_member.id]
        self.assertEqual(coach_row["role"], "coach")
        self.assertEqual(coach_row["age_class"], "")
        self.assertEqual(coach_row["weight_category"], "")
        self.assertEqual(coach_row["weight_category_reason"], "")
        self.assertFalse(coach_row["weight_warning"])
        dated = self.client.patch(
            f"/api/club-management/teams/{team_id}/",
            {"competition_on": f"{year}-09-12"},
            format="json",
        )
        dated_rows = {row["id"]: row for row in dated.data["members"]}
        self.assertEqual(dated_rows[coach_member.id]["licence_warning"], "missing")
        self.assertEqual(dated_rows[older.id]["weight_category"], "-58 kg")
        weighed = self.client.post(
            f"/api/club-management/teams/{team_id}/weigh-in/",
            {
                "measured_on": f"{year}-09-01",
                "entries": [
                    {"member": coach_member.id, "weight_kg": "70.0"},
                    {"member": minimes.id, "weight_kg": "33.0"},
                ],
            },
            format="json",
        )
        self.assertEqual(weighed.status_code, 200, weighed.data)
        self.assertEqual(weighed.data["created"], 1)
        self.assertFalse(BodyMeasurement.objects.filter(member=coach_member).exists())
        forms = self.client.post(
            "/api/club-management/teams/",
            {"club": self.club.id, "name": "Poomsae A", "discipline": "poomsae"},
            format="json",
        )
        forms_id = forms.data["id"]
        self.client.post(
            f"/api/club-management/teams/{forms_id}/members/",
            {"member": coach_member.id, "role": "coach"},
            format="json",
        )
        self.client.post(f"/api/club-management/teams/{forms_id}/members/", {"member": minimes.id}, format="json")
        self.client.post(f"/api/club-management/teams/{forms_id}/members/", {"member": no_birth.id}, format="json")
        refused = self.client.post(
            f"/api/club-management/teams/{forms_id}/groups/",
            {"kind": "pair", "members": [coach_member.id, minimes.id]},
            format="json",
        )
        self.assertEqual(refused.status_code, 400, refused.data)
        self.assertIn("member_not_on_team", str(refused.data))
        sheet = self.client.get(f"/api/club-management/teams/{team_id}/sheet.csv?lang=en")
        text = sheet.content.decode("utf-8-sig")
        self.assertIn("Athletes", text)
        self.assertIn("Coaches", text)
        self.assertIn("No WT category for Minimes", text)
        self.assertIn("KELLER Ann", text)
        self.assertNotIn("70.0", text)
        member = self.client.get(f"/api/members/{coach_member.id}/")
        roles = {row["name"]: row["role"] for row in member.data["teams"]}
        self.assertEqual(roles["Cadets"], "coach")
        self.assertEqual(roles["Poomsae A"], "coach")


    def test_category_sets_resolve_per_preset(self):
        self._unlock()
        self._auth(self.club_admin)
        created = self.client.post(
            "/api/club-management/teams/",
            {"club": self.club.id, "name": "Youth", "discipline": "kyorugi"},
            format="json",
        )
        self.assertEqual(created.status_code, 201, created.data)
        self.assertEqual(created.data["category_set"], "wt")
        team_id = created.data["id"]
        catalog = {row["code"]: row for row in created.data["category_sets"]}
        self.assertIn("Keumgang", catalog["be"]["source_note"])
        self.assertTrue(catalog["nl"]["source_note"].startswith("Netherlands"))
        self.assertEqual(catalog["nl"]["age_basis"], "competition_day")
        self.assertEqual(catalog["be"]["age_basis"], "birth_year")

        def person(first, sex, born, weight):
            member = Member.objects.create(
                club=self.club,
                first_name=first,
                last_name="Roster",
                sex=sex,
                date_of_birth=born,
            )
            self.client.post(f"/api/club-management/teams/{team_id}/members/", {"member": member.id}, format="json")
            if weight is not None:
                BodyMeasurement.objects.create(
                    member=member,
                    measured_on=date(2026, 8, 1),
                    weight_kg=Decimal(weight),
                    recorded_by=self.club_admin,
                )
            return member

        on_limit = person("Noa", Member.Sex.MALE, date(2016, 4, 12), "30.0")
        under = person("Luc", Member.Sex.MALE, date(2016, 4, 12), "28.0")
        close = person("Eva", Member.Sex.FEMALE, date(2016, 4, 12), "29.2")
        age_six = person("Tim", Member.Sex.MALE, date(2020, 1, 1), "20.0")
        nl_edge = person("Bas", Member.Sex.MALE, date(2017, 9, 20), "50.0")
        girl = person("Lina", Member.Sex.FEMALE, date(2017, 3, 1), "20.0")
        boy = person("Paul", Member.Sex.MALE, date(2017, 1, 15), "20.0")
        age_eleven = person("Otto", Member.Sex.MALE, date(2015, 2, 1), "24.0")
        cadet = person("Max", Member.Sex.MALE, date(2014, 6, 1), "40.2")
        junior = person("Lea", Member.Sex.FEMALE, date(2010, 6, 1), "62.4")
        senior = person("Marc", Member.Sex.MALE, date(1981, 3, 1), "54.1")
        age_eight = person("Kim", Member.Sex.MALE, date(2018, 5, 1), "21.0")
        age_seven = person("Uwe", Member.Sex.MALE, date(2019, 1, 1), "22.0")
        coach = Member.objects.create(
            club=self.club, first_name="Ann", last_name="Coach", sex=Member.Sex.FEMALE, date_of_birth=date(1990, 1, 1)
        )
        self.client.post(
            f"/api/club-management/teams/{team_id}/members/",
            {"member": coach.id, "role": "coach"},
            format="json",
        )

        def apply(code, **extra):
            response = self.client.patch(
                f"/api/club-management/teams/{team_id}/",
                {"category_set": code, "competition_on": "2026-09-12", "competition_name": "Open", **extra},
                format="json",
            )
            self.assertEqual(response.status_code, 200, response.data)
            return {row["id"]: row for row in response.data["members"]}, response

        world, _payload = apply("wt")
        self.assertEqual(world[on_limit.id]["weight_category"], "")
        self.assertEqual(world[on_limit.id]["weight_category_reason"], "minimes")
        self.assertEqual(world[age_eleven.id]["age_class"], "cadet")
        self.assertEqual(world[age_eleven.id]["weight_category"], "-33 kg")

        belgium, _payload = apply("be")
        self.assertEqual(belgium[on_limit.id]["weight_category"], "-30 kg")
        self.assertEqual(belgium[on_limit.id]["weight_delta_kg"], "0.0")
        self.assertTrue(belgium[on_limit.id]["weight_warning"])
        self.assertEqual(belgium[under.id]["weight_category"], "-30 kg")
        self.assertEqual(belgium[under.id]["weight_delta_kg"], "-2.0")
        self.assertFalse(belgium[under.id]["weight_warning"])
        self.assertEqual(belgium[close.id]["weight_delta_kg"], "-0.8")
        self.assertTrue(belgium[close.id]["weight_warning"])
        self.assertEqual(belgium[age_six.id]["weight_category"], "")
        self.assertEqual(belgium[age_six.id]["weight_category_reason"], "no_set_age")
        self.assertEqual(belgium[age_six.id]["category_age"], 6)
        self.assertEqual(belgium[age_eleven.id]["age_class"], "cadet")
        self.assertEqual(belgium[age_eleven.id]["weight_category"], "-24 kg")
        self.assertEqual(belgium[nl_edge.id]["weight_category"], "-52 kg")
        self.assertEqual(belgium[cadet.id]["weight_category"], "-41 kg")
        self.assertEqual(belgium[cadet.id]["weight_delta_kg"], "-0.8")
        self.assertEqual(belgium[junior.id]["weight_category"], "-63 kg")
        self.assertEqual(belgium[senior.id]["weight_category"], "-58 kg")
        self.assertEqual(belgium[coach.id]["weight_category"], "")
        self.assertEqual(belgium[coach.id]["weight_category_reason"], "")
        sheet = self.client.get(f"/api/club-management/teams/{team_id}/sheet.csv?lang=en")
        text = sheet.content.decode("utf-8-sig")
        self.assertIn("Category set,Belgium", text)
        self.assertIn("-30 kg", text)
        self.assertIn("No category for age 6 in Belgium set", text)

        netherlands, _payload = apply("nl")
        self.assertEqual(netherlands[nl_edge.id]["weight_category"], "+44 kg")
        self.assertEqual(netherlands[nl_edge.id]["category_age"], 8)
        self.assertFalse(netherlands[nl_edge.id]["weight_warning"])
        self.assertEqual(netherlands[age_six.id]["weight_category"], "-21 kg")

        germany, _payload = apply("de")
        self.assertEqual(germany[age_seven.id]["weight_category"], "-22 kg")
        self.assertEqual(germany[on_limit.id]["weight_category"], "-32 kg")

        france, _payload = apply("fr")
        self.assertEqual(france[girl.id]["weight_category"], "-20 kg")
        self.assertEqual(france[boy.id]["weight_category"], "-21 kg")
        self.assertEqual(france[age_seven.id]["weight_category_reason"], "no_set_age")
        self.assertEqual(france[age_seven.id]["category_age"], 7)
        self.assertEqual(france[on_limit.id]["weight_category"], "-30 kg")

        austria, _payload = apply("at")
        self.assertEqual(austria[age_seven.id]["weight_category"], "-24 kg")
        self.assertEqual(austria[boy.id]["weight_category"], "-27 kg")

        band = WeightCategoryBand.objects.get(category_set__code="be", code="minimes")
        band.ceilings = [24, 27, 29, 33, 36, 40, 44, 48, 52]
        band.save(update_fields=["ceilings"])
        edited, _payload = apply("be")
        self.assertEqual(edited[on_limit.id]["weight_category"], "-33 kg")

        custom, payload = apply(
            "custom",
            custom_bands=[{"label": "U9", "age_min": 7, "age_max": 8, "sex": "X", "ceilings": "20,25"}],
        )
        self.assertEqual(custom[age_eight.id]["weight_category"], "-25 kg")
        self.assertEqual(payload.data["custom_bands"][0]["ceilings"], [20, 25])
        kept_rows, kept = apply("be")
        self.assertEqual(len(kept.data["custom_bands"]), 1)
        self.assertEqual(kept.data["category_set"], "be")
        self.assertEqual(kept_rows[age_eight.id]["weight_category"], "-22 kg")

        fresh = self.client.post(
            "/api/club-management/teams/",
            {"club": self.club.id, "name": "Other", "discipline": "kyorugi"},
            format="json",
        )
        empty = self.client.patch(
            f"/api/club-management/teams/{fresh.data['id']}/",
            {"category_set": "custom"},
            format="json",
        )
        self.assertEqual(empty.status_code, 400, empty.data)
        self.assertIn("custom_bands_required", str(empty.data))
        for body, code in (
            ({"category_set": "spain"}, "category_set_required"),
            ({"category_set": "custom", "custom_bands": []}, "custom_bands_required"),
            ({"category_set": "custom", "custom_bands": [{"age_min": 12, "age_max": 8, "sex": "X", "ceilings": "20"}]}, "age_required"),
            ({"category_set": "custom", "custom_bands": [{"age_min": 7, "age_max": 8, "sex": "Q", "ceilings": "20"}]}, "sex_required"),
            ({"category_set": "custom", "custom_bands": [{"age_min": 7, "age_max": 8, "sex": "X", "ceilings": "30,20"}]}, "limits_required"),
        ):
            refused = self.client.patch(f"/api/club-management/teams/{team_id}/", body, format="json")
            self.assertEqual(refused.status_code, 400, refused.data)
            self.assertIn(code, str(refused.data))

        weighed = self.client.post(
            f"/api/club-management/teams/{team_id}/weigh-in/",
            {"measured_on": "2026-09-02", "entries": [{"member": on_limit.id, "weight_kg": "32.5"}]},
            format="json",
        )
        self.assertEqual(weighed.status_code, 200, weighed.data)
        weighed_row = next(row for row in weighed.data["team"]["members"] if row["id"] == on_limit.id)
        self.assertEqual(weighed_row["weight_category"], "-33 kg")

class WeightClassRuleTests(SimpleTestCase):
    def test_margin_and_poomsae_divisions(self):
        self.assertEqual(kyorugi_margin(Decimal("54.0"), "senior", "M"), ("-54 kg", "0.0"))
        self.assertEqual(kyorugi_margin(Decimal("52.4"), "senior", "M"), ("-54 kg", "-1.6"))
        self.assertEqual(kyorugi_margin(Decimal("87.1"), "senior", "M"), ("+87 kg", "0.1"))
        self.assertEqual(kyorugi_margin(Decimal("40.2"), "cadet", "M"), ("-41 kg", "-0.8"))
        self.assertEqual(kyorugi_margin(Decimal("30.0"), "pupils", "M"), ("", None))
        year = 2026
        self.assertEqual(poomsae_division(date(2015, 6, 1), year), "")
        self.assertEqual(poomsae_division(date(2014, 12, 31), year), "cadet")
        self.assertEqual(poomsae_division(date(2012, 1, 1), year), "cadet")
        self.assertEqual(poomsae_division(date(2011, 1, 1), year), "junior")
        self.assertEqual(poomsae_division(date(2009, 1, 1), year), "junior")
        self.assertEqual(poomsae_division(date(2008, 1, 1), year), "under_30")
        self.assertEqual(poomsae_division(date(1996, 1, 1), year), "under_30")
        self.assertEqual(poomsae_division(date(1995, 1, 1), year), "under_40")
        self.assertEqual(poomsae_division(date(1986, 1, 1), year), "under_40")
        self.assertEqual(poomsae_division(date(1985, 1, 1), year), "under_50")
        self.assertEqual(poomsae_division(date(1976, 1, 1), year), "under_50")
        self.assertEqual(poomsae_division(date(1975, 1, 1), year), "under_60")
        self.assertEqual(poomsae_division(date(1966, 1, 1), year), "under_60")
        self.assertEqual(poomsae_division(date(1965, 1, 1), year), "under_65")
        self.assertEqual(poomsae_division(date(1961, 1, 1), year), "under_65")
        self.assertEqual(poomsae_division(date(1960, 1, 1), year), "over_65")
