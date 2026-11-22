import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("clubs", "0020_map_country_names_to_codes"),
        ("members", "0028_verification_challenge"),
    ]

    operations = [
        migrations.CreateModel(
            name="ClubDataExportJob",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("status", models.CharField(choices=[("queued", "Queued"), ("running", "Running"), ("succeeded", "Succeeded"), ("failed", "Failed")], default="queued", max_length=16)),
                ("progress", models.PositiveSmallIntegerField(default=0)),
                ("file_format", models.CharField(max_length=8)),
                ("locale", models.CharField(default="en", max_length=8)),
                ("sheets", models.JSONField(default=list)),
                ("artifact", models.FileField(blank=True, upload_to="club-data-exports/%Y/%m/")),
                ("error_detail", models.CharField(blank=True, max_length=240)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("finished_at", models.DateTimeField(blank=True, null=True)),
                ("club", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="data_export_jobs", to="clubs.club")),
                ("requested_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="data_export_jobs", to=settings.AUTH_USER_MODEL)),
            ],
            options={"ordering": ["-created_at", "-id"]},
        ),
    ]
