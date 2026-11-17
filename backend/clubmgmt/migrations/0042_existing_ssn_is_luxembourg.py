from django.db import migrations


def mark_existing_numbers_as_luxembourg(apps, schema_editor):
    MemberRecord = apps.get_model("clubmgmt", "MemberRecord")
    MemberRecord.objects.exclude(social_security_number="").update(social_security_country="LU")


class Migration(migrations.Migration):
    """Existing stored numbers were entered as Luxembourg matricules."""

    dependencies = [
        ("clubmgmt", "0041_social_security_country"),
    ]

    operations = [
        migrations.RunPython(mark_existing_numbers_as_luxembourg, migrations.RunPython.noop),
    ]
