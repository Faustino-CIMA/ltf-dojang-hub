from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("clubs", "0015_federationprofile_rcs_number"),
        ("clubmgmt", "0037_luxembourg_address_register"),
    ]

    operations = [
        migrations.AddField(
            model_name="trainingseries",
            name="venue",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="training_series",
                to="clubs.trainingvenue",
            ),
        ),
    ]
