from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("clubs", "0018_federationprofile_license_photo_background_color"),
    ]

    operations = [
        migrations.AlterField(
            model_name="trainingvenue",
            name="country",
            field=models.CharField(default="LU", max_length=64),
        ),
    ]
