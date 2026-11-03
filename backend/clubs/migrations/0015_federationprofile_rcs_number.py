from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("clubs", "0014_club_federation_rcs_venues"),
    ]

    operations = [
        migrations.AddField(
            model_name="federationprofile",
            name="rcs_number",
            field=models.CharField(blank=True, max_length=20),
        ),
    ]
