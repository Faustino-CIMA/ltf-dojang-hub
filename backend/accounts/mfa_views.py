"""Screens talk to these views. allauth still performs the authenticator and passkey steps."""

from __future__ import annotations

import json

from allauth.account.internal.flows.login import record_authentication
from allauth.core.context import request_context
from allauth.core.exceptions import ReauthenticationRequired
from allauth.mfa.adapter import get_adapter
from allauth.mfa.models import Authenticator
from allauth.mfa.totp.forms import ActivateTOTPForm
from allauth.mfa.totp.internal import auth as totp_auth
from allauth.mfa.totp.internal import flows as totp_flows
from allauth.mfa.webauthn.internal import flows as webauthn_flows
from django.core.serializers.json import DjangoJSONEncoder
from django.http import HttpRequest
from rest_framework import permissions, response, status, views
from rest_framework.exceptions import ValidationError

from .mfa import (
    auth_payload,
    confirm_code,
    disable_email_mfa,
    enable_email_mfa,
    form_failure_detail,
    is_staff_account,
    load_session,
    log_totp_refusal,
    public_mfa_status,
    recently_authenticated,
    send_email_code,
)


def _django(request) -> HttpRequest:
    return request._request


def _json_safe(value):
    return json.loads(json.dumps(value, cls=DjangoJSONEncoder))


def _digits(raw) -> str:
    """Keep the code a string. A number field would drop a leading zero, and spaces must not matter."""
    return "".join(ch for ch in str(raw or "") if ch.isdigit())


def _wants_fresh_secret(request) -> bool:
    flag = str(request.query_params.get("fresh") or "").strip().lower()
    return flag in {"1", "true", "yes"}


def _form_error(form):
    detail = form_failure_detail(form)
    http_status = status.HTTP_429_TOO_MANY_REQUESTS if detail == "rate_limited" else status.HTTP_400_BAD_REQUEST
    return response.Response({"detail": detail}, status=http_status)


class MfaStatusView(views.APIView):
    def get(self, request):
        return response.Response(public_mfa_status(request.user))


