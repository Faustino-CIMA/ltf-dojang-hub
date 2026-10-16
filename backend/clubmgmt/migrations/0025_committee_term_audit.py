import django.db.models.deletion
import django.utils.timezone
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    """Record who last saved a committee term.

    Existing mandates are not rewritten. A row with no end date stays the
    open current term, so nobody is taken off the current board.

    End dates are exclusive from this release: a term is active while
    start <= day < end. No migration or demo seed sets an end date, so
    that rule does not move anyone who is on the board today. A stored
    end date equal to today would now mean the person has already left;
    nothing in this repository stores such a date.
    """

    dependencies = [
        ("clubmgmt", "0024_alter_membershipfee_options"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name="committeemandate",
            name="recorded_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="recorded_committee_mandates",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name="committeemandate",
            name="updated_at",
            field=models.DateTimeField(auto_now=True, default=django.utils.timezone.now),
            preserve_default=False,
        ),
    ]
