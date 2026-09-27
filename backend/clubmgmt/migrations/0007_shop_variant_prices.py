from django.db import migrations, models


def copy_item_prices_onto_variants(apps, schema_editor):
    ShopVariant = apps.get_model("clubmgmt", "ShopVariant")
    for row in ShopVariant.objects.select_related("item").iterator():
        changed = False
        if row.sale_price is None:
            row.sale_price = row.item.sale_price
            changed = True
        if row.cost_price is None and row.item.cost_price is not None:
            row.cost_price = row.item.cost_price
            changed = True
        if changed:
            row.save(update_fields=["sale_price", "cost_price"])


class Migration(migrations.Migration):
    dependencies = [
        ("clubmgmt", "0006_shop_inventory"),
    ]

    operations = [
        migrations.AddField(
            model_name="shopvariant",
            name="sale_price",
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=10, null=True),
        ),
        migrations.AddField(
            model_name="shopvariant",
            name="cost_price",
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=10, null=True),
        ),
        migrations.AlterField(
            model_name="shopitem",
            name="sale_price",
            field=models.DecimalField(decimal_places=2, default=0, max_digits=10),
        ),
        migrations.RunPython(copy_item_prices_onto_variants, migrations.RunPython.noop),
    ]
