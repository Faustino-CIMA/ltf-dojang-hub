import hashlib

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from accounts.models import User
from clubs.models import Club
from modules.codes import build_payload, sign_payload
from modules.entitlements import install_id_str, redeem_product_code, set_club_assignment
from modules.registry import CLUB_MANAGEMENT_MODULE_ID

from .onboarding_models import ClubRulesVersion


@override_settings(DEBUG=True, MODULE_CODE_PUBLIC_KEY="", MODULE_CODE_PRIVATE_KEY="")
class OnboardingSettingsTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.ltf_admin = User.objects.create_user(
            username="ltf-onboard", password="pass12345", role=User.Roles.LTF_ADMIN
        )
        self.club_admin = User.objects.create_user(
            username="club-onboard", password="pass12345", role=User.Roles.CLUB_ADMIN
        )
        self.coach = User.objects.create_user(
            username="coach-onboard", password="pass12345", role=User.Roles.COACH
        )
        self.other_admin = User.objects.create_user(
            username="other-onboard", password="pass12345", role=User.Roles.CLUB_ADMIN
        )
        self.club = Club.objects.create(name="Example Dojang", created_by=self.ltf_admin)
        self.other = Club.objects.create(name="Other Dojang", created_by=self.ltf_admin)
        self.club.admins.add(self.club_admin)
        self.other.admins.add(self.other_admin)
        self.club.trainers.add(self.coach)

    def _auth(self, user):
        self.client.force_authenticate(user=user)

    def _unlock(self, club=None):
        token = sign_payload(
            build_payload(module_ids=[CLUB_MANAGEMENT_MODULE_ID], install_id=install_id_str())
        )
        redeem_product_code(token)
        set_club_assignment(
            club=club or self.club,
            module_id=CLUB_MANAGEMENT_MODULE_ID,
            enabled=True,
            user=self.ltf_admin,
        )

    def test_defaults_and_a_saved_note(self):
        self._unlock()
        self._auth(self.club_admin)
        opened = self.client.get(f"/api/club-management/onboarding/?club={self.club.id}")
        self.assertEqual(opened.status_code, 200, opened.data)
        self.assertFalse(opened.data["public_link_enabled"])
        self.assertFalse(opened.data["invites_enabled"])
        self.assertEqual(opened.data["photo_requirement"], "optional")
        self.assertEqual(opened.data["medico_requirement"], "optional")
        self.assertEqual(opened.data["rules"], [])

        saved = self.client.patch(
            f"/api/club-management/onboarding/?club={self.club.id}",
            {
                "public_link_enabled": True,
                "invites_enabled": True,
                "equipment_note": "Bring a white dobok.",
                "photo_requirement": "required",
                "medico_requirement": "hidden",
            },
            format="json",
        )
        self.assertEqual(saved.status_code, 200, saved.data)
        self.assertTrue(saved.data["public_link_enabled"])
        self.assertTrue(saved.data["invites_enabled"])
        self.assertEqual(saved.data["equipment_note"], "Bring a white dobok.")
        self.assertEqual(saved.data["photo_requirement"], "required")
        self.assertEqual(saved.data["medico_requirement"], "hidden")

    def test_coach_and_another_club_cannot_change_settings(self):
        self._unlock()
        self._unlock(self.other)
        self._auth(self.coach)
        refused = self.client.get(f"/api/club-management/onboarding/?club={self.club.id}")
        self.assertEqual(refused.status_code, 403)
        self._auth(self.other_admin)
        other = self.client.patch(
            f"/api/club-management/onboarding/?club={self.club.id}",
            {"public_link_enabled": True},
            format="json",
        )
        self.assertEqual(other.status_code, 403)

    def test_rules_version_keeps_the_hash_and_the_older_copy(self):
        self._unlock()
        self._auth(self.club_admin)
        body = b"%PDF-1.4 Example Dojang rules"
        created = self.client.post(
            f"/api/club-management/onboarding/rules/?club={self.club.id}",
            {
                "effective_on": "2026-11-27",
                "file": SimpleUploadedFile("rules.pdf", body, content_type="application/pdf"),
            },
            format="multipart",
        )
        self.assertEqual(created.status_code, 201, created.data)
        self.assertEqual(created.data["version"], 1)
        self.assertTrue(created.data["is_current"])
        self.assertEqual(created.data["sha256"], hashlib.sha256(body).hexdigest())
        self.assertEqual(created.data["kind"], "file")

        link = "https://example.test/example-dojang-rules"
        second = self.client.post(
            f"/api/club-management/onboarding/rules/?club={self.club.id}",
            {"effective_on": "2026-12-01", "url": link},
            format="multipart",
        )
        self.assertEqual(second.status_code, 201, second.data)
        self.assertEqual(second.data["version"], 2)
        self.assertEqual(second.data["sha256"], hashlib.sha256(link.encode("utf-8")).hexdigest())
        self.assertTrue(second.data["is_current"])
        first = ClubRulesVersion.objects.get(club=self.club, version=1)
        self.assertFalse(first.is_current)
        listed = self.client.get(f"/api/club-management/onboarding/?club={self.club.id}")
        self.assertEqual([row["version"] for row in listed.data["rules"]], [2, 1])

        downloaded = self.client.get(
            f"/api/club-management/onboarding/rules/{first.id}/file/?club={self.club.id}"
        )
        self.assertEqual(downloaded.status_code, 200)
        self.assertEqual(b"".join(downloaded.streaming_content), body)

    def test_rules_need_one_source_and_a_real_date(self):
        self._unlock()
        self._auth(self.club_admin)
        empty = self.client.post(
            f"/api/club-management/onboarding/rules/?club={self.club.id}",
            {"effective_on": "2026-11-27"},
            format="multipart",
        )
        self.assertEqual(empty.status_code, 400)
        both = self.client.post(
            f"/api/club-management/onboarding/rules/?club={self.club.id}",
            {
                "effective_on": "2026-11-27",
                "url": "https://example.test/rules",
                "file": SimpleUploadedFile("rules.txt", b"Example rules", content_type="text/plain"),
            },
            format="multipart",
        )
        self.assertEqual(both.status_code, 400)
        bad_date = self.client.post(
            f"/api/club-management/onboarding/rules/?club={self.club.id}",
            {"effective_on": "27.11.2026", "url": "https://example.test/rules"},
            format="multipart",
        )
        self.assertEqual(bad_date.status_code, 400)
        self.assertFalse(ClubRulesVersion.objects.filter(club=self.club).exists())
