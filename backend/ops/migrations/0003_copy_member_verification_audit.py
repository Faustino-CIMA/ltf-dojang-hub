from django.db import migrations

from ops.verification_audit import verification_audit_message, verification_audit_metadata


def copy_verification_events(apps, schema_editor):
    Event = apps.get_model("members", "MemberVerificationEvent")
    Log = apps.get_model("ops", "OpsAuditLog")
    existing = set(
        Log.objects.filter(metadata__verification_event_id__isnull=False).values_list(
            "metadata__verification_event_id",
            flat=True,
        )
    )
    for event in Event.objects.select_related("member", "member__club").iterator():
        if event.id in existing:
            continue
        member = event.member
        club_name = ""
        club_id = None
        if member is not None and member.club_id:
            club_id = member.club_id
            club_name = getattr(member.club, "name", "") or ""
        old = {
            "first_name": event.old_first_name,
            "last_name": event.old_last_name,
            "date_of_birth": event.old_date_of_birth,
            "sex": event.old_sex,
        }
        new = {
            "first_name": event.new_first_name,
            "last_name": event.new_last_name,
            "date_of_birth": event.new_date_of_birth,
            "sex": event.new_sex,
        }
        log = Log.objects.create(
            actor_id=event.actor_id,
            action=f"member_verification.{event.action}",
            target_type="member",
            target_id="" if member is None else str(member.pk),
            message=verification_audit_message(
                action=event.action,
                last_name="" if member is None else member.last_name,
                first_name="" if member is None else member.first_name,
                club_name=club_name,
                reason=event.reason or "",
            ),
            metadata=verification_audit_metadata(
                event_id=event.id,
                fields=event.fields,
                ssn_changed=event.ssn_changed,
                club_id=club_id,
                club_name=club_name,
                old=old,
                new=new,
            ),
        )
        Log.objects.filter(pk=log.pk).update(created_at=event.created_at)


def delete_copied_verification_events(apps, schema_editor):
    Log = apps.get_model("ops", "OpsAuditLog")
    Log.objects.filter(action__startswith="member_verification.").delete()


class Migration(migrations.Migration):

    dependencies = [
        ("ops", "0002_opsaudit_actor_created_idx"),
        ("members", "0028_verification_challenge"),
    ]

    operations = [
        migrations.RunPython(copy_verification_events, delete_copied_verification_events),
    ]
