from django.conf import settings
from django.db import models


class InstallIdentity(models.Model):
    """Singleton (pk=1). Identifies this running copy for product codes."""

    install_id = models.UUIDField(unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    local_public_key = models.CharField(max_length=128, blank=True)
    local_private_key = models.CharField(max_length=128, blank=True)

    class Meta:
        verbose_name = "Install identity"
        verbose_name_plural = "Install identity"

    def __str__(self) -> str:
        return str(self.install_id)


class ProductCodeRedemption(models.Model):
    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        SUPERSEDED = "superseded", "Superseded"
        REVOKED = "revoked", "Revoked"
        EXPIRED = "expired", "Expired"
        INVALID = "invalid", "Invalid"

    jti = models.CharField(max_length=64, unique=True)
    fingerprint = models.CharField(max_length=64, unique=True)
    modules = models.JSONField(default=list)
    caps = models.JSONField(default=dict, blank=True)
    payload = models.JSONField(default=dict, blank=True)
    issued_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.ACTIVE)
    redeemed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="product_code_redemptions",
    )
    redeemed_at = models.DateTimeField(auto_now_add=True)
    revoked_at = models.DateTimeField(null=True, blank=True)
    revoked_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="revoked_product_codes",
    )

    class Meta:
        ordering = ["-redeemed_at"]
        indexes = [
            models.Index(fields=["status", "-redeemed_at"], name="mod_redeem_status_idx"),
        ]

    def __str__(self) -> str:
        return f"{self.jti} {self.status}"


class InstallEntitlement(models.Model):
    module_id = models.CharField(max_length=64, unique=True)
    source = models.ForeignKey(
        ProductCodeRedemption,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="entitlements",
    )
    active = models.BooleanField(default=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    caps = models.JSONField(default=dict, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["module_id"]

    def __str__(self) -> str:
        return f"{self.module_id} active={self.active}"


class ClubModuleAssignment(models.Model):
    club = models.ForeignKey(
        "clubs.Club",
        on_delete=models.CASCADE,
        related_name="module_assignments",
    )
    module_id = models.CharField(max_length=64)
    enabled = models.BooleanField(default=True)
    assigned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="club_module_assignments",
    )
    assigned_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["club", "module_id"],
                name="mod_club_module_uniq",
            ),
        ]
        indexes = [
            models.Index(fields=["module_id", "enabled"], name="mod_club_mod_enabled_idx"),
        ]
        ordering = ["club_id", "module_id"]

    def __str__(self) -> str:
        return f"club={self.club_id} {self.module_id} enabled={self.enabled}"
