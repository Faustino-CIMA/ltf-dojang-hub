from decimal import Decimal

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("clubmgmt", "0042_existing_ssn_is_luxembourg"),
    ]

    operations = [
        migrations.AlterField(
            model_name="bodymeasurement",
            name="weight_kg",
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=5, null=True),
        ),
        migrations.AlterField(
            model_name="clubteam",
            name="weight_margin_kg",
            field=models.DecimalField(decimal_places=2, default=Decimal("1.00"), max_digits=4),
        ),
    ]
