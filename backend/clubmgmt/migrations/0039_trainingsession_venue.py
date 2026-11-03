from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("clubs", "0015_federationprofile_rcs_number"),
        ("clubmgmt", "0038_trainingseries_venue"),
    ]

    operations = [
        migrations.AddField(
            model_name="trainingsession",
            name="place",
            field=models.CharField(blank=True, max_length=120),
        ),
        migrations.AddField(
            model_name="trainingsession",
            name="venue",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="training_sessions",
                to="clubs.trainingvenue",
            ),
        ),
    ]
