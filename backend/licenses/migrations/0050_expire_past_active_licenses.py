from django.db import migrations


def expire_past_active_licenses(apps, schema_editor):
    """Expire active licences whose end date has passed, including staff (no club).

    Uses the same reconciliation as the daily Celery task so a licence issued
    for a past year before that rule existed becomes expired on migrate.
    """
    from licenses.history import expire_outdated_licenses

    expire_outdated_licenses(actor=None)


class Migration(migrations.Migration):

    dependencies = [
        ("licenses", "0049_ltf_staff_without_club"),
    ]

    operations = [
        migrations.RunPython(expire_past_active_licenses, migrations.RunPython.noop),
    ]
