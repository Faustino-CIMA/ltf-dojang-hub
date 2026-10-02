from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("clubmgmt", "0018_membership_billings_and_license_fee"),
    ]

    operations = [
        migrations.AddField(
            model_name="familyrebaterule",
            name="applies_to_later",
            field=models.BooleanField(default=False),
        ),
    ]
