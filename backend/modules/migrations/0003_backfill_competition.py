from django.db import migrations

CLUB_MANAGEMENT = "club_management"
COMPETITION = "competition"


def backfill_competition(apps, schema_editor):
    InstallEntitlement = apps.get_model("modules", "InstallEntitlement")
    ClubModuleAssignment = apps.get_model("modules", "ClubModuleAssignment")
    if not InstallEntitlement.objects.filter(module_id=CLUB_MANAGEMENT, active=True).exists():
        return
    entitlement, _created = InstallEntitlement.objects.get_or_create(
        module_id=COMPETITION,
        defaults={"active": True, "caps": {}},
    )
    if not entitlement.active:
        entitlement.active = True
        entitlement.save(update_fields=["active"])
    for row in ClubModuleAssignment.objects.filter(module_id=CLUB_MANAGEMENT, enabled=True):
        existing = ClubModuleAssignment.objects.filter(club_id=row.club_id, module_id=COMPETITION).first()
        if existing is None:
            ClubModuleAssignment.objects.create(
                club_id=row.club_id,
                module_id=COMPETITION,
                enabled=True,
                assigned_by_id=row.assigned_by_id,
            )
            continue
        if not existing.enabled:
            existing.enabled = True
            existing.save(update_fields=["enabled"])


def reverse_competition(apps, schema_editor):
    InstallEntitlement = apps.get_model("modules", "InstallEntitlement")
    ClubModuleAssignment = apps.get_model("modules", "ClubModuleAssignment")
    ClubModuleAssignment.objects.filter(module_id=COMPETITION).delete()
    InstallEntitlement.objects.filter(module_id=COMPETITION).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("modules", "0002_absorb_inventory_club"),
    ]

    operations = [
        migrations.RunPython(backfill_competition, reverse_competition),
    ]
