from django.db import migrations
from django.utils import timezone


def expire_past_active_licenses(apps, schema_editor):
    """Expire active licences whose end date has passed, including staff (no club).

    Uses the historical models from this migration. The live Member model gains
    columns afterwards, and select_related() on that model breaks a brand-new
    database such as the separate demo app.
    """

    License = apps.get_model("licenses", "License")
    History = apps.get_model("licenses", "LicenseHistoryEvent")
    Club = apps.get_model("clubs", "Club")
    today = timezone.localdate()
    now = timezone.now()
    rows = list(License.objects.filter(status="active", end_date__lt=today))
    club_names = {}
    club_ids = {row.club_id for row in rows if row.club_id}
    if club_ids:
        club_names = dict(Club.objects.filter(pk__in=club_ids).values_list("id", "name"))
    for row in rows:
        row.status = "expired"
        row.save(update_fields=["status", "updated_at"])
        History.objects.create(
            member_id=row.member_id,
            license_id=row.pk,
            club_id=row.club_id,
            event_type="expired",
            event_at=now,
            reason="Automatic expiry reconciliation task.",
            metadata={"reconciled_on": today.isoformat()},
            license_year=row.year,
            status_before="active",
            status_after="expired",
            club_name_snapshot=club_names.get(row.club_id, ""),
        )


class Migration(migrations.Migration):

    dependencies = [
        ("licenses", "0049_ltf_staff_without_club"),
    ]

    operations = [
        migrations.RunPython(expire_past_active_licenses, migrations.RunPython.noop),
    ]
