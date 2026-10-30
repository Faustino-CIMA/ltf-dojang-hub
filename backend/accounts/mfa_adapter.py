import logging
from urllib.parse import urlparse

from allauth.mfa.adapter import DefaultMFAAdapter
from django.conf import settings

logger = logging.getLogger(__name__)


class LtfMFAAdapter(DefaultMFAAdapter):
    """Passkeys are bound to the app the person is looking at, not the API host."""

    def get_public_key_credential_rp_entity(self) -> dict[str, str]:
        configured = str(getattr(settings, "WEBAUTHN_RP_ID", "") or "").strip()
        if not configured:
            host = urlparse(getattr(settings, "FRONTEND_BASE_URL", "http://localhost:3000")).hostname
            configured = host or "localhost"
        return {"id": configured, "name": "LTF Dojang Hub"}

    def send_notification_mail(self, *args, **kwargs) -> None:
        # Enrolment mail is sent by our own screens. Avoid a second, untranslated letter.
        return None
