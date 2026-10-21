from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("clubmgmt", "0034_team_pss_system"),
    ]

    operations = [
        migrations.AddField(
            model_name="membergear",
            name="club_tshirt",
            field=models.CharField(blank=True, max_length=8),
        ),
    ]
