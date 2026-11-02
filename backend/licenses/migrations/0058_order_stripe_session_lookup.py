"""Add a searchable HMAC for the encrypted Stripe checkout session id.

The column starts empty. Stored session ids are filled by the next migration.
"""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("licenses", "0057_duty_rule_choices_and_reminder_default"),
    ]

    operations = [
        migrations.AddField(
            model_name="order",
            name="stripe_session_lookup",
            field=models.CharField(blank=True, db_index=True, default="", max_length=64),
        ),
    ]
