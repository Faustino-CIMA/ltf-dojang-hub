from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("clubs", "0010_club_trainers"),
    ]

    operations = [
        migrations.AddField(
            model_name="club",
            name="website",
            field=models.URLField(blank=True, max_length=255),
        ),
    ]
