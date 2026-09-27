import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("clubmgmt", "0012_training_pay_frequency"),
        ("clubs", "0010_club_trainers"),
        ("members", "0015_capitalize_member_license_roles"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="PromotionRule",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("to_grade", models.CharField(max_length=20)),
                ("required_hours", models.DecimalField(decimal_places=2, max_digits=6)),
                ("audience", models.CharField(blank=True, max_length=20)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("club", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="promotion_rules", to="clubs.club")),
            ],
            options={"ordering": ["to_grade", "id"], "unique_together": {("club", "to_grade")}},
        ),
        migrations.CreateModel(
            name="BeltTest",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=120)),
                ("held_on", models.DateField()),
                ("notes", models.TextField(blank=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("club", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="belt_tests", to="clubs.club")),
            ],
            options={"ordering": ["-held_on", "-id"]},
        ),
        migrations.CreateModel(
            name="BeltTestResult",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("to_grade", models.CharField(max_length=20)),
                ("result", models.CharField(choices=[("passed", "Passed"), ("failed", "Failed")], max_length=20)),
                ("hours", models.DecimalField(decimal_places=2, default=0, max_digits=6)),
                ("recorded_at", models.DateTimeField(auto_now=True)),
                (
                    "belt_test",
                    models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="results", to="clubmgmt.belttest"),
                ),
                (
                    "member",
                    models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="belt_test_results", to="members.member"),
                ),
                (
                    "recorded_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="belt_test_results_recorded",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={"unique_together": {("belt_test", "member")}},
        ),
    ]
