"""Fill office desks for open federation terms that already have a login.

A term can exist before the holder's login is linked. Linking that login now
resyncs the desks, and this pass repairs terms that were linked earlier.

Safe to run twice: a grant that already matches the office map is left as it
is, and an ended row for the same term, desk, and level is reopened instead of
inserting another. Only desks already on the office map are granted. Parked
imports are skipped. A data migration runs on deploy, so nobody has to remember
a separate command.
"""

from django.db import migrations
from django.db.models import Q
from django.utils import timezone


def resync_open_office_grants(apps, schema_editor):
    Mandate = apps.get_model("clubmgmt", "CommitteeMandate")
    Member = apps.get_model("members", "Member")
    Person = apps.get_model("clubmgmt", "Person")
    Map = apps.get_model("accounts", "OfficeDeskMap")
    Grant = apps.get_model("accounts", "DeskGrant")
    Audit = apps.get_model("ops", "OpsAuditLog")
    today = timezone.localdate()
    mapped: dict[str, list[tuple[str, str]]] = {}
    for row in Map.objects.all():
        mapped.setdefault(row.office, []).append((row.desk, row.level))
    if not mapped:
        return

    open_terms = Mandate.objects.filter(committee__scope="federation", started_on__lte=today).filter(
        Q(ended_on__isnull=True) | Q(ended_on__gt=today)
    )
    for mandate in open_terms.iterator():
        user_id = _holder_user_id(mandate, Member, Person)
        if not user_id:
            continue
        for desk, level in mapped.get(mandate.role, []):
            grant = Grant.objects.filter(
                source="office",
                mandate_id=mandate.id,
                desk=desk,
                level=level,
            ).first()
            if grant is None:
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
                _audit(Audit, grant, "desk.grant_created", "Office desk grant.", user_id)
                continue
            if (
                grant.user_id == user_id
                and grant.valid_from == mandate.started_on
                and grant.valid_until == mandate.ended_on
            ):
                continue
            before_user_id = grant.user_id
            grant.user_id = user_id
            grant.valid_from = mandate.started_on
            grant.valid_until = mandate.ended_on
            grant.save(update_fields=["user", "valid_from", "valid_until"])
            _audit(
                Audit,
                grant,
                "desk.grant_updated",
                "Office desk grant updated.",
                user_id,
                before_user_id=before_user_id,
            )


def _holder_user_id(mandate, Member, Person):
    if mandate.member_id:
        manager = getattr(Member, "all_objects", Member.objects)
        row = manager.filter(pk=mandate.member_id).values_list("user_id", "import_status").first()
        if not row or row[1] == "parked":
            return None
        return row[0]
    if mandate.person_id:
        return Person.objects.filter(pk=mandate.person_id).values_list("user_id", flat=True).first()
    return None


def _audit(Audit, grant, action, message, user_id, before_user_id=None):
    metadata = {
        "user_id": user_id,
        "desk": grant.desk,
        "level": grant.level,
        "source": "office",
        "mandate_id": grant.mandate_id,
    }
    if before_user_id is not None:
        metadata["before_user_id"] = before_user_id
    Audit.objects.create(
        actor_id=None,
        action=action,
        target_type="desk_grant",
        target_id=str(grant.pk),
        message=message,
        metadata=metadata,
    )


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0012_officedeskmap_choices"),
    ]

    operations = [
        migrations.RunPython(resync_open_office_grants, migrations.RunPython.noop),
    ]
