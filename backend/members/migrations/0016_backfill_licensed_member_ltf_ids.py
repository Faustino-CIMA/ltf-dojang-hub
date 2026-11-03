import re

from django.db import migrations
from django.db.models import Q


def assign_missing_ids(apps, schema_editor):
    """Assign LTF-0001 style ids using the models as they existed in this migration.

    The live Member model grows extra columns later. Querying it from here breaks
    a brand-new database, including the separate demo app.
    """

    License = apps.get_model("licenses", "License")
    Member = apps.get_model("members", "Member")
    Counter = apps.get_model("members", "MemberLicenseIdCounter")
    member_ids = list(License.objects.filter(status="active").values_list("member_id", flat=True))
    if not member_ids:
        return
    missing = Member.objects.filter(pk__in=member_ids).filter(Q(ltf_licenseid="") | Q(ltf_licenseid__isnull=True))
    pattern = re.compile(r"^LTF-(\d+)$")
    used = set()
    for value in Member.objects.filter(ltf_licenseid__startswith="LTF-").values_list("ltf_licenseid", flat=True):
        match = pattern.match(str(value or "").strip().upper())
        if match:
            used.add(int(match.group(1)))
    counter, _created = Counter.objects.get_or_create(prefix="LTF", defaults={"next_value": 1})
    next_value = max(int(counter.next_value), 1)
    assigned = False
    for member in missing.iterator():
        if str(member.ltf_licenseid or "").strip():
            continue
        while next_value in used:
            next_value += 1
        member.ltf_licenseid = f"LTF-{str(next_value).zfill(4)}"
        member.save(update_fields=["ltf_licenseid", "updated_at"])
        used.add(next_value)
        next_value += 1
        assigned = True
    if assigned:
        counter.next_value = next_value
        counter.save(update_fields=["next_value", "updated_at"])


class Migration(migrations.Migration):

    dependencies = [
        ("members", "0015_capitalize_member_license_roles"),
        ("licenses", "0044_invoice_delivery_and_billing"),
    ]

    operations = [
        migrations.RunPython(assign_missing_ids, migrations.RunPython.noop),
    ]
