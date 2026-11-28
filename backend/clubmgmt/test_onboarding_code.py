from unittest.mock import patch

from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from accounts.models import User
from clubs.models import Club

from .onboarding_models import ClubOnboardingSettings, JoinEmailCode, JoinEmailProof


@override_settings(FRONTEND_BASE_URL="https://hub.example.test")
class JoinLinkCodeTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        owner = User.objects.create_user(username="code-owner", password="pass12345", role=User.Roles.LTF_ADMIN)
        self.admin = User.objects.create_user(username="code-admin", password="pass12345", role=User.Roles.CLUB_ADMIN)
        self.club = Club.objects.create(name="Example Dojang", created_by=owner)
        self.club.admins.add(self.admin)
        self.settings = ClubOnboardingSettings.objects.create(club=self.club, public_link_enabled=True)
        self.token = self.settings.link_token

    def _unlock(self):
        from modules.codes import build_payload, sign_payload
        from modules.entitlements import install_id_str, redeem_product_code, set_club_assignment
        from modules.registry import CLUB_MANAGEMENT_MODULE_ID

        token = sign_payload(build_payload(module_ids=[CLUB_MANAGEMENT_MODULE_ID], install_id=install_id_str()))
        redeem_product_code(token)
        set_club_assignment(club=self.club, module_id=CLUB_MANAGEMENT_MODULE_ID, enabled=True, user=self.admin)

    @patch("clubmgmt.onboarding_code.send_resend_email", return_value=(True, ""))
    def test_code_confirms_once_and_hides_whether_the_address_is_new(self, _mail):
        asked = self.client.post(
            f"/api/club-management/onboarding/public/{self.token}/code/",
            {"email": "lea.keller@example.test", "locale": "en"},
            format="json",
        )
        self.assertEqual(asked.status_code, 200, asked.data)
        self.assertEqual(asked.data["detail"], "code_sent")
        sent = _mail.call_args.args[3]
        code = sent.split("is ")[1].split(".")[0]
        self.assertEqual(len(code), 6)
        self.assertFalse(JoinEmailCode.objects.filter(code_hash=code).exists())

        bad = self.client.post(
            f"/api/club-management/onboarding/public/{self.token}/code/check/",
            {"email": "nobody@example.test", "code": "000000"},
            format="json",
        )
        wrong = self.client.post(
            f"/api/club-management/onboarding/public/{self.token}/code/check/",
            {"email": "lea.keller@example.test", "code": "000000"},
            format="json",
        )
        self.assertEqual(bad.data["detail"], "code_invalid")
        self.assertEqual(wrong.data["detail"], "code_invalid")

        ok = self.client.post(
            f"/api/club-management/onboarding/public/{self.token}/code/check/",
            {"email": "lea.keller@example.test", "code": code},
            format="json",
        )
        self.assertEqual(ok.status_code, 200, ok.data)
        self.assertTrue(ok.data["proof"])
        self.assertEqual(JoinEmailProof.objects.filter(club=self.club).count(), 1)
        again = self.client.post(
            f"/api/club-management/onboarding/public/{self.token}/code/check/",
            {"email": "lea.keller@example.test", "code": code},
            format="json",
        )
        self.assertEqual(again.data["detail"], "code_invalid")

    @patch("clubmgmt.onboarding_code.send_resend_email", return_value=(True, ""))
    def test_too_many_codes_for_one_address_has_its_own_message(self, _mail):
        for _ in range(5):
            self.client.post(
                f"/api/club-management/onboarding/public/{self.token}/code/",
                {"email": "lea.keller@example.test"},
                format="json",
            )
        blocked = self.client.post(
            f"/api/club-management/onboarding/public/{self.token}/code/",
            {"email": "lea.keller@example.test"},
            format="json",
        )
        self.assertEqual(blocked.status_code, 429)
        self.assertEqual(blocked.data["detail"], "rate_email")

    def test_rotate_replaces_the_link_and_the_qr_uses_it(self):
        self._unlock()
        self.client.force_authenticate(self.admin)
        first = self.client.get(f"/api/club-management/onboarding/?club={self.club.id}&locale=en")
        self.assertIn(f"/en/join/{self.token}", first.data["join_url"])
        rotated = self.client.post(f"/api/club-management/onboarding/link/?club={self.club.id}&locale=fr")
        self.assertEqual(rotated.status_code, 200, rotated.data)
        self.assertNotIn(self.token, rotated.data["join_url"])
        self.assertIn("/fr/join/", rotated.data["join_url"])
        old = self.client.get(f"/api/club-management/onboarding/public/{self.token}/")
        self.assertEqual(old.status_code, 404)
        qr = self.client.get(f"/api/club-management/onboarding/qr/?club={self.club.id}&locale=en")
        self.assertEqual(qr.status_code, 200)
        self.assertTrue(qr.data["png"].startswith("data:image/png;base64,"))
