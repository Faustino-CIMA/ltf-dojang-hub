from django.db import migrations
from django.db.models import Q


def cancel_stale_pending_payments(apps, schema_editor):
    Payment = apps.get_model("licenses", "Payment")
    Payment.objects.filter(status="pending").filter(
        Q(invoice__status__in=["paid", "void"])
        | Q(order__status__in=["paid", "cancelled", "refunded"])
    ).update(status="cancelled")


class Migration(migrations.Migration):

    dependencies = [
        ("licenses", "0038_orderitem_active_club_fee_period"),
    ]

    operations = [
        migrations.RunPython(cancel_stale_pending_payments, migrations.RunPython.noop),
    ]