class MfaConfirmView(views.APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        token = str(request.data.get("token") or request.headers.get("X-Session-Token") or "")
        code = str(request.data.get("code") or "")
        try:
            payload = confirm_code(_django(request), token, code)
        except ValidationError as exc:
            return response.Response({"detail": exc.detail}, status=status.HTTP_400_BAD_REQUEST)
        return response.Response(payload)


class TotpEnrolView(views.APIView):
    def get(self, request):
        if not recently_authenticated(request):
            return response.Response({"detail": "mfa_sign_in_again"}, status=status.HTTP_409_CONFLICT)
        django_request = _django(request)
        with request_context(django_request):
            # The pending secret lives in this session. A second fetch must show the same key
            # until the person confirms it or explicitly asks for a new one.
            secret = totp_auth.get_totp_secret(regenerate=_wants_fresh_secret(request))
            url = get_adapter().build_totp_url(request.user, secret)
            svg = get_adapter().build_totp_svg(url)
        django_request.session.save()
        return response.Response({"secret": secret, "otpauth_url": url, "qr_svg": svg})

    def post(self, request):
        if not recently_authenticated(request):
            return response.Response({"detail": "mfa_sign_in_again"}, status=status.HTTP_409_CONFLICT)
        django_request = _django(request)
        code = _digits(request.data.get("code"))
        with request_context(django_request):
            form = ActivateTOTPForm(data={"code": code}, user=request.user)
            if not form.is_valid():
                if form_failure_detail(form) == "incorrect_code":
                    log_totp_refusal(
                        secret=totp_auth.get_totp_secret(regenerate=False),
                        code=code,
                        user_id=request.user.id,
                    )
                return _form_error(form)
            if not recently_authenticated(request):
                return response.Response({"detail": "mfa_sign_in_again"}, status=status.HTTP_409_CONFLICT)
            # Login stores a password timestamp without allauth's reauthenticated flag.
            # activate_totp then raises, and the account middleware turns that into an HTML
            # redirect the screen reports as a rejected code. Inside the timeout, the sign-in is enough.
            record_authentication(django_request, request.user, method="password", reauthenticated=True)
            try:
                _totp, recovery = totp_flows.activate_totp(django_request, form)
            except ReauthenticationRequired:
                return response.Response({"detail": "mfa_sign_in_again"}, status=status.HTTP_409_CONFLICT)
            # The code just proved the new authenticator. This visit can open the desk without signing in again.
            record_authentication(django_request, request.user, method="mfa", type="totp")
            codes = []
            if recovery is not None:
                codes = recovery.wrap().get_unused_codes()
        django_request.session.save()
        return response.Response({"recovery_codes": codes, "mfa": public_mfa_status(request.user, request)})


class WebAuthnRegisterView(views.APIView):
    def get(self, request):
        if not recently_authenticated(request):
            return response.Response({"detail": "mfa_sign_in_again"}, status=status.HTTP_409_CONFLICT)
        django_request = _django(request)
        with request_context(django_request):
            options = webauthn_flows.begin_registration(django_request, request.user, passwordless=True)
        django_request.session.save()
        return response.Response(_json_safe(options))

    def post(self, request):
        if not recently_authenticated(request):
            return response.Response({"detail": "mfa_sign_in_again"}, status=status.HTTP_409_CONFLICT)
        django_request = _django(request)
        credential = request.data.get("credential") or request.data
        name = str(request.data.get("name") or "Passkey")
        with request_context(django_request):
            try:
                _auth, recovery = webauthn_flows.add_authenticator(django_request, name=name, credential=credential)
            except Exception:
                return response.Response({"detail": "incorrect_code"}, status=status.HTTP_400_BAD_REQUEST)
            codes = recovery.wrap().get_unused_codes() if recovery is not None else []
            record_authentication(django_request, request.user, method="mfa", type="webauthn")
        django_request.session.save()
        return response.Response({"recovery_codes": codes, "mfa": public_mfa_status(request.user, request)})

    def delete(self, request):
        if not recently_authenticated(request):
            return response.Response({"detail": "mfa_sign_in_again"}, status=status.HTTP_409_CONFLICT)
        raw_ids = request.data.get("ids") or []
        authenticators = list(
            Authenticator.objects.filter(
                user_id=request.user.id,
                type=Authenticator.Type.WEBAUTHN,
                pk__in=raw_ids,
            )
        )
        django_request = _django(request)
        with request_context(django_request):
            webauthn_flows.remove_authenticators(django_request, authenticators)
        return response.Response(public_mfa_status(request.user))


class WebAuthnLoginView(views.APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        django_request = _django(request)
        from allauth.headless.constants import Client
        from allauth.headless.internal.authkit import authentication_context
        from allauth.headless.internal.decorators import mark_request_as_headless
        from allauth.mfa.webauthn.internal import auth as webauthn_auth

        mark_request_as_headless(django_request, Client.APP)
        with authentication_context(django_request):
            with request_context(django_request):
                options = webauthn_auth.begin_authentication(None)
                django_request.session.save()
                token = django_request.session.session_key
        return response.Response({"token": token, "options": _json_safe(options)})

    def post(self, request):
        token = str(request.data.get("token") or "")
        session = load_session(token)
        if session is None:
            return response.Response({"detail": "mfa_not_pending"}, status=status.HTTP_400_BAD_REQUEST)
        django_request = _django(request)
        django_request.session = session
        credential = request.data.get("credential") or {}
        from allauth.account import app_settings as account_settings
        from allauth.account.models import Login
        from allauth.mfa.webauthn.forms import LoginWebAuthnForm
        from allauth.mfa.webauthn.internal.flows import perform_passwordless_login

        with request_context(django_request):
            form = LoginWebAuthnForm(data={"credential": credential})
            if not form.is_valid():
                return response.Response({"detail": "incorrect_code"}, status=status.HTTP_400_BAD_REQUEST)
            authenticator = form.cleaned_data["credential"]
            login = Login(
                user=authenticator.user,
                email_verification=account_settings.EmailVerificationMethod.NONE,
            )
            perform_passwordless_login(django_request, authenticator, login)
            session.save()
        if not getattr(django_request.user, "is_authenticated", False):
            return response.Response({"detail": "incorrect_code"}, status=status.HTTP_400_BAD_REQUEST)
        return response.Response(auth_payload(django_request.user, session.session_key))


class EmailMfaView(views.APIView):
    def post(self, request):
        action = str(request.data.get("action") or "enable")
        if action == "disable":
            disable_email_mfa(request.user)
            return response.Response(public_mfa_status(request.user))
        if is_staff_account(request.user):
            return response.Response({"detail": "email_not_accepted"}, status=status.HTTP_403_FORBIDDEN)
        if action == "send":
            try:
                send_email_code(request.user)
            except ValidationError as exc:
                return response.Response({"detail": exc.detail}, status=status.HTTP_400_BAD_REQUEST)
            return response.Response({"detail": "sent"})
        code = str(request.data.get("code") or "")
        from .mfa import consume_email_code

        if not consume_email_code(request.user, code):
            return response.Response({"detail": "incorrect_code"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            enable_email_mfa(request.user)
        except ValidationError as exc:
            return response.Response({"detail": exc.detail}, status=status.HTTP_403_FORBIDDEN)
        return response.Response(public_mfa_status(request.user))
