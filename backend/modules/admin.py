from django.contrib import admin

from .models import ClubModuleAssignment, InstallEntitlement, InstallIdentity, ProductCodeRedemption


@admin.register(InstallIdentity)
class InstallIdentityAdmin(admin.ModelAdmin):
    list_display = ("install_id", "created_at")
    readonly_fields = ("install_id", "created_at", "updated_at", "local_public_key")
    exclude = ("local_private_key",)


@admin.register(ProductCodeRedemption)
class ProductCodeRedemptionAdmin(admin.ModelAdmin):
    list_display = ("jti", "status", "redeemed_at", "expires_at")
    list_filter = ("status",)
    readonly_fields = (
        "jti",
        "fingerprint",
        "modules",
        "caps",
        "payload",
        "issued_at",
        "expires_at",
        "redeemed_at",
        "redeemed_by",
    )


@admin.register(InstallEntitlement)
class InstallEntitlementAdmin(admin.ModelAdmin):
    list_display = ("module_id", "active", "expires_at", "updated_at")
    list_filter = ("active",)


@admin.register(ClubModuleAssignment)
class ClubModuleAssignmentAdmin(admin.ModelAdmin):
    list_display = ("club", "module_id", "enabled", "assigned_at")
    list_filter = ("enabled", "module_id")
