"""Second factor for elevated desks.

allauth issues the session token and owns the authenticator app, recovery
codes, and passkeys. Email codes are ours, and only for people who are not
staff. Old DRF tokens keep working until the sunset date stored on MfaPolicy.
"""

from __future__ import annotations

import hashlib
import secrets
from datetime import timedelta
from importlib import import_module

from allauth.account import app_settings as account_settings
from allauth.account.internal.flows.login import perform_login, record_authentication
from allauth.account.internal.stagekit import get_pending_stage
from allauth.account.models import Login
from allauth.account.stages import LoginStageController
from allauth.core.context import request_context
from allauth.headless.constants import Client
from allauth.headless.internal.authkit import authentication_context
from allauth.headless.internal.decorators import mark_request_as_headless
from allauth.mfa.base.forms import AuthenticateForm
from allauth.mfa.models import Authenticator
from allauth.mfa.stages import AuthenticateStage
from django.conf import settings
from django.db.utils import ProgrammingError
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from .models import EmailMfa, EmailMfaCode, MfaPolicy, StaffMfaGrace, User

ELEVATED_ROLES = frozenset({User.Roles.LTF_ADMIN, User.Roles.LTF_FINANCE, User.Roles.CLUB_ADMIN})
ELEVATED_HEADER_DESKS = frozenset({"ltf_admin", "ltf_finance", "club_admin", "ops"})
STRONG_TYPES = frozenset({Authenticator.Type.TOTP, Authenticator.Type.WEBAUTHN})
PROOF_TYPES = frozenset({Authenticator.Type.TOTP, Authenticator.Type.WEBAUTHN, Authenticator.Type.RECOVERY_CODES})
EXEMPT_PREFIXES = (
    "/api/auth/me",
    "/api/auth/logout",
    "/api/auth/mfa/",
    "/api/auth/desk/",
    "/api/auth/consent",
    "/api/auth/data-export",
    "/api/auth/data-delete",
)
CODE_TTL = timedelta(minutes=10)
CODE_WINDOW = timedelta(minutes=15)
CODE_LIMIT = 5


def get_policy() -> MfaPolicy | None:
    try:
        return MfaPolicy.objects.filter(pk=1).first()
    except ProgrammingError:
        return None


def legacy_tokens_open() -> bool:
    policy = get_policy()
    if policy is None:
        return True
    return timezone.localdate() < policy.token_sunset_on


def is_staff_account(user) -> bool:
    if not user or not getattr(user, "is_authenticated", False):
        return False
    if user.is_superuser or user.role in ELEVATED_ROLES:
        return True
    from django.db.models import Q

    from .models import DeskGrant

    today = timezone.localdate()
    return (
        DeskGrant.objects.filter(
            user_id=user.id,
            desk__in=ELEVATED_ROLES,
            valid_from__lte=today,
        )
        .filter(Q(valid_until__isnull=True) | Q(valid_until__gt=today))
        .exists()
    )


def note_new_elevated_user(user) -> None:
    """A desk granted after the ship date has no grace."""
    if user is None or not getattr(user, "pk", None):
        return
    if user.role not in ELEVATED_ROLES and not user.is_superuser:
        return
    policy = get_policy()
    if policy is None or user.date_joined is None:
        return
    if timezone.localdate(user.date_joined) <= policy.shipped_on:
        return
    if StaffMfaGrace.objects.filter(user_id=user.id).exists():
        return
    StaffMfaGrace.objects.create(
        user_id=user.id,
        grace_until=policy.shipped_on,
        no_grace=True,
        extended=False,
    )


def grace_status(user) -> tuple[bool, str | None]:
    policy = get_policy()
    if policy is None:
        return True, None
    row = StaffMfaGrace.objects.filter(user_id=user.id).only(
        "grace_until", "extended", "no_grace"
    ).first()
    today = timezone.localdate()
    if row is not None:
        if row.no_grace and not row.extended:
            return False, None
        return today < row.grace_until, row.grace_until.isoformat()
    until = policy.shipped_on + timedelta(days=policy.grace_days or 14)
    return today < until, until.isoformat()


def factor_types(user_id: int) -> set[str]:
    return set(Authenticator.objects.filter(user_id=user_id).values_list("type", flat=True))


def authentication_methods(request) -> list[dict]:
    django_request = getattr(request, "_request", request)
    session = getattr(django_request, "_allauth_token_session", None)
    if session is None:
        session = getattr(django_request, "session", None)
    if session is None:
        return []
    rows = session.get("account_authentication_methods", [])
    return list(rows) if isinstance(rows, list) else []


def session_proved_strong(request) -> bool:
    for row in authentication_methods(request):
        if row.get("method") == "mfa" and row.get("type") in PROOF_TYPES:
            return True
    return False


