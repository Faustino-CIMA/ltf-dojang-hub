from django.db import migrations, models


def mark_first_billing(apps, schema_editor):
    MembershipBilling = apps.get_model("clubmgmt", "MembershipBilling")
    seen = set()
    for row in MembershipBilling.objects.order_by("club_id", "year", "sequence", "id"):
        key = (row.club_id, row.year)
        if key in seen:
            continue
        seen.add(key)
        MembershipBilling.objects.filter(pk=row.pk).update(charges_license_fee=True)


def clear_license_fee_billing(apps, schema_editor):
    MembershipBilling = apps.get_model("clubmgmt", "MembershipBilling")
    MembershipBilling.objects.update(charges_license_fee=False)


class Migration(migrations.Migration):

    dependencies = [
        ("clubmgmt", "0021_membercontact_spouse"),
    ]

    operations = [
        migrations.AddField(
            model_name="membershipbilling",
            name="charges_license_fee",
            field=models.BooleanField(default=False),
        ),
        migrations.RunPython(mark_first_billing, clear_license_fee_billing),
    ]
