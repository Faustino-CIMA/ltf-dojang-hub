from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("clubs", "0015_federationprofile_rcs_number"),
    ]

    operations = [
        migrations.AddField(
            model_name="federationprofile",
            name="email",
            field=models.EmailField(blank=True, max_length=254),
        ),
        migrations.AddField(
            model_name="federationprofile",
            name="website",
            field=models.URLField(blank=True, max_length=255),
        ),
    ]
