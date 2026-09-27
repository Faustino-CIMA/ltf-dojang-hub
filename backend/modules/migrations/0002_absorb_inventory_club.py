from django.db import migrations

LEGACY = "inventory_club"
CANONICAL = "club_management"


def _rewrite_module_list(values):
    if not isinstance(values, list):
        return values, False
    rewritten = []
    changed = False
    for item in values:
        if item == LEGACY:
            rewritten.append(CANONICAL)
            changed = True
        else:
            rewritten.append(item)
    if not changed:
        return values, False
    return sorted(set(rewritten)), True


def absorb_inventory_club(apps, schema_editor):
    InstallEntitlement = apps.get_model("modules", "InstallEntitlement")
    ClubModuleAssignment = apps.get_model("modules", "ClubModuleAssignment")
    ProductCodeRedemption = apps.get_model("modules", "ProductCodeRedemption")

    legacy_ent = InstallEntitlement.objects.filter(module_id=LEGACY).first()
    if legacy_ent is not None:
        existing = InstallEntitlement.objects.filter(module_id=CANONICAL).first()
        if existing is None:
            legacy_ent.module_id = CANONICAL
            legacy_ent.save(update_fields=["module_id"])
        else:
            if legacy_ent.active:
                existing.active = True
            if existing.expires_at is not None and (
                legacy_ent.expires_at is None or legacy_ent.expires_at > existing.expires_at
            ):
                existing.expires_at = legacy_ent.expires_at
            existing.save(update_fields=["active", "expires_at"])
            legacy_ent.delete()

    for row in ClubModuleAssignment.objects.filter(module_id=LEGACY):
        existing = ClubModuleAssignment.objects.filter(club_id=row.club_id, module_id=CANONICAL).first()
        if existing is None:
            row.module_id = CANONICAL
            row.save(update_fields=["module_id"])
            continue
        if row.enabled and not existing.enabled:
            existing.enabled = True
            existing.save(update_fields=["enabled"])
        row.delete()

    for redemption in ProductCodeRedemption.objects.all():
        modules, modules_changed = _rewrite_module_list(redemption.modules)
        payload = dict(redemption.payload or {})
        payload_modules, payload_changed = _rewrite_module_list(payload.get("modules"))
        if not modules_changed and not payload_changed:
            continue
        if modules_changed:
            redemption.modules = modules
        if payload_changed:
            payload["modules"] = payload_modules
            redemption.payload = payload
        redemption.save(update_fields=["modules", "payload"])


class Migration(migrations.Migration):
    dependencies = [
        ("modules", "0001_module_entitlements"),
    ]

    operations = [
        migrations.RunPython(absorb_inventory_club, migrations.RunPython.noop),
    ]
