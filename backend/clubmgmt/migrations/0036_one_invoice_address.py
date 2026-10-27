from django.db import migrations, models


def ids_to_unflag(rows):
    """Keep the invoice flag on the row billing already uses.

    ``invoice_address`` takes the lowest id with ``use_for_invoice`` set
    (model order is by id). Later flagged rows lose the flag. Rows that
    were never flagged stay as they are.
    """
    seen_owners = set()
    drop = []
    for owner_id, address_id, flagged in rows:
        if not flagged:
            continue
        if owner_id in seen_owners:
            drop.append(address_id)
        else:
            seen_owners.add(owner_id)
    return drop


def keep_first_invoice_address(apps, schema_editor):
    for model_name, owner_field in (
        ("MemberAddress", "member_id"),
        ("PersonAddress", "person_id"),
    ):
        model = apps.get_model("clubmgmt", model_name)
        rows = model.objects.order_by("id").values_list(owner_field, "id", "use_for_invoice")
        drop = ids_to_unflag(rows)
        if drop:
            model.objects.filter(id__in=drop).update(use_for_invoice=False)


class Migration(migrations.Migration):

    dependencies = [
        ("clubmgmt", "0035_club_clothing"),
    ]

    operations = [
        migrations.RunPython(keep_first_invoice_address, migrations.RunPython.noop),
        migrations.AddConstraint(
            model_name="memberaddress",
            constraint=models.UniqueConstraint(
                condition=models.Q(("use_for_invoice", True)),
                fields=("member",),
                name="clubmgmt_member_one_invoice_address",
            ),
        ),
        migrations.AddConstraint(
            model_name="personaddress",
            constraint=models.UniqueConstraint(
                condition=models.Q(("use_for_invoice", True)),
                fields=("person",),
                name="clubmgmt_person_one_invoice_address",
            ),
        ),
    ]
