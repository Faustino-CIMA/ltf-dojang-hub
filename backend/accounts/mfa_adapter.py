import logging
from urllib.parse import quote, urlencode, urlparse

from allauth.mfa import app_settings as mfa_settings
from allauth.mfa.adapter import DefaultMFAAdapter
from django.conf import settings
from django.contrib.auth.base_user import AbstractBaseUser

logger = logging.getLogger(__name__)


class LtfMFAAdapter(DefaultMFAAdapter):
    """Passkeys are bound to the app the person is looking at, not the API host."""

    def build_totp_url(self, user: AbstractBaseUser, secret: str) -> str:
        # Spell out the defaults. Authenticator apps and our checker both use SHA1, 6 digits, 30s.
        label = self.get_totp_label(user)
        params = {
            "secret": secret,
            "issuer": self.get_totp_issuer(),
            "algorithm": "SHA1",
            "digits": mfa_settings.TOTP_DIGITS,
            "period": mfa_settings.TOTP_PERIOD,
        }
        return f"otpauth://totp/{quote(label)}?{urlencode(params, quote_via=quote)}"

    def get_public_key_credential_rp_entity(self) -> dict[str, str]:
        configured = str(getattr(settings, "WEBAUTHN_RP_ID", "") or "").strip()
        if not configured:
            host = urlparse(getattr(settings, "FRONTEND_BASE_URL", "http://localhost:3000")).hostname
            configured = host or "localhost"
        return {"id": configured, "name": "LTF Dojang Hub"}

    def send_notification_mail(self, *args, **kwargs) -> None:
        # Enrolment mail is sent by our own screens. Avoid a second, untranslated letter.
        return None
