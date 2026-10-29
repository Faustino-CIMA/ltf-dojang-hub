"""Grandfather modules already switched on. Schema changes stay in 0054.

This runs only after that schema has committed, and only after the modules
tables exist. It uses the historical app registry, not the live models.
"""

from decimal import Decimal

from django.db import migrations
from django.utils import timezone

BILLABLE_MODULE_IDS = ("club_management", "competition", "event_calendar")
LABELS = {
    "club_management": "Club management",
    "competition": "Competition",
    "event_calendar": "Event calendar",
}


def create_legacy_purchases(apps, schema_editor):
    ClubModuleAssignment = apps.get_model("modules", "ClubModuleAssignment")
    ClubFeeType = apps.get_model("licenses", "ClubFeeType")
    ModulePurchase = apps.get_model("licenses", "ModulePurchase")

    covered = set()
    for club_id, module_ids in ModulePurchase.objects.exclude(status="cancelled").values_list(
        "club_id", "module_ids"
    ):
        if isinstance(module_ids, str):
            continue
        for module_id in module_ids or []:
            covered.add((club_id, str(module_id)))

    fees = {}
    for fee in ClubFeeType.objects.filter(module_id__in=BILLABLE_MODULE_IDS):
        fees.setdefault(fee.module_id, fee)

    now = timezone.now()
    for club_id, module_id in ClubModuleAssignment.objects.filter(
        enabled=True,
        module_id__in=BILLABLE_MODULE_IDS,
    ).values_list("club_id", "module_id"):
        key = (club_id, module_id)
        if key in covered:
            continue
        fee = fees.get(module_id)
        ModulePurchase.objects.create(
            club_id=club_id,
            fee_type=fee,
            bundle=None,
            module_ids=[module_id],
            description=LABELS.get(module_id, module_id),
            price_snapshot=Decimal("0.00"),
            currency="EUR",
            status="active",
            renewal_choice="unanswered",
            source="legacy",
            automation_hold="grandfathered",
            activation_error="",
            activated_at=now,
        )
        covered.add(key)


class Migration(migrations.Migration):

    dependencies = [
        ("licenses", "0054_module_renewals"),
        ("modules", "0003_backfill_competition"),
    ]

    operations = [
        migrations.RunPython(create_legacy_purchases, migrations.RunPython.noop),
    ]
