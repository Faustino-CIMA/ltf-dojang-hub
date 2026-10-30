from allauth.account.signals import email_confirmed
from django.db.models.signals import m2m_changed, post_save
from django.dispatch import receiver

from clubs.models import Club

from .desks import sync_legacy_grants
from .models import User


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
