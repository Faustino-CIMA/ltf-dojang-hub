from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("clubmgmt", "0028_team_competition_and_groups"),
    ]

    operations = [
        migrations.AddField(
            model_name="clubteammembership",
            name="role",
            field=models.CharField(
                choices=[("athlete", "Athlete"), ("coach", "Coach")],
                default="athlete",
                max_length=10,
            ),
        ),
    ]
