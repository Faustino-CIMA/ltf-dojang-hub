from django.conf import settings
from django.contrib.auth.models import AbstractUser
from django.db import models
from django.utils import timezone
from django.utils.translation import gettext_lazy as _


class User(AbstractUser):
    class Roles(models.TextChoices):
        LTF_ADMIN = "ltf_admin", _("LTF Admin")
        LTF_FINANCE = "ltf_finance", _("LTF Finance")
        CLUB_ADMIN = "club_admin", _("Club Admin")
        COACH = "coach", _("Coach")
        MEMBER = "member", _("Member")

    role = models.CharField(
        max_length=20,
        choices=Roles.choices,
        default=Roles.MEMBER,
    )
    is_email_verified = models.BooleanField(default=False)
    consent_given = models.BooleanField(default=False)
    consent_given_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def give_consent(self):
        self.consent_given = True
        self.consent_given_at = timezone.now()
        self.save(update_fields=["consent_given", "consent_given_at"])

    def revoke_consent(self):
        self.consent_given = False
        self.consent_given_at = None
        self.save(update_fields=["consent_given", "consent_given_at"])


class AccountSetupInvite(models.Model):
    """One-time link that lets a club admin choose an email and a password."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="account_setup_invites",
    )
    token_hash = models.CharField(max_length=64, unique=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="account_setup_invites_created",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)
    revoked_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
