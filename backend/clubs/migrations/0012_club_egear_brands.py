from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("clubs", "0011_club_website"),
    ]

    operations = [
        migrations.AddField(
            model_name="club",
            name="egear_daedo",
            field=models.BooleanField(default=True),
        ),
        migrations.AddField(
            model_name="club",
            name="egear_kpnp",
            field=models.BooleanField(default=True),
        ),
    ]
