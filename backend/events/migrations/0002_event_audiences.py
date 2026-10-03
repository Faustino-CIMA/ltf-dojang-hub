from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("clubs", "0011_club_website"),
        ("events", "0001_event_engine"),
    ]

    operations = [
        migrations.AddField(
            model_name="event",
            name="audience_clubs",
            field=models.ManyToManyField(blank=True, related_name="president_events", to="clubs.club"),
        ),
        migrations.AlterField(
            model_name="event",
            name="visibility",
            field=models.CharField(
                choices=[
                    ("public", "Public"),
                    ("internal", "Internal"),
                    ("private", "Private"),
                    ("shared", "All clubs and the LTF"),
                    ("presidents", "Club presidents"),
                ],
                default="public",
                max_length=16,
            ),
        ),
    ]
