"""Stripe calls go through one adapter, and the webhook signature check stays Stripe's."""

import hashlib
import hmac
import json
import time
from unittest.mock import patch

from django.test import SimpleTestCase, override_settings

from licenses.stripe_adapter import (
    SignatureVerificationError,
    construct_webhook_event,
    create_checkout_session,
)


def _sign(payload: str, secret: str) -> str:
    timestamp = int(time.time())
    signed = f"{timestamp}.{payload}"
    digest = hmac.new(secret.encode("utf-8"), signed.encode("utf-8"), hashlib.sha256).hexdigest()
    return f"t={timestamp},v1={digest}"


class StripeAdapterTests(SimpleTestCase):
    @override_settings(STRIPE_SECRET_KEY="sk_test_adapter", STRIPE_API_VERSION="2024-06-20")
    def test_checkout_session_uses_the_configured_client(self):
        with patch("licenses.stripe_adapter.stripe.checkout.Session.create", return_value="session") as create:
            result = create_checkout_session(mode="payment")
        self.assertEqual(result, "session")
        create.assert_called_once_with(mode="payment")
        from licenses import stripe_adapter

        self.assertEqual(stripe_adapter.stripe.api_key, "sk_test_adapter")
        self.assertEqual(stripe_adapter.stripe.api_version, "2024-06-20")

    @override_settings(STRIPE_SECRET_KEY="sk_test_adapter", STRIPE_API_VERSION="2024-06-20")
    def test_a_bad_webhook_signature_is_rejected_by_stripe(self):
        payload = json.dumps({"id": "evt_test", "type": "payment_intent.succeeded"})
        with self.assertRaises(SignatureVerificationError):
            construct_webhook_event(payload=payload, sig_header="t=1,v1=invalid", secret="whsec_test")

    @override_settings(STRIPE_SECRET_KEY="sk_test_adapter", STRIPE_API_VERSION="2024-06-20")
    def test_a_valid_webhook_signature_returns_the_event(self):
        payload = json.dumps({"id": "evt_test", "object": "event", "type": "payment_intent.succeeded"})
        event = construct_webhook_event(
            payload=payload,
            sig_header=_sign(payload, "whsec_test"),
            secret="whsec_test",
        )
        if not isinstance(event, dict) and hasattr(event, "to_dict"):
            event = event.to_dict()
        self.assertEqual(event["type"], "payment_intent.succeeded")
        self.assertEqual(event["id"], "evt_test")
