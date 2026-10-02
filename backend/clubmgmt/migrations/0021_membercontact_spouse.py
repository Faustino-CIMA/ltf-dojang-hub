from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("clubmgmt", "0020_member_pays_license_fee"),
    ]

    operations = [
        migrations.AlterField(
            model_name="membercontact",
            name="relation",
            field=models.CharField(
                choices=[
                    ("father", "Father"),
                    ("mother", "Mother"),
                    ("grandfather", "Grandfather"),
                    ("grandmother", "Grandmother"),
                    ("uncle", "Uncle"),
                    ("aunt", "Aunt"),
                    ("brother", "Brother"),
                    ("sister", "Sister"),
                    ("guardian", "Guardian"),
                    ("partner", "Partner"),
                    ("spouse", "Spouse"),
                    ("other", "Other"),
                ],
                max_length=20,
            ),
        ),
    ]
