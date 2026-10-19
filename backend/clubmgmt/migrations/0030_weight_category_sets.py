from django.db import migrations, models
import django.db.models.deletion


def seed_category_sets(apps, schema_editor):
    from clubmgmt.category_sets import seed_presets

    seed_presets(apps.get_model("clubmgmt", "WeightCategorySet"), apps.get_model("clubmgmt", "WeightCategoryBand"))


def unseed_category_sets(apps, schema_editor):
    apps.get_model("clubmgmt", "WeightCategorySet").objects.filter(
        code__in=["wt", "be", "nl", "de", "fr", "at"]
    ).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("clubmgmt", "0029_team_membership_role"),
    ]

    operations = [
        migrations.CreateModel(
            name="WeightCategorySet",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("code", models.CharField(max_length=20, unique=True)),
                ("source_note", models.CharField(max_length=280)),
                (
                    "age_basis",
                    models.CharField(
                        choices=[("birth_year", "Birth year"), ("competition_day", "Competition day")],
                        default="birth_year",
                        max_length=20,
                    ),
                ),
                ("position", models.PositiveSmallIntegerField(default=0)),
            ],
            options={"ordering": ["position", "id"]},
        ),
        migrations.CreateModel(
            name="WeightCategoryBand",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("code", models.CharField(max_length=40)),
                ("age_min", models.PositiveSmallIntegerField()),
                ("age_max", models.PositiveSmallIntegerField()),
                ("sex", models.CharField(max_length=1)),
                ("ceilings", models.JSONField()),
                ("position", models.PositiveSmallIntegerField(default=0)),
                (
                    "category_set",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="bands",
                        to="clubmgmt.weightcategoryset",
                    ),
                ),
            ],
            options={"ordering": ["position", "id"]},
        ),
        migrations.AddField(
            model_name="clubteam",
            name="category_set_code",
            field=models.CharField(default="wt", max_length=20),
        ),
        migrations.CreateModel(
            name="ClubTeamCategoryBand",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("label", models.CharField(blank=True, max_length=80)),
                ("age_min", models.PositiveSmallIntegerField()),
                ("age_max", models.PositiveSmallIntegerField()),
                ("sex", models.CharField(max_length=1)),
                ("ceilings", models.JSONField()),
                ("position", models.PositiveSmallIntegerField(default=0)),
                (
                    "team",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="custom_bands",
                        to="clubmgmt.clubteam",
                    ),
                ),
            ],
            options={"ordering": ["position", "id"]},
        ),
        migrations.RunPython(seed_category_sets, unseed_category_sets),
    ]
