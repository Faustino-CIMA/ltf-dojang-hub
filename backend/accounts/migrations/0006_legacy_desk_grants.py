"""Backfill one full legacy grant per current role. Safe to run twice."""

from django.db import migrations
from django.utils import timezone


def _grant(grant_model, audit_model, user_id, desk, club_id, today):
    existing = grant_model.objects.filter(
        user_id=user_id,
        desk=desk,
        club_id=club_id,
        level="full",
        source="legacy",
    ).first()
    if existing is not None:
        return
    grant = grant_model.objects.create(
        user_id=user_id,
        desk=desk,
        club_id=club_id,
        level="full",
        source="legacy",
        valid_from=today,
        reason="",
    )
    audit_model.objects.create(
        actor_id=None,
        action="desk.grant_created",
        target_type="desk_grant",
        target_id=str(grant.pk),
        message="Legacy desk grant.",
        metadata={
            "user_id": user_id,
            "desk": desk,
            "level": "full",
            "source": "legacy",
            "club_id": club_id,
        },
    )


def create_legacy_grants(apps, schema_editor):
    User = apps.get_model("accounts", "User")
    Club = apps.get_model("clubs", "Club")
    Member = apps.get_model("members", "Member")
    DeskGrant = apps.get_model("accounts", "DeskGrant")
    OpsAuditLog = apps.get_model("ops", "OpsAuditLog")
    today = timezone.localdate()
    for user in User.objects.all().iterator():
        role = user.role or ""
        if role == "club_admin":
            club_ids = list(Club.objects.filter(admins=user).values_list("id", flat=True))
            if club_ids:
                for club_id in club_ids:
                    _grant(DeskGrant, OpsAuditLog, user.id, "club_admin", club_id, today)
            else:
                _grant(DeskGrant, OpsAuditLog, user.id, "club_admin", None, today)
        elif role == "coach":
            club_ids = list(Club.objects.filter(trainers=user).values_list("id", flat=True))
            if not club_ids:
                club_id = Member.objects.filter(user_id=user.id).values_list("club_id", flat=True).first()
                if club_id:
                    club_ids = [club_id]
            if club_ids:
                for club_id in club_ids:
                    _grant(DeskGrant, OpsAuditLog, user.id, "coach", club_id, today)
            else:
                _grant(DeskGrant, OpsAuditLog, user.id, "coach", None, today)
        elif role in {"ltf_admin", "ltf_finance", "member"}:
            _grant(DeskGrant, OpsAuditLog, user.id, role, None, today)


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0005_desk_grants"),
        ("clubs", "0015_federationprofile_rcs_number"),
        ("members", "0022_alter_member_managers"),
        ("ops", "0001_ops_console"),
    ]

    operations = [
        migrations.RunPython(create_legacy_grants, migrations.RunPython.noop),
    ]
