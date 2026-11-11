"""Add an optional maximum on a module price and a mark on the billed line.

Existing prices have no maximum. Existing invoice lines were not capped.
"""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("licenses", "0060_license_type_archived_at"),
    ]

    operations = [
        migrations.AddField(
            model_name="clubfeeprice",
            name="maximum_amount",
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=10, null=True),
        ),
        migrations.AddField(
            model_name="orderitem",
            name="maximum_applied",
            field=models.BooleanField(default=False),
        ),
    ]
