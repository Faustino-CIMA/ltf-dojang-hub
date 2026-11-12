"""Close first-login links for people who have already signed in.

The member list treats an open link as 'waiting for first login'. A sign-in
now closes that link. This pass does the same for sign-ins that already
happened. It does not change passwords, emails, or the minor flag.
"""

from django.db import migrations
from django.utils import timezone


def close_open_invites_after_sign_in(apps, schema_editor):
    Invite = apps.get_model("accounts", "AccountSetupInvite")
    Invite.objects.filter(
        used_at__isnull=True,
        revoked_at__isnull=True,
        user__last_login__isnull=False,
    ).update(used_at=timezone.now())


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0014_user_minor_account"),
    ]

    operations = [
        migrations.RunPython(close_open_invites_after_sign_in, migrations.RunPython.noop),
    ]
