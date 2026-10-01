import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ("clubs", "0009_club_active_and_language"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="Event",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("title", models.CharField(max_length=200)),
                ("description", models.TextField(blank=True)),
                (
                    "kind",
                    models.CharField(
                        choices=[
                            ("calendar", "Calendar"),
                            ("kyorugi", "Kyorugi"),
                            ("poomsae", "Poomsae"),
                        ],
                        default="calendar",
                        max_length=16,
                    ),
                ),
                (
                    "owner_scope",
                    models.CharField(
                        choices=[("federation", "Federation"), ("club", "Club")],
                        max_length=16,
                    ),
                ),
                ("venue_name", models.CharField(blank=True, max_length=200)),
                ("venue_address", models.CharField(blank=True, max_length=255)),
                ("starts_at", models.DateTimeField()),
                ("ends_at", models.DateTimeField()),
                ("all_day", models.BooleanField(default=False)),
                (
                    "visibility",
                    models.CharField(
                        choices=[
                            ("public", "Public"),
                            ("internal", "Internal"),
                            ("private", "Private"),
                        ],
                        default="public",
                        max_length=16,
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "club",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="events",
                        to="clubs.club",
                    ),
                ),
                (
                    "created_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="events_created",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ["starts_at", "id"],
            },
        ),
        migrations.AddIndex(
            model_name="event",
            index=models.Index(fields=["owner_scope", "starts_at"], name="evt_scope_start_idx"),
        ),
        migrations.AddIndex(
            model_name="event",
            index=models.Index(fields=["club", "starts_at"], name="evt_club_start_idx"),
        ),
        migrations.AddIndex(
            model_name="event",
            index=models.Index(fields=["kind", "starts_at"], name="evt_kind_start_idx"),
        ),
    ]
