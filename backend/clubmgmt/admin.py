from django.contrib import admin

from .models import (
    Committee,
    CommitteeMandate,
    Family,
    MedicalCheckup,
    MemberRecord,
    MembershipFee,
    MembershipYearConfirmation,
    Person,
    ShopItem,
    ShopSale,
    ShopSnapshot,
)


@admin.register(MemberRecord)
class MemberRecordAdmin(admin.ModelAdmin):
    list_display = ("member", "joined_at", "nationality_1")


@admin.register(Person)
class PersonAdmin(admin.ModelAdmin):
    list_display = ("first_name", "last_name", "club")


@admin.register(MedicalCheckup)
class MedicalCheckupAdmin(admin.ModelAdmin):
    list_display = ("member", "checked_on", "valid_until")


@admin.register(Family)
class FamilyAdmin(admin.ModelAdmin):
    list_display = ("name", "club")


@admin.register(MembershipFee)
class MembershipFeeAdmin(admin.ModelAdmin):
    list_display = ("name", "club", "year", "amount")


@admin.register(MembershipYearConfirmation)
class MembershipYearConfirmationAdmin(admin.ModelAdmin):
    list_display = ("club", "year", "household_key", "confirmed_at")


@admin.register(Committee)
class CommitteeAdmin(admin.ModelAdmin):
    list_display = ("name", "scope", "club")


@admin.register(CommitteeMandate)
class CommitteeMandateAdmin(admin.ModelAdmin):
    list_display = ("committee", "role", "member", "person", "started_on", "ended_on")


@admin.register(ShopItem)
class ShopItemAdmin(admin.ModelAdmin):
    list_display = ("sku", "name", "club", "sale_price", "is_active")


@admin.register(ShopSale)
class ShopSaleAdmin(admin.ModelAdmin):
    list_display = ("sale_number", "club", "total", "status", "created_at")


@admin.register(ShopSnapshot)
class ShopSnapshotAdmin(admin.ModelAdmin):
    list_display = ("club", "taken_at", "note")
