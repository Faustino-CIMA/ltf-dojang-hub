"""Record duty-rule choices and the reminder default on the model.

Neither change rewrites stored rows. The rule column stays varchar(32).
Reminder offsets stay a JSON list; the default is still 60, 30, and 7 days,
applied in Python when a new policy omits the field.
"""

import licenses.models
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("licenses", "0056_duty_exception"),
    ]

    operations = [
        migrations.AlterField(
            model_name="dutyexception",
            name="rule",
            field=models.CharField(
                choices=[
                    ("own_club_override", "Own club override"),
                    ("own_invoice_payment", "Own invoice payment"),
                ],
                max_length=32,
            ),
        ),
        migrations.AlterField(
            model_name="licensetypepolicy",
            name="reminder_offsets",
            field=models.JSONField(default=licenses.models.default_reminder_offsets),
        ),
    ]
