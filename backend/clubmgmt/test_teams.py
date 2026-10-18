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
        self.assertEqual(mira["weight_category"], "")
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
