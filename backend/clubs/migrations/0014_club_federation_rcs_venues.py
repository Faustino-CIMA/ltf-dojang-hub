import re

from django.conf import settings
from django.db import migrations, models


def mark_itf_clubs(apps, schema_editor):
    Club = apps.get_model("clubs", "Club")
    pattern = re.compile(r"taekwon[\s\-–—]+do", re.IGNORECASE)
    for club in Club.objects.all().iterator():
        if pattern.search(club.name or ""):
            club.federation = "ITF"
            club.save(update_fields=["federation"])


class Migration(migrations.Migration):
    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("clubs", "0013_club_is_demo"),
    ]

    operations = [
        migrations.AddField(
            model_name="club",
            name="federation",
            field=models.CharField(
                choices=[("WT", "WT"), ("ITF", "ITF")],
                default="WT",
                max_length=3,
            ),
        ),
        migrations.AddField(
            model_name="club",
            name="rcs_number",
            field=models.CharField(blank=True, max_length=20),
        ),
        migrations.AddField(
            model_name="club",
            name="external_ref",
            field=models.CharField(blank=True, db_index=True, max_length=255),
        ),
        migrations.AddConstraint(
            model_name="club",
            constraint=models.UniqueConstraint(
                condition=models.Q(("rcs_number", ""), _negated=True),
                fields=("rcs_number",),
                name="unique_club_rcs_number_when_set",
            ),
        ),
        migrations.CreateModel(
            name="TrainingVenue",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=255)),
                ("street", models.CharField(blank=True, max_length=255)),
                ("house_number", models.CharField(blank=True, max_length=20)),
                ("line2", models.CharField(blank=True, max_length=255)),
                ("postal_code", models.CharField(blank=True, max_length=10)),
                ("locality", models.CharField(blank=True, max_length=255)),
                ("country", models.CharField(default="Luxembourg", max_length=64)),
                ("notes", models.TextField(blank=True)),
                ("is_active", models.BooleanField(default=True)),
                ("sort_order", models.PositiveIntegerField(default=0)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "club",
                    models.ForeignKey(
                        on_delete=models.deletion.CASCADE,
                        related_name="training_venues",
                        to="clubs.club",
                    ),
                ),
            ],
            options={
                "ordering": ["sort_order", "name", "id"],
            },
        ),
        migrations.RunPython(mark_itf_clubs, migrations.RunPython.noop),
    ]
