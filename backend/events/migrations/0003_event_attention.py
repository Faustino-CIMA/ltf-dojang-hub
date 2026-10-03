import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("events", "0002_event_audiences"),
    ]

    operations = [
        migrations.CreateModel(
            name="EventAttention",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("seen_at", models.DateTimeField(blank=True, null=True)),
                ("remind_on", models.DateField(blank=True, null=True)),
                ("snoozed_until", models.DateTimeField(blank=True, null=True)),
                ("dismissed_at", models.DateTimeField(blank=True, null=True)),
                (
                    "event",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="attentions",
                        to="events.event",
                    ),
                ),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="event_attentions",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "constraints": [
                    models.UniqueConstraint(fields=("user", "event"), name="evt_attention_user_event"),
                ],
            },
        ),
    ]
