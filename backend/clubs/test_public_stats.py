from datetime import date

from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from accounts.models import User
from licenses.models import License, LicenseType
from members.models import Member

from .models import Club
from .public_stats import PUBLIC_STATS_CACHE_KEY


@override_settings(
    CACHES={
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "public-stats-tests",
        }
    }
)
class PublicStatsTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.admin = User.objects.create_user(username="stats-admin", password="pass12345", role=User.Roles.LTF_ADMIN)
        self.club = Club.objects.create(name="Shown Club", created_by=self.admin, is_active=True)
        Club.objects.create(name="Hidden Club", created_by=self.admin, is_active=False)
        Member.objects.create(club=self.club, first_name="Lea", last_name="Weber", is_active=True)
        Member.objects.create(club=self.club, first_name="Old", last_name="Member", is_active=False)
        Member.objects.create(club=None, first_name="Staff", last_name="Only", is_active=True)
        license_type = LicenseType.objects.create(name="Season", code="season-stats")
        active = Member.objects.get(first_name="Lea")
        License.objects.create(
            member=active,
            club=self.club,
            license_type=license_type,
            year=2026,
            start_date=date(2026, 1, 1),
            end_date=date(2026, 12, 31),
            status=License.Status.ACTIVE,
        )
        pending_member = Member.objects.create(club=self.club, first_name="Noa", last_name="Petit", is_active=True)
        License.objects.create(
            member=pending_member,
            club=self.club,
            license_type=license_type,
            year=2026,
            start_date=date(2026, 1, 1),
            end_date=date(2026, 12, 31),
            status=License.Status.PENDING,
        )

    def test_anonymous_response_is_only_three_counts(self):
        response = self.client.get("/api/public/stats/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(set(response.data.keys()), {"clubs", "members", "licences"})
        self.assertEqual(response.data["clubs"], 1)
        self.assertEqual(response.data["members"], 2)
        self.assertEqual(response.data["licences"], 1)
        for value in response.data.values():
            self.assertIsInstance(value, int)
        body = response.content.decode()
        self.assertNotIn("Weber", body)
        self.assertNotIn("email", body)

    def test_counts_stay_cached_until_the_key_expires(self):
        first = self.client.get("/api/public/stats/")
        self.assertEqual(first.data["clubs"], 1)
        Club.objects.create(name="Later Club", created_by=self.admin, is_active=True)
        second = self.client.get("/api/public/stats/")
        self.assertEqual(second.data["clubs"], 1)
        cache.delete(PUBLIC_STATS_CACHE_KEY)
        third = self.client.get("/api/public/stats/")
        self.assertEqual(third.data["clubs"], 2)
