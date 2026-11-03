from datetime import date

from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from accounts.models import User
from clubs.models import Club
from members.models import Member

from .models import AthleteStatus, CadreLevel, NationalTeamSettings, NationalTeamStaff, Season, Squad, SquadSelection


class NationalTeamApiTests(TestCase):
    def setUp(self):
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
        self.coach_user = User.objects.create_user(
            username="coach",
            password="pass12345",
            role=User.Roles.COACH,
        )
        self.other_admin = User.objects.create_user(
            username="otherclub",
            password="pass12345",
            role=User.Roles.CLUB_ADMIN,
        )
        self.club = Club.objects.create(name="Centre Luxembourg", created_by=self.admin)
        self.other = Club.objects.create(name="TKD Esch", created_by=self.admin)
        self.club.admins.add(self.coach_user)
        self.other.admins.add(self.other_admin)
        self.athlete = Member.objects.create(
            club=self.club,
            first_name="Lea",
            last_name="Weber",
            email="lea@club.lu",
        )
        self.other_athlete = Member.objects.create(
            club=self.other,
            first_name="Max",
            last_name="Hoffmann",
        )
        self.coach_member = Member.objects.create(
            club=None,
            first_name="Alex",
            last_name="Coach",
            email="alex.coach@ltf.lu",
        )
        self.season = Season.objects.get(year=timezone.localdate().year)
        self.national = Squad.objects.get(code="national_team")
        self.talents = Squad.objects.get(code="young_talents")
        self.level = CadreLevel.objects.get(code="A3")

    def _selection(self, **overrides):
        payload = {
            "member": self.athlete.id,
            "squad": self.national.id,
            "season": self.season.id,
            "age_class": "senior",
            "weight_category": "-67 kg",
            "is_captain": True,
            "started_on": self.season.starts_on.isoformat(),
            "ended_on": None,
        }
        payload.update(overrides)
        return payload

    def test_seed_has_calendar_season_squads_and_levels(self):
        self.assertEqual(self.season.starts_on, date(self.season.year, 1, 1))
        self.assertEqual(self.season.ends_on, date(self.season.year, 12, 31))
        self.assertEqual(self.national.discipline, Squad.Discipline.KYORUGI)
        self.assertEqual(self.talents.discipline, Squad.Discipline.KYORUGI)
        self.assertEqual(CadreLevel.objects.filter(code__startswith="A").count(), 9)
        self.assertTrue(CadreLevel.objects.filter(code="young_talent", name="Young talent").exists())
        self.assertFalse(NationalTeamSettings.load().forbid_overlapping_squads)

    def test_admin_selects_a_club_athlete_and_records_status(self):
        self.client.force_authenticate(user=self.admin)
        created = self.client.post("/api/national-team/selections/", self._selection(), format="json")
        self.assertEqual(created.status_code, status.HTTP_201_CREATED, created.data)
        self.assertTrue(created.data["is_captain"])
        self.assertIsNone(created.data["ended_on"])
        status_row = self.client.post(
            "/api/national-team/statuses/",
            {
                "member": self.athlete.id,
                "scheme": "cosl",
                "started_on": self.season.starts_on.isoformat(),
                "source_note": "COSL letter 12 March",
                "cosl_pathway": "elite",
                "cosl_rank": "P3",
                "cosl_project": "olympic",
            },
            format="json",
        )
        self.assertEqual(status_row.status_code, status.HTTP_201_CREATED, status_row.data)
        level = self.client.post(
            "/api/national-team/statuses/",
            {
                "member": self.athlete.id,
                "scheme": "ltf_level",
                "started_on": self.season.starts_on.isoformat(),
                "cadre_level_id": self.level.id,
                "source_note": "Cadre meeting",
            },
            format="json",
        )
        self.assertEqual(level.status_code, status.HTTP_201_CREATED, level.data)
        support = self.client.post(
            "/api/national-team/statuses/",
            {
                "member": self.athlete.id,
                "scheme": "support",
                "started_on": self.season.starts_on.isoformat(),
                "support_program": "sportlycee",
            },
            format="json",
        )
        self.assertEqual(support.status_code, status.HTTP_201_CREATED, support.data)
        listing = self.client.get(f"/api/national-team/selections/?season={self.season.id}")
        self.assertEqual(listing.status_code, status.HTTP_200_OK)
        row = listing.data[0]
        self.assertEqual(row["person"]["last_name"], "WEBER")
        self.assertEqual(row["club_name"], "Centre Luxembourg")
        self.assertEqual(row["ltf_level"]["code"], "A3")
        self.assertEqual(row["cosl"], {"pathway": "elite", "rank": "P3", "project": "olympic"})
        self.assertEqual(row["support"], "sportlycee")
        self.assertNotIn("email", row["person"])

    def test_past_end_is_exclusive_and_outside_season_is_refused(self):
        self.client.force_authenticate(user=self.admin)
        ended = self.client.post(
            "/api/national-team/selections/",
            self._selection(started_on="2020-01-01", ended_on="2020-06-01"),
            format="json",
        )
        self.assertEqual(ended.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("outside_season", str(ended.data))
        created = self.client.post("/api/national-team/selections/", self._selection(), format="json")
        selection_id = created.data["id"]
        closed = self.client.patch(
            f"/api/national-team/selections/{selection_id}/",
            {"ended_on": f"{self.season.year}-06-01"},
            format="json",
        )
        self.assertEqual(closed.status_code, status.HTTP_200_OK, closed.data)
        record = SquadSelection.objects.get(pk=selection_id)
        self.assertTrue(record.is_active_on(date(self.season.year, 5, 31)))
        self.assertFalse(record.is_active_on(date(self.season.year, 6, 1)))

    def test_same_athlete_can_be_on_two_squads_until_the_setting_forbids_it(self):
        self.client.force_authenticate(user=self.admin)
        first = self.client.post("/api/national-team/selections/", self._selection(), format="json")
        self.assertEqual(first.status_code, status.HTTP_201_CREATED, first.data)
        second = self.client.post(
            "/api/national-team/selections/",
            self._selection(squad=self.talents.id, age_class="junior", weight_category="-49 kg", is_captain=False),
            format="json",
        )
        self.assertEqual(second.status_code, status.HTTP_201_CREATED, second.data)
        blocked = self.client.patch(
            "/api/national-team/settings/",
            {"forbid_overlapping_squads": True},
            format="json",
        )
        self.assertEqual(blocked.status_code, status.HTTP_200_OK)
        third_club = Member.objects.create(club=self.club, first_name="Nora", last_name="Klein")
        refused = self.client.post(
            "/api/national-team/selections/",
            self._selection(member=third_club.id, squad=self.national.id),
            format="json",
        )
        self.assertEqual(refused.status_code, status.HTTP_201_CREATED, refused.data)
        overlap = self.client.post(
            "/api/national-team/selections/",
            self._selection(member=third_club.id, squad=self.talents.id, age_class="cadet"),
            format="json",
        )
        self.assertEqual(overlap.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("squad_overlap_forbidden", str(overlap.data))

    def test_staff_without_a_club_can_coach_and_clubs_only_see_the_name(self):
        self.client.force_authenticate(user=self.admin)
        self.client.post("/api/national-team/selections/", self._selection(), format="json")
        staff = self.client.post(
            "/api/national-team/staff/",
            {
                "member": self.coach_member.id,
                "function": "national_coach",
                "squad": self.national.id,
                "started_on": self.season.starts_on.isoformat(),
            },
            format="json",
        )
        self.assertEqual(staff.status_code, status.HTTP_201_CREATED, staff.data)
        self.assertIsNone(staff.data["person"]["club_id"])
        self.assertNotIn("email", staff.data["person"])
        listing = self.client.get(f"/api/national-team/selections/?season={self.season.id}")
        self.assertEqual(listing.status_code, status.HTTP_200_OK)
        self.assertEqual(listing.data[0]["coaches"][0]["last_name"], "COACH")
        self.assertNotIn("alex.coach@ltf.lu", str(listing.data))
        self.client.force_authenticate(user=self.coach_user)
        listing = self.client.get(f"/api/national-team/selections/?season={self.season.id}")
        listing = self.client.get(f"/api/national-team/selections/?season={self.season.id}")
        self.assertEqual(listing.status_code, status.HTTP_403_FORBIDDEN)
        hidden = self.client.get("/api/national-team/staff/")
        self.assertEqual(hidden.status_code, status.HTTP_403_FORBIDDEN)
        other = self.client.get(f"/api/national-team/athletes/{self.other_athlete.id}/")
        self.assertEqual(other.status_code, status.HTTP_403_FORBIDDEN)
        own = self.client.get(f"/api/national-team/athletes/{self.athlete.id}/")
        self.assertEqual(own.status_code, status.HTTP_403_FORBIDDEN)
        badge = self.client.get(f"/api/national-team/athletes/{self.athlete.id}/badge/")
        self.assertEqual(badge.status_code, status.HTTP_200_OK)
        self.assertTrue(badge.data["selected"])
        self.assertEqual(badge.data["labels"], [f"{self.national.name} · {self.season.year}"])

    def test_photographer_physiotherapist_and_other_can_be_saved_for_club_and_federation_people(self):
        self.client.force_authenticate(user=self.admin)
        started = self.season.starts_on.isoformat()
        cases = [
            (self.coach_member, "photographer", ""),
            (self.coach_member, "physiotherapist", ""),
            (self.coach_member, "other", "Team manager"),
            (self.athlete, "photographer", ""),
            (self.athlete, "physiotherapist", ""),
            (self.athlete, "other", "Club liaison"),
        ]
        saved_ids = []
        for member, function, title in cases:
            created = self.client.post(
                "/api/national-team/staff/",
                {
                    "member": member.id,
                    "function": function,
                    "title": title,
                    "started_on": started,
                },
                format="json",
            )
            self.assertEqual(created.status_code, status.HTTP_201_CREATED, created.data)
            self.assertEqual(created.data["function"], function)
            self.assertEqual(created.data["member"], member.id)
            self.assertEqual(created.data["title"], title)
            self.assertEqual(created.data["person"]["club_id"], member.club_id)
            saved_ids.append(created.data["id"])
        listing = self.client.get("/api/national-team/staff/")
        self.assertEqual(listing.status_code, status.HTTP_200_OK)
        stored = {
            (row["member"], row["function"], row["title"])
            for row in listing.data
            if row["id"] in saved_ids
        }
        self.assertEqual(stored, {(member.id, function, title) for member, function, title in cases})
        self.assertEqual(NationalTeamStaff.objects.filter(id__in=saved_ids).count(), len(cases))

    def test_weight_and_age_class_are_optional_but_athlete_squad_and_start_are_not(self):
        self.client.force_authenticate(user=self.admin)
        created = self.client.post(
            "/api/national-team/selections/",
            self._selection(weight_category="", age_class=""),
            format="json",
        )
        self.assertEqual(created.status_code, status.HTTP_201_CREATED, created.data)
        self.assertEqual(created.data["weight_category"], "")
        self.assertEqual(created.data["age_class"], "")
        omitted = self.client.post(
            "/api/national-team/selections/",
            {
                "member": self.other_athlete.id,
                "squad": self.talents.id,
                "season": self.season.id,
                "started_on": self.season.starts_on.isoformat(),
            },
            format="json",
        )
        self.assertEqual(omitted.status_code, status.HTTP_201_CREATED, omitted.data)
        missing_start = self.client.post(
            "/api/national-team/selections/",
            self._selection(started_on=None),
            format="json",
        )
        self.assertEqual(missing_start.status_code, status.HTTP_400_BAD_REQUEST)
        missing_squad = self.client.post(
            "/api/national-team/selections/",
            self._selection(squad=None),
            format="json",
        )
        self.assertEqual(missing_squad.status_code, status.HTTP_400_BAD_REQUEST)
        pupils = self.client.post(
            "/api/national-team/selections/",
            self._selection(member=self.other_athlete.id, squad=self.national.id, age_class="pupils"),
            format="json",
        )
        self.assertEqual(pupils.status_code, status.HTTP_201_CREATED, pupils.data)
        self.assertEqual(pupils.data["age_class"], "pupils")
        younger = Member.objects.create(club=self.club, first_name="Noa", last_name="Klein")
        minimes = self.client.post(
            "/api/national-team/selections/",
            self._selection(member=younger.id, age_class="minimes"),
            format="json",
        )
        self.assertEqual(minimes.status_code, status.HTTP_201_CREATED, minimes.data)
        self.assertEqual(minimes.data["age_class"], "minimes")

    def test_finance_is_read_only_and_a_person_without_a_club_cannot_be_selected(self):
        self.client.force_authenticate(user=self.finance)
        refused = self.client.post("/api/national-team/selections/", self._selection(), format="json")
        self.assertEqual(refused.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.client.get("/api/national-team/levels/").status_code, status.HTTP_200_OK)
        self.client.force_authenticate(user=self.admin)
        no_club = self.client.post(
            "/api/national-team/selections/",
            self._selection(member=self.coach_member.id),
            format="json",
        )
        self.assertEqual(no_club.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("club_member_required", str(no_club.data))

    def test_inactive_level_cannot_be_chosen_for_a_new_status(self):
        self.client.force_authenticate(user=self.admin)
        self.level.is_active = False
        self.level.save(update_fields=["is_active"])
        refused = self.client.post(
            "/api/national-team/statuses/",
            {
                "member": self.athlete.id,
                "scheme": "ltf_level",
                "started_on": self.season.starts_on.isoformat(),
                "cadre_level_id": self.level.id,
            },
            format="json",
        )
        self.assertEqual(refused.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("level_inactive", str(refused.data))
        added = self.client.post(
            "/api/national-team/levels/",
            {"code": "A1b", "name": "A1 reserve", "sort_order": 11, "is_active": True},
            format="json",
        )
        self.assertEqual(added.status_code, status.HTTP_201_CREATED, added.data)
        poomsae = self.client.post(
            "/api/national-team/squads/",
            {"name": "Poomsae team", "discipline": "poomsae"},
            format="json",
        )
        self.assertEqual(poomsae.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("poomsae", str(poomsae.data))

    def test_club_badge_hides_cosl_support_and_coaches(self):
        self.client.force_authenticate(user=self.admin)
        created = self.client.post("/api/national-team/selections/", self._selection(), format="json")
        self.assertEqual(created.status_code, status.HTTP_201_CREATED, created.data)
        cosl = self.client.post(
            "/api/national-team/statuses/",
            {
                "member": self.athlete.id,
                "scheme": "cosl",
                "started_on": self.season.starts_on.isoformat(),
                "cosl_pathway": "elite",
                "cosl_rank": "P3",
                "cosl_project": "olympic",
            },
            format="json",
        )
        self.assertEqual(cosl.status_code, status.HTTP_201_CREATED, cosl.data)
        support = self.client.post(
            "/api/national-team/statuses/",
            {
                "member": self.athlete.id,
                "scheme": "support",
                "started_on": self.season.starts_on.isoformat(),
                "support_program": "sportlycee",
            },
            format="json",
        )
        self.assertEqual(support.status_code, status.HTTP_201_CREATED, support.data)
        staff = self.client.post(
            "/api/national-team/staff/",
            {
                "member": self.coach_member.id,
                "function": "national_coach",
                "squad": self.national.id,
                "started_on": self.season.starts_on.isoformat(),
            },
            format="json",
        )
        self.assertEqual(staff.status_code, status.HTTP_201_CREATED, staff.data)
        dossier = self.client.get(f"/api/national-team/athletes/{self.athlete.id}/")
        self.assertEqual(dossier.status_code, status.HTTP_200_OK)
        self.assertEqual(dossier.data["current"]["cosl"]["rank"], "P3")
        self.assertEqual(dossier.data["current"]["support"], "sportlycee")
        self.assertEqual(dossier.data["selections"][0]["coaches"][0]["function"], "national_coach")

        self.client.force_authenticate(user=self.coach_user)
        hidden = self.client.get(f"/api/national-team/athletes/{self.athlete.id}/")
        self.assertEqual(hidden.status_code, status.HTTP_403_FORBIDDEN)
        badge = self.client.get(f"/api/national-team/athletes/{self.athlete.id}/badge/")
        self.assertEqual(badge.status_code, status.HTTP_200_OK, badge.data)
        self.assertEqual(badge.data, {"selected": True, "labels": [f"{self.national.name} · {self.season.year}"]})
        self.assertNotIn("cosl", badge.data)
        self.assertNotIn("support", badge.data)
        self.assertNotIn("coaches", str(badge.data).lower())
        self.assertNotIn("sportlycee", str(badge.data))
        self.assertEqual(
            self.client.get(f"/api/national-team/athletes/{self.other_athlete.id}/badge/").status_code,
            status.HTTP_404_NOT_FOUND,
        )
        quiet = Member.objects.create(club=self.club, first_name="Ines", last_name="Simon")
        empty = self.client.get(f"/api/national-team/athletes/{quiet.id}/badge/")
        self.assertEqual(empty.status_code, status.HTTP_200_OK)
        self.assertEqual(empty.data, {"selected": False, "labels": []})

        self.client.force_authenticate(user=self.admin)
        closed = self.client.patch(
            f"/api/national-team/selections/{created.data['id']}/",
            {"ended_on": timezone.localdate().isoformat()},
            format="json",
        )
        self.assertEqual(closed.status_code, status.HTTP_200_OK, closed.data)
        self.client.force_authenticate(user=self.coach_user)
        after = self.client.get(f"/api/national-team/athletes/{self.athlete.id}/badge/")
        self.assertEqual(after.status_code, status.HTTP_200_OK)
        self.assertEqual(after.data, {"selected": False, "labels": []})

    def test_admin_can_add_a_squad_and_change_season_dates(self):
        self.client.force_authenticate(user=self.admin)
        squad = self.client.post(
            "/api/national-team/squads/",
            {"name": "Development", "discipline": "kyorugi"},
            format="json",
        )
        self.assertEqual(squad.status_code, status.HTTP_201_CREATED, squad.data)
        self.assertEqual(squad.data["code"], "development")
        updated = self.client.patch(
            f"/api/national-team/seasons/{self.season.id}/",
            {"starts_on": f"{self.season.year}-01-15", "ends_on": f"{self.season.year}-12-15"},
            format="json",
        )
        self.assertEqual(updated.status_code, status.HTTP_200_OK, updated.data)
        self.season.refresh_from_db()
        self.assertEqual(self.season.starts_on, date(self.season.year, 1, 15))
