from django.db import migrations


def map_codes(apps, schema_editor):
    from clubs.iso3166 import normalize_country_code

    for model_name in ("PersonAddress", "MemberAddress"):
        model = apps.get_model("clubmgmt", model_name)
        for row in model.objects.all().iterator():
            mapped = normalize_country_code(row.country)
            if mapped != row.country:
                row.country = mapped
                row.save(update_fields=["country"])

    member_record = apps.get_model("clubmgmt", "MemberRecord")
    for row in member_record.objects.all().iterator():
        first = normalize_country_code(row.nationality_1)
        second = normalize_country_code(row.nationality_2)
        if first != row.nationality_1 or second != row.nationality_2:
            row.nationality_1 = first
            row.nationality_2 = second
            row.save(update_fields=["nationality_1", "nationality_2"])


class Migration(migrations.Migration):
    dependencies = [
        ("clubmgmt", "0044_address_country_code_default"),
        ("clubs", "0019_training_venue_country_code_default"),
    ]

    operations = [
        migrations.RunPython(map_codes, migrations.RunPython.noop),
    ]
