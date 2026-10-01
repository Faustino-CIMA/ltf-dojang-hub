from django.db import migrations, models


def backfill_billing_year(apps, schema_editor):
    OrderItem = apps.get_model("licenses", "OrderItem")
    for item in OrderItem.objects.filter(fee_type_id__isnull=False, billing_year__isnull=True).select_related(
        "order"
    ):
        created = getattr(item.order, "created_at", None)
        if created is not None:
            item.billing_year = created.year
            item.save(update_fields=["billing_year"])


class Migration(migrations.Migration):

    dependencies = [
        ("licenses", "0036_club_fee_type_year"),
    ]

    operations = [
        migrations.AddField(
            model_name="orderitem",
            name="billing_year",
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="orderitem",
            name="billing_month",
            field=models.PositiveSmallIntegerField(blank=True, null=True),
        ),
        migrations.RunPython(backfill_billing_year, migrations.RunPython.noop),
    ]
