from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("clubmgmt", "0043_weight_two_decimals"),
    ]

    operations = [
        migrations.AlterField(
            model_name="personaddress",
            name="country",
            field=models.CharField(default="LU", max_length=64),
        ),
        migrations.AlterField(
            model_name="memberaddress",
            name="country",
            field=models.CharField(default="LU", max_length=64),
        ),
    ]
