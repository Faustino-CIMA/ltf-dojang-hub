"""The license-card photo colour is one federation setting, readable by any signed-in desk."""

from allauth.account.models import EmailAddress
from allauth.mfa.recovery_codes.internal.auth import RecoveryCodes
from allauth.mfa.totp.internal.auth import TOTP, format_hotp_value, hotp_value, yield_hotp_counters_from_time
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from accounts.models import User

from .models import LICENSE_PHOTO_BACKGROUND_DEFAULT, FederationProfile

_SECRET = "JBSWY3DPEHPK3PXP"


def _code(secret: str) -> str:
    counter = next(yield_hotp_counters_from_time())
    return format_hotp_value(hotp_value(secret, counter))


class LicensePhotoBackgroundApiTests(TestCase):
    def setUp(self):
        self.member = self._user("photo-member", User.Roles.MEMBER)
        self.club_admin = self._user("photo-club", User.Roles.CLUB_ADMIN)
        self.ltf_admin = self._user("photo-ltf", User.Roles.LTF_ADMIN)

    def _user(self, username: str, role: str) -> User:
        user = User.objects.create_user(
            username=username,
            email=f"{username}@example.com",
            password="pass12345",
            role=role,
        )
        EmailAddress.objects.create(user=user, email=user.email, verified=True, primary=True)
        return user

    def _signed_in(self, user: User, desk: str) -> APIClient:
        client = APIClient()
        started = client.post(
            "/api/auth/login/",
            {"username": user.username, "password": "pass12345"},
            format="json",
        )
        self.assertEqual(started.status_code, status.HTTP_200_OK, getattr(started, "data", started.content))
        token = started.data.get("token")
        self.assertTrue(token)
        if started.data.get("mfa_pending"):
            confirmed = client.post(
                "/api/auth/mfa/confirm/",
                {"token": token, "code": _code(_SECRET)},
                format="json",
            )
            self.assertEqual(confirmed.status_code, status.HTTP_200_OK, getattr(confirmed, "data", confirmed.content))
            token = confirmed.data["token"]
        client.cookies.clear()
        if desk:
            client.credentials(HTTP_AUTHORIZATION=f"Token {token}", HTTP_X_DESK=desk)
        else:
            client.credentials(HTTP_AUTHORIZATION=f"Token {token}")
        return client

    def test_anonymous_cannot_read_the_colour(self):
        response = APIClient().get("/api/federation-profile/license-photo-background/")
        self.assertIn(response.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))

    def test_member_and_club_admin_read_only_the_hex(self):
        TOTP.activate(self.club_admin, _SECRET)
        RecoveryCodes.activate(self.club_admin)
        cases = (
            (self.member, "member"),
            (self.club_admin, ""),
        )
        for user, desk in cases:
            client = self._signed_in(user, desk)
            response = client.get("/api/federation-profile/license-photo-background/")
            self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
            self.assertEqual(
                response.data,
                {"license_photo_background_color": LICENSE_PHOTO_BACKGROUND_DEFAULT},
            )
            refused = client.patch(
                "/api/federation-profile/",
                {"license_photo_background_color": "#112233"},
                format="json",
            )
            self.assertEqual(refused.status_code, status.HTTP_403_FORBIDDEN)

    def test_ltf_admin_sets_the_colour_and_the_read_endpoint_returns_it(self):
        TOTP.activate(self.ltf_admin, _SECRET)
        RecoveryCodes.activate(self.ltf_admin)
        client = self._signed_in(self.ltf_admin, "ltf_admin")
        saved = client.patch(
            "/api/federation-profile/",
            {"license_photo_background_color": " #112233 "},
            format="json",
        )
        self.assertEqual(saved.status_code, status.HTTP_200_OK, getattr(saved, "data", saved.content))
        self.assertEqual(saved.data["license_photo_background_color"], "#112233")
        self.assertEqual(
            FederationProfile.objects.get(pk=1).license_photo_background_color,
            "#112233",
        )
        read = client.get("/api/federation-profile/license-photo-background/")
        self.assertEqual(read.status_code, status.HTTP_200_OK)
        self.assertEqual(read.data, {"license_photo_background_color": "#112233"})

        invalid = client.patch(
            "/api/federation-profile/",
            {"license_photo_background_color": "grey"},
            format="json",
        )
        self.assertEqual(invalid.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            FederationProfile.objects.get(pk=1).license_photo_background_color,
            "#112233",
        )