def public_mfa_status(user) -> dict:
    types = factor_types(user.id) if getattr(user, "id", None) else set()
    enrolled = bool(types & STRONG_TYPES)
    recovery = Authenticator.Type.RECOVERY_CODES in types
    staff = is_staff_account(user)
    open_grace, until = grace_status(user) if staff else (False, None)
    email = EmailMfa.objects.filter(user_id=user.id, enabled=True).exists()
    blocked = bool(staff and not enrolled and not open_grace)
    return {
        "required": staff,
        "enrolled": enrolled,
        "recovery_codes": recovery,
        "grace": bool(staff and open_grace and not enrolled),
        "grace_until": until if staff and open_grace and not enrolled else None,
        "blocked": blocked,
        "email_available": not staff,
        "email_enabled": email and not staff,
        "passkeys": Authenticator.objects.filter(user_id=user.id, type=Authenticator.Type.WEBAUTHN).count(),
    }


def _needs_strong_mfa(request, user) -> bool:
    path = getattr(request, "path", "") or ""
    if any(path.startswith(prefix) for prefix in EXEMPT_PREFIXES):
        return False
    raw = str(request.META.get("HTTP_X_DESK") or "").strip()
    if raw == "member" or raw.startswith("coach:"):
        return False
    desk = raw.split(":", 1)[0] if raw else ""
    if desk in ELEVATED_HEADER_DESKS:
        return True
    if path.startswith("/api/ops/"):
        return bool(user.is_superuser)
    if not raw and user.role in ELEVATED_ROLES:
        return True
    return False


def enforce_elevated_mfa(request, user) -> None:
    if not _needs_strong_mfa(request, user):
        return
    types = factor_types(user.id)
    enrolled = bool(types & STRONG_TYPES)
    grant = getattr(request, "desk_grant", None)
    fresh_grant = (
        grant is not None
        and grant.source in {"office", "manual"}
        and grant.desk in {"ltf_finance", "ltf_admin", "club_admin"}
    )
    if enrolled:
        if Authenticator.Type.RECOVERY_CODES not in types:
            raise PermissionDenied(detail="mfa_recovery_required")
        if not session_proved_strong(request):
            raise PermissionDenied(detail="mfa_required")
        return
    if fresh_grant:
        raise PermissionDenied(detail="mfa_enrol_required")
    open_grace, _until = grace_status(user)
    if open_grace:
        return
    raise PermissionDenied(detail="mfa_enrol_required")


def auth_payload(user, token: str) -> dict:
    from .desks import open_desk_summary
    from .serializers import UserSerializer

    payload = {"token": token, "user": UserSerializer(user).data, "mfa": public_mfa_status(user)}
    payload.update(open_desk_summary(user))
    return payload


def _session_store(key: str | None = None):
    engine = import_module(settings.SESSION_ENGINE)
    return engine.SessionStore(session_key=key)


def load_session(token: str):
    if not token:
        return None
    session = _session_store(token)
    if not session.exists(token):
        return None
    session.load()
    return session


def _bind(django_request, session) -> None:
    django_request.session = session
    django_request._allauth_token_session = session


def begin_password_login(django_request, user) -> dict:
    """Run allauth's login, including the authenticator step when one is enrolled."""
    mark_request_as_headless(django_request, Client.APP)
    with authentication_context(django_request):
        with request_context(django_request):
            if _email_step_needed(user):
                django_request.session["ltf_email_mfa_user"] = user.id
                send_email_code(user)
                django_request.session.save()
                return {
                    "mfa_pending": True,
                    "token": django_request.session.session_key,
                    "mfa_methods": ["email"],
                }
            login = Login(
                user=user,
                email_verification=account_settings.EmailVerificationMethod.NONE,
            )
            record_authentication(django_request, user, method="password", username=user.username)
            perform_login(django_request, login)
            django_request.session.save()
            stage = get_pending_stage(django_request)
            key = django_request.session.session_key
            if stage is not None or not getattr(django_request.user, "is_authenticated", False):
                methods = list(
                    Authenticator.objects.filter(user_id=user.id).values_list("type", flat=True)
                )
                return {"mfa_pending": True, "token": key, "mfa_methods": methods}
            return auth_payload(django_request.user, key)


