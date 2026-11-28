from datetime import date, time

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import User
from clubs.models import Club
from members.models import Member

from .models import Committee, CommitteeMandate, MembershipFee
from .onboarding_models import ClubOnboardingSettings, ClubRulesVersion
from .training_models import TrainingSeries


class OnboardingOverviewTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.owner = User.objects.create_user(username="overview-owner", password="pass12345", role=User.Roles.LTF_ADMIN)
        self.club = Club.objects.create(
            name="Example Dojang",
            city="Exampleville",
            email="club@example.test",
            website="https://example.test",
            iban="LU00EXAMPLE",
            created_by=self.owner,
        )
        self.settings = ClubOnboardingSettings.objects.create(
            club=self.club,
            public_link_enabled=True,
            equipment_note="Bring a white dobok.",
        )
        MembershipFee.objects.create(club=self.club, name="Adult", amount="180.00", is_active=True)
        MembershipFee.objects.create(club=self.club, name="Retired", amount="10.00", is_active=False)
        coach = User.objects.create_user(
            username="overview-coach",
            password="pass12345",
            role=User.Roles.COACH,
            first_name="Noa",
            last_name="Silva",
        )
        self.club.trainers.add(coach)
        hidden = Member.objects.create(
            club=self.club,
            first_name="Ada",
            last_name="HIDDENPERSON",
            email="hidden@example.test",
            date_of_birth=date(2014, 6, 4),
        )
        holder = Member.objects.create(
            club=self.club,
            first_name="Lea",
            last_name="Keller",
            date_of_birth=date(1990, 3, 12),
        )
        committee = Committee.objects.create(scope=Committee.Scope.CLUB, club=self.club, name="Board")
        CommitteeMandate.objects.create(
            committee=committee,
            role=CommitteeMandate.Role.PRESIDENT,
            member=holder,
            started_on=date(2020, 1, 1),
        )
        series = TrainingSeries.objects.create(
            club=self.club,
            name="Kids class",
            audience=TrainingSeries.Audience.KIDS,
            weekday=0,
            start_time=time(18, 0),
            end_time=time(19, 0),
            valid_from=date(2026, 1, 1),
            valid_until=date(2026, 12, 31),
            place="Example Hall",
        )
        series.regulars.add(hidden)
        ClubRulesVersion.objects.create(
            club=self.club,
            version=1,
            effective_on=date(2026, 1, 1),
            file=SimpleUploadedFile("old-rules.txt", b"old rules"),
            sha256="a" * 64,
            is_current=False,
        )
        ClubRulesVersion.objects.create(
            club=self.club,
            version=2,
            effective_on=date(2026, 12, 1),
            url="https://example.test/rules",
            sha256="b" * 64,
            is_current=True,
        )

    def test_overview_lists_public_facts_only(self):
        response = self.client.get(f"/api/club-management/onboarding/public/{self.club.id}/")
        self.assertEqual(response.status_code, 200, response.data)
        body = response.json()
        self.assertEqual(body["name"], "Example Dojang")
        self.assertEqual(body["city"], "Exampleville")
        self.assertEqual(body["email"], "club@example.test")
        self.assertEqual(body["iban"], "LU00EXAMPLE")
        self.assertEqual(body["equipment_note"], "Bring a white dobok.")
        self.assertEqual(body["fees"], [{"name": "Adult", "amount": "180.00"}])
        self.assertIsNone(body["license_fee"])
        self.assertEqual(body["timetable"][0]["name"], "Kids class")
        self.assertEqual(body["timetable"][0]["weekday"], 0)
        self.assertEqual(body["timetable"][0]["place"], "Example Hall")
        self.assertNotIn("coach_ids", body["timetable"][0])
        self.assertEqual(body["committee"], [{"role": "president", "title": "", "name": "KELLER Lea"}])
        self.assertEqual(body["coaches"], ["Silva Noa"])
        self.assertEqual(body["rules"]["kind"], "url")
        self.assertEqual(body["rules"]["url"], "https://example.test/rules")
        self.assertEqual(body["rules"]["version"], 2)
        text = response.content.decode()
        self.assertNotIn("HIDDENPERSON", text)
        self.assertNotIn("hidden@example.test", text)

    def test_closed_link_hides_the_club(self):
        self.settings.public_link_enabled = False
        self.settings.save(update_fields=["public_link_enabled"])
        response = self.client.get(f"/api/club-management/onboarding/public/{self.club.id}/")
        self.assertEqual(response.status_code, 404)
        self.assertNotIn(b"Example Dojang", response.content)

    def test_current_rules_file_is_public_and_the_old_file_is_not(self):
        current = ClubRulesVersion.objects.get(club=self.club, version=2)
        current.url = ""
        current.file = SimpleUploadedFile("current-rules.txt", b"current rules")
        current.save()
        opened = self.client.get(f"/api/club-management/onboarding/public/{self.club.id}/rules/")
        self.assertEqual(opened.status_code, 200)
        self.assertEqual(b"".join(opened.streaming_content), b"current rules")
        old = ClubRulesVersion.objects.get(club=self.club, version=1)
        missing = self.client.get(f"/api/club-management/onboarding/rules/{old.id}/file/")
        self.assertIn(missing.status_code, (401, 403))
