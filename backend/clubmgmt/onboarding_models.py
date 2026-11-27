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
    updated_at = models.DateTimeField(auto_now=True)

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
