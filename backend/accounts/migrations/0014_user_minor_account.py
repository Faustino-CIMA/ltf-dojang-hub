from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0013_resync_office_grants"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="minor_account",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="user",
            name="guardian_notice_email",
            field=models.EmailField(blank=True, max_length=254),
        ),
    ]
