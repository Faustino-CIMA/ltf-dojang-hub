from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("clubs", "0012_club_egear_brands"),
    ]

    operations = [
        migrations.AddField(
            model_name="club",
            name="is_demo",
            field=models.BooleanField(
                default=False,
                help_text="Marks a fictional club created for the separate demo app.",
            ),
        ),
    ]
