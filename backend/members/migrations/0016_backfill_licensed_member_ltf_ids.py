from django.db import migrations


def assign_missing_ids(apps, schema_editor):
    from members.services import assign_ltf_license_ids_for_licensed_members

    assign_ltf_license_ids_for_licensed_members()


class Migration(migrations.Migration):

    dependencies = [
        ("members", "0015_capitalize_member_license_roles"),
        ("licenses", "0044_invoice_delivery_and_billing"),
    ]

    operations = [
        migrations.RunPython(assign_missing_ids, migrations.RunPython.noop),
    ]
