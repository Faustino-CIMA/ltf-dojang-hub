import django.db.models
from django.conf import settings
from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("clubs", "0010_club_trainers"),
        ("clubmgmt", "0008_shop_tshirt_category"),
    ]

    operations = [
        migrations.CreateModel(
            name="SubsidySeason",
            fields=[
                ("id", django.db.models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("year", django.db.models.PositiveIntegerField()),
                ("deadline", django.db.models.DateField()),
                ("season_complete", django.db.models.BooleanField(default=False)),
                ("myguichet_users", django.db.models.PositiveSmallIntegerField(default=0)),
                ("rib_attached", django.db.models.BooleanField(default=False)),
                ("non_licensed_count", django.db.models.PositiveIntegerField(default=0)),
                ("status", django.db.models.CharField(choices=[("draft", "Draft"), ("ready", "Ready"), ("submitted", "Submitted"), ("paid", "Paid")], default="draft", max_length=20)),
                ("submitted_on", django.db.models.DateField(blank=True, null=True)),
                ("paid_on", django.db.models.DateField(blank=True, null=True)),
                ("paid_amount", django.db.models.DecimalField(blank=True, decimal_places=2, max_digits=10, null=True)),
                ("updated_at", django.db.models.DateTimeField(auto_now=True)),
                ("club", django.db.models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="subsidy_seasons", to="clubs.club")),
            ],
            options={"ordering": ["-year"], "unique_together": {("club", "year")}},
        ),
        migrations.CreateModel(
            name="CoachQualification",
            fields=[
                ("id", django.db.models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("eqf_level", django.db.models.CharField(blank=True, choices=[("eqf1", "EQF 1"), ("eqf2", "EQF 2"), ("eqf2bis", "EQF 2 bis"), ("eqf3", "EQF 3"), ("eqf4", "EQF 4"), ("eqf5", "EQF 5"), ("eqf6", "EQF 6")], max_length=10)),
                ("coaches_under_16", django.db.models.BooleanField(default=False)),
                ("diploma_status", django.db.models.CharField(choices=[("missing", "Missing"), ("in_progress", "In progress"), ("attached", "Attached")], default="missing", max_length=20)),
                ("updated_at", django.db.models.DateTimeField(auto_now=True)),
                ("club", django.db.models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="coach_qualifications", to="clubs.club")),
                ("user", django.db.models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="coach_qualifications", to=settings.AUTH_USER_MODEL)),
            ],
            options={"unique_together": {("club", "user")}},
        ),
        migrations.CreateModel(
            name="ExtraordinarySubsidy",
            fields=[
                ("id", django.db.models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("kind", django.db.models.CharField(choices=[("cup", "Official international cup"), ("championship", "World or European championship"), ("organisation", "Championship hosted in Luxembourg")], max_length=20)),
                ("title", django.db.models.CharField(max_length=255)),
                ("place", django.db.models.CharField(blank=True, max_length=255)),
                ("starts_on", django.db.models.DateField(blank=True, null=True)),
                ("ends_on", django.db.models.DateField(blank=True, null=True)),
                ("athlete_ids", django.db.models.JSONField(blank=True, default=list)),
                ("official_ids", django.db.models.JSONField(blank=True, default=list)),
                ("travel_mode", django.db.models.CharField(blank=True, max_length=20)),
                ("travel_units", django.db.models.DecimalField(blank=True, decimal_places=2, max_digits=10, null=True)),
                ("travel_rate", django.db.models.DecimalField(blank=True, decimal_places=2, max_digits=10, null=True)),
                ("stay_people", django.db.models.PositiveIntegerField(default=0)),
                ("stay_days", django.db.models.PositiveIntegerField(default=0)),
                ("stay_rate", django.db.models.DecimalField(blank=True, decimal_places=2, max_digits=10, null=True)),
                ("notes", django.db.models.TextField(blank=True)),
                ("status", django.db.models.CharField(choices=[("draft", "Draft"), ("preliminary", "Preliminary request"), ("agreed", "Principle agreement"), ("accounted", "Final account")], default="draft", max_length=20)),
                ("created_at", django.db.models.DateTimeField(auto_now_add=True)),
                ("updated_at", django.db.models.DateTimeField(auto_now=True)),
                ("club", django.db.models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="extraordinary_subsidies", to="clubs.club")),
            ],
            options={"ordering": ["-starts_on", "-id"]},
        ),
    ]
