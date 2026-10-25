import hashlib
import secrets
from datetime import timedelta

from django.conf import settings
from django.utils import timezone

from .models import AccountSetupInvite

NEUTRAL_DETAIL = "Ask your federation administrator for a new link."


def hash_setup_token(raw: str) -> str:
    return hashlib.sha256(str(raw or "").encode()).hexdigest()


def issue_setup_invite(user, created_by):
    now = timezone.now()
    AccountSetupInvite.objects.filter(user=user, used_at__isnull=True, revoked_at__isnull=True).update(revoked_at=now)
    raw = secrets.token_urlsafe(32)
    invite = AccountSetupInvite.objects.create(
        user=user,
        token_hash=hash_setup_token(raw),
        created_by=created_by if getattr(created_by, "is_authenticated", False) else None,
        expires_at=now + timedelta(days=7),
    )
    return invite, raw


def setup_link(raw: str, locale: str = "en") -> str:
    base = str(getattr(settings, "FRONTEND_BASE_URL", "") or "").rstrip("/")
    return f"{base}/{locale}/account-setup?token={raw}"


def invite_for_token(raw: str) -> AccountSetupInvite | None:
    if not raw:
        return None
    return AccountSetupInvite.objects.select_related("user").filter(token_hash=hash_setup_token(raw)).first()


def invite_is_open(invite: AccountSetupInvite | None, now=None) -> bool:
    if invite is None or invite.used_at or invite.revoked_at:
        return False
    now = now or timezone.now()
    return invite.expires_at > now


def link_status(user) -> str:
    invite = user.account_setup_invites.order_by("-created_at").first()
    if invite is None:
        return "none"
    if invite.used_at:
        return "used"
    if invite.revoked_at:
        return "revoked"
    if invite.expires_at <= timezone.now():
        return "expired"
    return "active"
