"""Search keys for Stripe ids that are stored encrypted.

Fernet ciphertext changes every time the same value is saved, so a database
filter on the encrypted column never matches. The lookup column stores only
an HMAC of the checkout session id.
"""

from __future__ import annotations

import hashlib
import hmac

from django.conf import settings


def stripe_session_lookup(session_id: str | None) -> str:
    value = (session_id or "").strip()
    if not value:
        return ""
    key = str(settings.SECRET_KEY).encode("utf-8")
    message = b"stripe-checkout-session:" + value.encode("utf-8")
    return hmac.new(key, message, hashlib.sha256).hexdigest()
