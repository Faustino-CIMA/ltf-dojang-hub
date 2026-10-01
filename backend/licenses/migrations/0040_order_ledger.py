from django.db import migrations, models
from django.db.models import Q


def backfill_club_ledger(apps, schema_editor):
    Order = apps.get_model("licenses", "Order")
    OrderItem = apps.get_model("licenses", "OrderItem")
    federation_ids = set(
        OrderItem.objects.filter(Q(license_id__isnull=False) | Q(fee_type_id__isnull=False)).values_list(
            "order_id", flat=True
        )
    )
    club_ids = (
        Order.objects.exclude(id__in=federation_ids)
        .filter(items__isnull=False)
        .values_list("id", flat=True)
        .distinct()
    )
    Order.objects.filter(id__in=list(club_ids)).update(ledger="club")


def noop_reverse(apps, schema_editor):
    return None


class Migration(migrations.Migration):
    dependencies = [
        ("licenses", "0039_cancel_stale_pending_payments"),
    ]

    operations = [
        migrations.AddField(
            model_name="order",
            name="ledger",
            field=models.CharField(
                choices=[("federation", "Federation"), ("club", "Club")],
                db_index=True,
                default="federation",
                max_length=20,
            ),
        ),
        migrations.AddIndex(
            model_name="order",
            index=models.Index(fields=["ledger", "-created_at"], name="ord_ledger_created_idx"),
        ),
        migrations.RunPython(backfill_club_ledger, noop_reverse),
    ]
