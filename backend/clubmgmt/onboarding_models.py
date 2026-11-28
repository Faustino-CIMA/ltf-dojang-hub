import secrets

from django.conf import settings
from django.db import models
from django.db.models import Q


def rules_upload_to(instance, filename: str) -> str:
    return f"club-onboarding/rules/{instance.club_id}/{filename}"


class ClubOnboardingSettings(models.Model):
    class Requirement(models.TextChoices):
        HIDDEN = "hidden", "Hidden"
        OPTIONAL = "optional", "Optional"
        REQUIRED = "required", "Required"

    club = models.OneToOneField("clubs.Club", on_delete=models.CASCADE, related_name="onboarding_settings")
    public_link_enabled = models.BooleanField(default=False)
    invites_enabled = models.BooleanField(default=False)
    equipment_note = models.TextField(blank=True)
    photo_requirement = models.CharField(
        max_length=16,
        choices=Requirement.choices,
        default=Requirement.OPTIONAL,
    )
    medico_requirement = models.CharField(
        max_length=16,
        choices=Requirement.choices,
        default=Requirement.OPTIONAL,
    )
    link_token = models.CharField(max_length=64, unique=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    def save(self, *args, **kwargs):
        if not self.link_token:
            self.link_token = secrets.token_urlsafe(32)
        super().save(*args, **kwargs)

    def __str__(self) -> str:
        return f"Onboarding {self.club_id}"


class ClubRulesVersion(models.Model):
    club = models.ForeignKey("clubs.Club", on_delete=models.CASCADE, related_name="rules_versions")
    version = models.PositiveIntegerField()
    effective_on = models.DateField()
    file = models.FileField(upload_to=rules_upload_to, blank=True)
    url = models.URLField(max_length=500, blank=True)
    sha256 = models.CharField(max_length=64)
    is_current = models.BooleanField(default=False)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="club_rules_versions",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-version", "-id"]
        constraints = [
            models.UniqueConstraint(fields=["club", "version"], name="clubmgmt_rules_version_uniq"),
            models.UniqueConstraint(
                fields=["club"],
                condition=Q(is_current=True),
                name="clubmgmt_one_current_rules",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.club_id} v{self.version}"


class JoinEmailCode(models.Model):
    """A one-time code for the reusable join link. The plain code is not stored."""

    club = models.ForeignKey("clubs.Club", on_delete=models.CASCADE, related_name="join_email_codes")
    email = models.EmailField()
    code_hash = models.CharField(max_length=64)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]


class JoinEmailProof(models.Model):
    """Proof that an address confirmed a code. The raw proof is returned once."""

    club = models.ForeignKey("clubs.Club", on_delete=models.CASCADE, related_name="join_email_proofs")
    email = models.EmailField()
    token_hash = models.CharField(max_length=64, unique=True)
    expires_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]
