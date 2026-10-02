from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("licenses", "0045_invoice_bill_to_snapshot"),
    ]

    operations = [
        migrations.AddField(
            model_name="orderitem",
            name="billing_installment",
            field=models.PositiveSmallIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="orderitem",
            name="is_license_fee",
            field=models.BooleanField(default=False),
        ),
    ]
