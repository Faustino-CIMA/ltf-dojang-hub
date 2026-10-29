from django.db import migrations, models


def default_reminder_offsets():
    return [60, 30, 7]


def lock_existing_licences(apps, schema_editor):
    """Mark licences already on file so a later type edit cannot move their dates."""
    License = apps.get_model("licenses", "License")
    License.objects.update(expiry_locked=True)


class Migration(migrations.Migration):

    dependencies = [
        ("licenses", "0050_expire_past_active_licenses"),
    ]

    operations = [
        migrations.AddField(
            model_name="licensetypepolicy",
            name="validity_mode",
            field=models.CharField(
                choices=[("calendar_year", "Calendar year"), ("duration", "Duration")],
                default="calendar_year",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="licensetypepolicy",
            name="duration_years",
            field=models.PositiveSmallIntegerField(default=0),
        ),
        migrations.AddField(
            model_name="licensetypepolicy",
            name="duration_days",
            field=models.PositiveSmallIntegerField(default=0),
        ),
        migrations.AddField(
            model_name="licensetypepolicy",
            name="reminders_enabled",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="licensetypepolicy",
            name="reminder_offsets",
            field=models.JSONField(default=default_reminder_offsets),
        ),
        migrations.AddField(
            model_name="license",
            name="expiry_locked",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="historicallicense",
            name="expiry_locked",
            field=models.BooleanField(default=False),
        ),
        migrations.RunPython(lock_existing_licences, migrations.RunPython.noop),
    ]
