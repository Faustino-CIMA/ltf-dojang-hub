"""Email code for the reusable join link. The plain code is emailed, then forgotten."""

import hashlib
import secrets
from datetime import timedelta

from django.core.cache import cache
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.validators import validate_email
from django.utils import timezone

from accounts.email_utils import send_resend_email

from .onboarding_models import JoinEmailCode, JoinEmailProof

CODE_MINUTES = 10
PROOF_HOURS = 12
WINDOW_SECONDS = 3600
EMAIL_LIMIT = 5
IP_EMAIL_LIMIT = 20
SUBMIT_LIMIT = 10
LINK_LIMIT = 60

_MAIL = {
    "en": ("Your code to join {club}", "Your code is {code}. It works for 10 minutes. If you did not ask for it, ignore this message."),
    "fr": ("Votre code pour rejoindre {club}", "Votre code est {code}. Il est valable 10 minutes. Si vous ne l'avez pas demandé, ignorez ce message."),
    "de": ("Ihr Code für den Beitritt zu {club}", "Ihr Code ist {code}. Er gilt 10 Minuten. Wenn Sie ihn nicht angefordert haben, ignorieren Sie diese Nachricht."),
    "lb": ("Äre Code fir bei {club} derbäizekommen", "Äre Code ass {code}. E gëlt 10 Minutten. Wann Dir en net ugefrot hutt, ignoréiert dëse Message."),
}


class JoinCodeError(Exception):
    def __init__(self, code: str, status: int):
        super().__init__(code)
        self.code = code
        self.status = status


def normalize_email(value: str) -> str:
    email = str(value or "").strip().lower()
    try:
        validate_email(email)
    except DjangoValidationError as exc:
        raise JoinCodeError("email_invalid", 400) from exc
    return email


def _digest(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _client_ip(request) -> str:
    forwarded = str(request.META.get("HTTP_X_FORWARDED_FOR") or "")
    if forwarded:
        return forwarded.split(",")[0].strip() or "unknown"
    return str(request.META.get("REMOTE_ADDR") or "unknown")


def _allow(key: str, limit: int, error: str) -> None:
    now = timezone.now().timestamp()
    bucket = cache.get(key)
    if not isinstance(bucket, dict) or now - float(bucket.get("start", 0)) >= WINDOW_SECONDS:
        bucket = {"start": now, "count": 0}
    if int(bucket["count"]) + 1 > limit:
        raise JoinCodeError(error, 429)
    bucket["count"] = int(bucket["count"]) + 1
    remaining = WINDOW_SECONDS - (now - float(bucket["start"]))
    cache.set(key, bucket, timeout=max(1, int(remaining)))


def guard_public_link(request) -> None:
    _allow(f"join-link:{_client_ip(request)}", LINK_LIMIT, "rate_link")


def join_url(token: str, locale: str) -> str:
    from django.conf import settings

    chosen = locale if locale in _MAIL else "en"
    base = str(getattr(settings, "FRONTEND_BASE_URL", "") or "").rstrip("/")
    return f"{base}/{chosen}/join/{token}"


def _mail(locale: str, club_name: str, code: str) -> tuple[str, str]:
    subject, body = _MAIL.get(locale, _MAIL["en"])
    return subject.format(club=club_name), body.format(club=club_name, code=code)


def send_join_code(request, club, email: str, locale: str) -> None:
    address = normalize_email(email)
    ip = _client_ip(request)
    _allow(f"join-code-ip:{ip}", IP_EMAIL_LIMIT, "rate_ip")
    _allow(f"join-code-email:{address}", EMAIL_LIMIT, "rate_email")
    now = timezone.now()
    JoinEmailCode.objects.filter(club=club, email=address, used_at__isnull=True).update(used_at=now)
    JoinEmailCode.objects.filter(expires_at__lt=now).delete()
    code = f"{secrets.randbelow(1000000):06d}"
    JoinEmailCode.objects.create(
        club=club,
        email=address,
        code_hash=_digest(code),
        expires_at=now + timedelta(minutes=CODE_MINUTES),
    )
    subject, text = _mail(locale, club.name, code)
    ok, _error = send_resend_email(address, subject, f"<p>{text}</p>", text)
    if not ok:
        raise JoinCodeError("email_failed", 502)


def check_join_code(request, club, email: str, code: str) -> str:
    _allow(f"join-submit:{_client_ip(request)}", SUBMIT_LIMIT, "rate_submit")
    try:
        address = normalize_email(email)
    except JoinCodeError:
        raise JoinCodeError("code_invalid", 400)
    digits = "".join(char for char in str(code or "") if char.isdigit())
    now = timezone.now()
    row = (
        JoinEmailCode.objects.filter(club=club, email=address, used_at__isnull=True, expires_at__gt=now)
        .order_by("-created_at", "-id")
        .first()
    )
    if row is None or row.code_hash != _digest(digits):
        raise JoinCodeError("code_invalid", 400)
    row.used_at = now
    row.save(update_fields=["used_at"])
    raw = secrets.token_urlsafe(32)
    JoinEmailProof.objects.create(
        club=club,
        email=address,
        token_hash=_digest(raw),
        expires_at=now + timedelta(hours=PROOF_HOURS),
    )
    return raw
