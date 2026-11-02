"""Fill stripe_session_lookup from session ids already stored on orders.

Idempotent: a row whose lookup already matches is left untouched.
"""

from django.db import migrations

from licenses.stripe_ids import stripe_session_lookup


def backfill_stripe_session_lookup(apps, schema_editor):
    Order = apps.get_model("licenses", "Order")
    for order in Order.objects.exclude(stripe_checkout_session_id="").iterator():
        session_id = order.stripe_checkout_session_id or ""
        lookup = stripe_session_lookup(session_id)
        if not lookup or order.stripe_session_lookup == lookup:
            continue
        order.stripe_session_lookup = lookup
        order.save(update_fields=["stripe_session_lookup"])


class Migration(migrations.Migration):

    dependencies = [
        ("licenses", "0058_order_stripe_session_lookup"),
    ]

    operations = [
        migrations.RunPython(backfill_stripe_session_lookup, migrations.RunPython.noop),
    ]
