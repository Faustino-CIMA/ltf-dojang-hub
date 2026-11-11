"""Add an archive mark on license types.

Existing rows stay available: archived_at is empty until someone removes a type
that licenses or prices still use.
"""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("licenses", "0059_backfill_stripe_session_lookup"),
    ]

    operations = [
        migrations.AddField(
            model_name="licensetype",
            name="archived_at",
            field=models.DateTimeField(blank=True, db_index=True, null=True),
        ),
    ]
