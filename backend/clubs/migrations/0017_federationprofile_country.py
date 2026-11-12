from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("clubs", "0016_federationprofile_email_website"),
    ]

    operations = [
        migrations.AddField(
            model_name="federationprofile",
            name="country",
            field=models.CharField(blank=True, max_length=64),
        ),
    ]
