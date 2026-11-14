from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("clubs", "0017_federationprofile_country"),
    ]

    operations = [
        migrations.AddField(
            model_name="federationprofile",
            name="license_photo_background_color",
            field=models.CharField(
                default="#D9D9D9",
                help_text="Solid colour behind a member on the license card photo. Light neutral grey.",
                max_length=7,
            ),
        ),
    ]
