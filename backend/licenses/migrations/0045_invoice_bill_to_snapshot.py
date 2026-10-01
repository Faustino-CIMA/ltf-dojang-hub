from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("licenses", "0044_invoice_delivery_and_billing"),
    ]

    operations = [
        migrations.AddField(
            model_name="invoice",
            name="bill_to_address",
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name="invoice",
            name="bill_to_email",
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name="invoice",
            name="bill_to_name",
            field=models.CharField(blank=True, max_length=300),
        ),
    ]
