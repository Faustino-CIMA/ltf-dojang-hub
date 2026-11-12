"""The only module that calls the Stripe client.

Webhook signatures are checked by Stripe's own ``Webhook.construct_event``.
This module does not reimplement that check.
"""

from __future__ import annotations

import stripe
from django.conf import settings

StripeError = stripe.error.StripeError
SignatureVerificationError = stripe.error.SignatureVerificationError


def _configure() -> None:
    stripe.api_key = settings.STRIPE_SECRET_KEY
    stripe.api_version = settings.STRIPE_API_VERSION


def create_checkout_session(**kwargs):
    _configure()
    return stripe.checkout.Session.create(**kwargs)


def retrieve_checkout_session(session_id: str):
    _configure()
    return stripe.checkout.Session.retrieve(session_id)


def retrieve_payment_intent(payment_intent_id: str, **kwargs):
    _configure()
    return stripe.PaymentIntent.retrieve(payment_intent_id, **kwargs)


def construct_webhook_event(*, payload, sig_header: str, secret: str):
    """Return the event, or raise SignatureVerificationError when the signature is wrong."""
    _configure()
    return stripe.Webhook.construct_event(
        payload=payload,
        sig_header=sig_header,
        secret=secret,
    )
