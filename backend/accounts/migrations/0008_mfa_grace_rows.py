"""Record the ship date and a 14-day grace for staff who already exist. Safe to run twice."""

from datetime import timedelta

from django.db import migrations
from django.db.models import Q
from django.utils import timezone


def seed_mfa_grace(apps, schema_editor):
    Policy = apps.get_model("accounts", "MfaPolicy")
    Grace = apps.get_model("accounts", "StaffMfaGrace")
    User = apps.get_model("accounts", "User")
    today = timezone.localdate()
    policy = Policy.objects.filter(pk=1).first()
    if policy is None:
        policy = Policy.objects.create(
            pk=1,
            shipped_on=today,
            grace_days=14,
            token_sunset_on=today + timedelta(days=30),
        )
    until = policy.shipped_on + timedelta(days=policy.grace_days or 14)
    staff = User.objects.filter(
        Q(is_superuser=True) | Q(role__in=("ltf_admin", "ltf_finance", "club_admin"))
    )
    for user_id in staff.values_list("id", flat=True).iterator():
        if Grace.objects.filter(user_id=user_id).exists():
            continue
        Grace.objects.create(
            user_id=user_id,
            grace_until=until,
            no_grace=False,
            extended=False,
        )


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0007_mfa_policy"),
    ]

    operations = [
        migrations.RunPython(seed_mfa_grace, migrations.RunPython.noop),
    ]
