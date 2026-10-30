from allauth.account.signals import email_confirmed, password_reset
from allauth.mfa.models import Authenticator
from allauth.mfa.signals import authenticator_added, authenticator_removed, authenticator_used
from django.contrib.auth.signals import user_logged_in
from django.db.models.signals import m2m_changed, post_save
from django.dispatch import receiver

from clubs.models import Club

from .desks import sync_legacy_grants
from .models import User


def _auth_event(request, event_type, user, username=""):
    from ops.events import record_auth_event

    record_auth_event(
        request,
        event_type,
        username=username or getattr(user, "username", ""),
        user=user,
    )


def _ops(actor, action, user, message, metadata=None):
    from ops.models import OpsAuditLog

    OpsAuditLog.objects.create(
        actor=actor if getattr(actor, "is_authenticated", False) else actor,
        action=action,
        target_type="user",
        target_id=str(getattr(user, "id", "") or ""),
        message=message,
        metadata=metadata or {},
    )


@receiver(user_logged_in)
def record_login_success(sender, request, user, **kwargs):
    path = ""
    if request is not None:
        path = getattr(request, "path", "") or ""
    if "/admin/" in path:
        return
    from ops.detectors import run_success_detectors
    from ops.models import AuthEvent
    from ops.request_utils import client_ip

    _auth_event(request, AuthEvent.EventType.LOGIN_SUCCESS, user, user.username)
    run_success_detectors(request, user=user, ip=client_ip(request))


@receiver(password_reset)
def record_password_reset(sender, request, user, **kwargs):
    from ops.models import AuthEvent

    _auth_event(request, AuthEvent.EventType.PASSWORD_RESET, user, getattr(user, "username", ""))


@receiver(authenticator_added)
def record_authenticator_added(sender, request, user, authenticator, **kwargs):
    if authenticator.type == Authenticator.Type.WEBAUTHN:
        _ops(user, "passkey.added", user, "Passkey added.")
        return
    _ops(user, "mfa.enrolled", user, "Authenticator enrolled.", {"type": authenticator.type})


@receiver(authenticator_removed)
def record_authenticator_removed(sender, request, user, authenticator, **kwargs):
    if authenticator.type == Authenticator.Type.WEBAUTHN:
        _ops(user, "passkey.removed", user, "Passkey removed.")


@receiver(authenticator_used)
def record_recovery_used(sender, request, user, authenticator, **kwargs):
    if authenticator.type == Authenticator.Type.RECOVERY_CODES:
        _ops(user, "mfa.recovery_used", user, "Recovery code used.")


@receiver(email_confirmed)
def mark_user_email_verified(request, email_address, **kwargs):
    user = email_address.user
    if not user.is_email_verified:
        user.is_email_verified = True
        user.save(update_fields=["is_email_verified"])


@receiver(post_save, sender=User)
def sync_desk_grants_on_user_save(sender, instance, raw=False, update_fields=None, **kwargs):
    if raw:
        return
    if update_fields is not None and set(update_fields).isdisjoint({"role"}):
        return
    sync_legacy_grants(instance)


def _sync_m2m(sender, instance, action, pk_set, reverse, role):
    if action not in {"post_add", "post_remove", "post_clear"}:
        return
    if reverse:
        sync_legacy_grants(instance)
        return
    if action == "post_clear":
        for user in User.objects.filter(role=role):
            sync_legacy_grants(user)
        return
    for user in User.objects.filter(id__in=pk_set or []):
        sync_legacy_grants(user)


@receiver(m2m_changed, sender=Club.admins.through)
def sync_desk_grants_on_admin_list(sender, instance, action, pk_set, reverse, **kwargs):
    _sync_m2m(sender, instance, action, pk_set, reverse, User.Roles.CLUB_ADMIN)


@receiver(m2m_changed, sender=Club.trainers.through)
def sync_desk_grants_on_trainer_list(sender, instance, action, pk_set, reverse, **kwargs):
    _sync_m2m(sender, instance, action, pk_set, reverse, User.Roles.COACH)
