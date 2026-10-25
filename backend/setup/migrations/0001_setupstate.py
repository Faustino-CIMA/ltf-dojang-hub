from django.conf import settings
from django.db import migrations, models
from django.utils import timezone


def mark_existing_installs(apps, schema_editor):
    Club = apps.get_model("clubs", "Club")
    Member = apps.get_model("members", "Member")
    SetupState = apps.get_model("setup", "SetupState")
    has_data = Club.objects.filter(is_demo=False).exists() or Member.objects.filter(is_demo=False).exists()
    if not has_data:
        return
    now = timezone.now()
    SetupState.objects.update_or_create(
        pk=1,
        defaults={
            "current_step": "done",
            "started_at": now,
            "completed_at": now,
            "step_results": {"locked": "existing_data"},
            "ltf_prefix_rewrite": False,
        },
    )


class Migration(migrations.Migration):
    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("clubs", "0014_club_federation_rcs_venues"),
        ("members", "0020_member_is_demo"),
    ]

    operations = [
        migrations.CreateModel(
            name="SetupState",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("started_at", models.DateTimeField(blank=True, null=True)),
                (
                    "current_step",
                    models.CharField(
                        choices=[("clubs", "Clubs"), ("members", "Members"), ("admins", "Admins"), ("done", "Done")],
                        default="clubs",
                        max_length=16,
                    ),
                ),
                ("completed_at", models.DateTimeField(blank=True, null=True)),
                ("step_results", models.JSONField(blank=True, default=dict)),
                ("ltf_prefix_rewrite", models.BooleanField(default=False)),
                (
                    "completed_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=models.deletion.SET_NULL,
                        related_name="setups_completed",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "started_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=models.deletion.SET_NULL,
                        related_name="setups_started",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
        ),
        migrations.RunPython(mark_existing_installs, migrations.RunPython.noop),
    ]
