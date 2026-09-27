from django.db import migrations, models
import django.db.models.deletion


def backfill_active_charges(apps, schema_editor):
    OrderItem = apps.get_model("licenses", "OrderItem")
    Invoice = apps.get_model("licenses", "Invoice")
    invoices = {row.order_id: row.status for row in Invoice.objects.all().only("order_id", "status")}
    seen = set()
    items = (
        OrderItem.objects.filter(fee_type_id__isnull=False)
        .select_related("order")
        .order_by("-id")
    )
    for item in items:
        order = item.order
        year = item.billing_year
        if year is None:
            created = getattr(order, "created_at", None)
            year = created.year if created is not None else None
        month = item.billing_month
        if year and month:
            period_key = f"{year}-{int(month):02d}"
        elif year:
            period_key = str(year)
        else:
            period_key = ""
        status = invoices.get(order.id)
        key = (order.club_id, item.fee_type_id, period_key)
        active = bool(period_key) and status in ("issued", "paid")
        if active:
            if key in seen:
                active = False
            else:
                seen.add(key)
        item.billing_club_id = order.club_id
        item.period_key = period_key
        if year is not None:
            item.billing_year = year
        item.charge_active = active
        item.save(
            update_fields=["billing_club", "period_key", "billing_year", "charge_active"]
        )


class Migration(migrations.Migration):

    dependencies = [
        ("clubs", "0009_club_active_and_language"),
        ("licenses", "0037_orderitem_billing_period"),
    ]

    operations = [
        migrations.AddField(
            model_name="orderitem",
            name="billing_club",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="fee_order_items",
                to="clubs.club",
            ),
        ),
        migrations.AddField(
            model_name="orderitem",
            name="period_key",
            field=models.CharField(blank=True, default="", max_length=7),
        ),
        migrations.AddField(
            model_name="orderitem",
            name="charge_active",
            field=models.BooleanField(default=False),
        ),
        migrations.RunPython(backfill_active_charges, migrations.RunPython.noop),
        migrations.AddConstraint(
            model_name="orderitem",
            constraint=models.UniqueConstraint(
                condition=models.Q(charge_active=True),
                fields=("billing_club", "fee_type", "period_key"),
                name="uniq_active_club_fee_period",
            ),
        ),
    ]
