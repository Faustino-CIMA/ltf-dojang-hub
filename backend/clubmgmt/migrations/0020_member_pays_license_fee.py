from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("clubmgmt", "0019_family_rebate_applies_to_later"),
    ]

    operations = [
        migrations.AddField(
            model_name="memberrecord",
            name="pays_license_fee",
            field=models.BooleanField(default=True),
        ),
    ]
