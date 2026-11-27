from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion

import clubmgmt.onboarding_models


class Migration(migrations.Migration):
    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("clubs", "0020_map_country_names_to_codes"),
        ("clubmgmt", "0045_map_country_and_nationality_codes"),
    ]

    operations = [
        migrations.CreateModel(
            name="ClubOnboardingSettings",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("public_link_enabled", models.BooleanField(default=False)),
                ("invites_enabled", models.BooleanField(default=False)),
                ("equipment_note", models.TextField(blank=True)),
                (
                    "photo_requirement",
                    models.CharField(
                        choices=[("hidden", "Hidden"), ("optional", "Optional"), ("required", "Required")],
                        default="optional",
                        max_length=16,
                    ),
                ),
                (
                    "medico_requirement",
                    models.CharField(
                        choices=[("hidden", "Hidden"), ("optional", "Optional"), ("required", "Required")],
                        default="optional",
                        max_length=16,
                    ),
                ),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "club",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="onboarding_settings",
                        to="clubs.club",
                    ),
                ),
            ],
        ),
        migrations.CreateModel(
            name="ClubRulesVersion",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("version", models.PositiveIntegerField()),
                ("effective_on", models.DateField()),
                ("file", models.FileField(blank=True, upload_to=clubmgmt.onboarding_models.rules_upload_to)),
                ("url", models.URLField(blank=True, max_length=500)),
                ("sha256", models.CharField(max_length=64)),
                ("is_current", models.BooleanField(default=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "club",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="rules_versions",
                        to="clubs.club",
                    ),
                ),
                (
                    "created_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="club_rules_versions",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ["-version", "-id"],
            },
        ),
        migrations.AddConstraint(
            model_name="clubrulesversion",
            constraint=models.UniqueConstraint(fields=("club", "version"), name="clubmgmt_rules_version_uniq"),
        ),
        migrations.AddConstraint(
            model_name="clubrulesversion",
            constraint=models.UniqueConstraint(
                condition=models.Q(is_current=True),
                fields=("club",),
                name="clubmgmt_one_current_rules",
            ),
        ),
    ]
