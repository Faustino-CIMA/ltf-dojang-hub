import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("clubs", "0020_map_country_names_to_codes"),
        ("members", "0030_clubdataimport"),
    ]

    operations = [
        migrations.CreateModel(
            name="ClubDataImportBatch",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("status", models.CharField(choices=[("queued", "Queued"), ("running", "Running"), ("succeeded", "Succeeded"), ("failed", "Failed")], default="queued", max_length=16)),
                ("rows_done", models.PositiveIntegerField(default=0)),
                ("rows_total", models.PositiveIntegerField(default=0)),
                ("counts", models.JSONField(default=dict)),
                ("late_errors", models.JSONField(default=list)),
                ("snapshot", models.JSONField(default=list)),
                ("mapping", models.JSONField(default=dict)),
                ("actions", models.JSONField(default=dict)),
                ("grades_included", models.BooleanField(default=False)),
                ("numbers_included", models.BooleanField(default=False)),
                ("error_detail", models.CharField(blank=True, max_length=240)),
                ("undone_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("finished_at", models.DateTimeField(blank=True, null=True)),
                ("club", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="data_import_batches", to="clubs.club")),
                ("requested_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="data_import_batches", to=settings.AUTH_USER_MODEL)),
                ("upload", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="batches", to="members.clubdataimportupload")),
            ],
            options={"ordering": ["-created_at", "-id"]},
        ),
    ]
