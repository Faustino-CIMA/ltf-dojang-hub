"""Open a photo notice for pictures that are already waiting.

Schema lives in the previous migration. This pass only adds rows.
It does not change the photos.
"""

from django.db import migrations
from django.utils import timezone


def open_notices(apps, schema_editor):
    Member = apps.get_model("members", "Member")
    Notice = apps.get_model("members", "AdminNotice")
    waiting = Member.objects.exclude(profile_picture_pending_processed="").exclude(
        profile_picture_pending_processed__isnull=True
    )
    now = timezone.now()
    for member in waiting.iterator():
        exists = Notice.objects.filter(member_id=member.id, kind="picture_review", resolved_at__isnull=True).exists()
        if exists:
            continue
        Notice.objects.create(
            kind="picture_review",
            club_id=member.club_id,
            member_id=member.id,
            opened_at=now,
        )


class Migration(migrations.Migration):
    dependencies = [
        ("members", "0024_admin_notice"),
    ]

    operations = [
        migrations.RunPython(open_notices, migrations.RunPython.noop),
    ]
