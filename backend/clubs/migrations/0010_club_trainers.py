import django.db.models
from django.conf import settings
from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("clubs", "0009_club_active_and_language"),
    ]

    operations = [
        migrations.AddField(
            model_name="club",
            name="trainers",
            field=django.db.models.ManyToManyField(
                blank=True,
                related_name="clubs_trained",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
    ]
