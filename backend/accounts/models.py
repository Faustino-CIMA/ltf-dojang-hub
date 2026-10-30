from django.conf import settings
from django.contrib.auth.models import AbstractUser
from django.db import models
from django.db.models import Q
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


class DeskGrant(models.Model):
    """A desk this person may open. Legacy rows mirror the single role they have today."""

    class Desk(models.TextChoices):
        LTF_FINANCE = "ltf_finance", _("LTF Finance")
        LTF_ADMIN = "ltf_admin", _("LTF Admin")
        CLUB_ADMIN = "club_admin", _("Club Admin")
        COACH = "coach", _("Coach")
        MEMBER = "member", _("Member")

    class Level(models.TextChoices):
        FULL = "full", _("Full")
        READ_ONLY = "read_only", _("Read only")

    class Source(models.TextChoices):
        MANUAL = "manual", _("Manual")
        OFFICE = "office", _("Office")
        LEGACY = "legacy", _("Legacy")

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="desk_grants",
    )
    desk = models.CharField(max_length=20, choices=Desk.choices)
    level = models.CharField(max_length=20, choices=Level.choices, default=Level.FULL)
    club = models.ForeignKey(
        "clubs.Club",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="desk_grants",
    )
    source = models.CharField(max_length=20, choices=Source.choices, default=Source.LEGACY)
    valid_from = models.DateField()
    valid_until = models.DateField(null=True, blank=True)
    reason = models.CharField(max_length=255, blank=True)
    granted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="desk_grants_given",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["user", "desk", "club", "level", "source"],
                condition=Q(source="legacy"),
                nulls_distinct=False,
                name="desk_grant_legacy_uniq",
            ),
            models.CheckConstraint(
                condition=~Q(source="manual", level="read_only", valid_until__isnull=True),
                name="desk_grant_manual_readonly_end",
            ),
            models.CheckConstraint(
                condition=(
                    Q(desk__in=["ltf_finance", "ltf_admin", "member"])
                    | Q(club__isnull=False)
                    | Q(source="legacy")
                ),
                name="desk_grant_club_when_needed",
            ),
        ]
        indexes = [
            models.Index(fields=["user", "desk", "valid_until"], name="desk_grant_user_desk_until"),
        ]

    def __str__(self) -> str:
        return f"{self.user_id} {self.desk} {self.level}"


class DeskPreference(models.Model):
    """The desk this person last chose. It does not grant access."""

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="desk_preference",
    )
    desk = models.CharField(max_length=20, choices=DeskGrant.Desk.choices)
    club = models.ForeignKey(
        "clubs.Club",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f"{self.user_id} {self.desk}"


class MfaPolicy(models.Model):
    """When the second factor shipped, and when old tokens stop working."""

    shipped_on = models.DateField()
    grace_days = models.PositiveSmallIntegerField(default=14)
    token_sunset_on = models.DateField()

    def __str__(self) -> str:
        return f"mfa {self.shipped_on}"


class StaffMfaGrace(models.Model):
    """Grace for people who already had an elevated desk on the day 2FA shipped.

    A row with no_grace means this person received an elevated desk after that
    day, so the desk stays closed until they enrol. extended may be set once.
    """

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="mfa_grace",
    )
    grace_until = models.DateField()
    no_grace = models.BooleanField(default=False)
    extended = models.BooleanField(default=False)
    extended_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )
    extended_at = models.DateTimeField(null=True, blank=True)

    def __str__(self) -> str:
        return f"grace {self.user_id} until {self.grace_until}"


class EmailMfa(models.Model):
    """Optional email codes for members, coaches, and parents. Never for staff desks."""

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="email_mfa",
    )
    enabled = models.BooleanField(default=False)

    def __str__(self) -> str:
        return f"email mfa {self.user_id}"


class EmailMfaCode(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="email_mfa_codes",
    )
    code_hash = models.CharField(max_length=64)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=["user", "-created_at"], name="emailmfa_user_created_idx"),
        ]
