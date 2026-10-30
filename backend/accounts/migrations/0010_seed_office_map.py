"""Seed the office map and grants for federation terms that already have a login.

Safe to run twice: missing map rows are inserted, existing rows are left as the
superuser set them, and a second pass does not add another grant for the same
term, desk, and level.
"""

from django.db import migrations


DEFAULTS = (
    ("president", "ltf_admin", "full"),
    ("president", "ltf_finance", "read_only"),
    ("treasurer", "ltf_finance", "full"),
    ("treasurer", "ltf_admin", "read_only"),
)


def seed_office_map(apps, schema_editor):
    Map = apps.get_model("accounts", "OfficeDeskMap")
    Grant = apps.get_model("accounts", "DeskGrant")
    Audit = apps.get_model("ops", "OpsAuditLog")
    Mandate = apps.get_model("clubmgmt", "CommitteeMandate")
    Member = apps.get_model("members", "Member")
    Person = apps.get_model("clubmgmt", "Person")

    for office, desk, level in DEFAULTS:
        Map.objects.get_or_create(office=office, desk=desk, defaults={"level": level})

    mapped = {}
    for row in Map.objects.all():
        mapped.setdefault(row.office, []).append((row.desk, row.level))

    mandates = Mandate.objects.filter(committee__scope="federation").iterator()
    for mandate in mandates:
        user_id = None
        if mandate.member_id:
            user_id = Member.objects.filter(pk=mandate.member_id).values_list("user_id", flat=True).first()
        elif mandate.person_id:
            user_id = Person.objects.filter(pk=mandate.person_id).values_list("user_id", flat=True).first()
        if not user_id:
            continue
        for desk, level in mapped.get(mandate.role, []):
            exists = Grant.objects.filter(
                source="office",
                mandate_id=mandate.id,
                desk=desk,
                level=level,
            ).exists()
            if exists:
                continue
            grant = Grant.objects.create(
                user_id=user_id,
                desk=desk,
                level=level,
                source="office",
                club_id=None,
                valid_from=mandate.started_on,
                valid_until=mandate.ended_on,
                mandate_id=mandate.id,
                reason="Office",
            )
            Audit.objects.create(
                actor_id=None,
                action="desk.grant_created",
                target_type="desk_grant",
                target_id=str(grant.pk),
                message="Office desk grant.",
                metadata={
                    "user_id": user_id,
                    "desk": desk,
                    "level": level,
                    "source": "office",
                    "mandate_id": mandate.id,
                },
            )


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0009_office_desk_map"),
        ("clubmgmt", "0040_person_user"),
        ("ops", "0001_ops_console"),
        ("members", "0022_alter_member_managers"),
    ]

    operations = [
        migrations.RunPython(seed_office_map, migrations.RunPython.noop),
    ]