def confirm_code(django_request, token: str, code: str) -> dict:
    session = load_session(token)
    if session is None:
        raise ValidationError("mfa_not_pending")
    _bind(django_request, session)
    mark_request_as_headless(django_request, Client.APP)
    with request_context(django_request):
        email_user_id = session.get("ltf_email_mfa_user")
        if email_user_id:
            user = User.objects.filter(pk=email_user_id, is_active=True).first()
            if user is None or is_staff_account(user):
                raise ValidationError("email_not_accepted")
            if not consume_email_code(user, code):
                raise ValidationError("incorrect_code")
            session.pop("ltf_email_mfa_user", None)
            login = Login(
                user=user,
                email_verification=account_settings.EmailVerificationMethod.NONE,
            )
            record_authentication(django_request, user, method="email", username=user.username)
            perform_login(django_request, login)
            session.save()
            if not django_request.user.is_authenticated:
                raise ValidationError("mfa_not_pending")
            return auth_payload(django_request.user, session.session_key)

        stage = LoginStageController.enter(django_request, AuthenticateStage.key)
        if stage is None or stage.login.user is None:
            raise ValidationError("mfa_not_pending")
        form = AuthenticateForm(data={"code": code}, user=stage.login.user)
        if not form.is_valid():
            raise ValidationError("incorrect_code")
        form.save()
        stage.exit()
        session.save()
        if not getattr(django_request.user, "is_authenticated", False):
            raise ValidationError("mfa_not_pending")
        return auth_payload(django_request.user, session.session_key)


def _email_step_needed(user) -> bool:
    if is_staff_account(user):
        return False
    if factor_types(user.id) & STRONG_TYPES:
        return False
    return EmailMfa.objects.filter(user_id=user.id, enabled=True).exists()


def _hash_code(user_id: int, code: str) -> str:
    raw = f"{settings.SECRET_KEY}:{user_id}:{code}".encode()
    return hashlib.sha256(raw).hexdigest()


def send_email_code(user) -> None:
    if is_staff_account(user):
        raise ValidationError("email_not_accepted")
    since = timezone.now() - CODE_WINDOW
    if EmailMfaCode.objects.filter(user_id=user.id, created_at__gte=since).count() >= CODE_LIMIT:
        raise ValidationError("mfa_rate_limited")
    code = f"{secrets.randbelow(1_000_000):06d}"
    EmailMfaCode.objects.create(
        user=user,
        code_hash=_hash_code(user.id, code),
        expires_at=timezone.now() + CODE_TTL,
    )
    from .email_utils import send_resend_email

    text = f"Your LTF Dojang Hub sign-in code is {code}. It expires in 10 minutes."
    send_resend_email(
        user.email,
        "Your LTF Dojang Hub sign-in code",
        f"<p>{text}</p>",
        text,
    )


def consume_email_code(user, code: str) -> bool:
    digest = _hash_code(user.id, str(code or "").strip())
    row = (
        EmailMfaCode.objects.filter(user_id=user.id, code_hash=digest, used_at__isnull=True)
        .order_by("-created_at")
        .first()
    )
    if row is None or row.expires_at < timezone.now():
        return False
    row.used_at = timezone.now()
    row.save(update_fields=["used_at"])
    return True


def enable_email_mfa(user) -> None:
    if is_staff_account(user):
        raise ValidationError("email_not_accepted")
    EmailMfa.objects.update_or_create(user=user, defaults={"enabled": True})


def disable_email_mfa(user) -> None:
    EmailMfa.objects.filter(user_id=user.id).update(enabled=False)


def reset_authenticators(actor, user) -> None:
    Authenticator.objects.filter(
        user_id=user.id,
        type__in=[Authenticator.Type.TOTP, Authenticator.Type.RECOVERY_CODES],
    ).delete()
    _audit(actor, "mfa.reset", user, "Authenticator and recovery codes reset.")


def remove_passkeys(actor, user) -> int:
    deleted, _ = Authenticator.objects.filter(
        user_id=user.id, type=Authenticator.Type.WEBAUTHN
    ).delete()
    _audit(actor, "passkey.removed", user, "Passkeys removed.", {"count": deleted})
    return deleted


def extend_grace(actor, user) -> StaffMfaGrace:
    policy = get_policy()
    days = 14 if policy is None else (policy.grace_days or 14)
    row = StaffMfaGrace.objects.filter(user_id=user.id).first()
    if row is not None and row.extended:
        raise ValidationError("mfa_grace_already_extended")
    until = timezone.localdate() + timedelta(days=days)
    if row is None:
        row = StaffMfaGrace(user=user)
    row.grace_until = until
    row.no_grace = False
    row.extended = True
    row.extended_by = actor
    row.extended_at = timezone.now()
    row.save()
    _audit(actor, "mfa.grace_extended", user, "2FA grace extended once.", {"grace_until": until.isoformat()})
    return row


def _audit(actor, action: str, user, message: str, metadata: dict | None = None) -> None:
    from ops.models import OpsAuditLog

    OpsAuditLog.objects.create(
        actor=actor if getattr(actor, "is_authenticated", False) else None,
        action=action,
        target_type="user",
        target_id=str(user.id),
        message=message,
        metadata=metadata or {"user_id": user.id},
    )


def recently_authenticated(request) -> bool:
    import time

    from allauth.account import app_settings as account_app_settings

    now = time.time()
    window = account_app_settings.REAUTHENTICATION_TIMEOUT
    for row in authentication_methods(request):
        if row.get("method") in {"password", "mfa"} and now - float(row.get("at") or 0) < window:
            return True
    return False
