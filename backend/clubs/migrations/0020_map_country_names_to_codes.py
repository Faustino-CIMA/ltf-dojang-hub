from django.db import migrations


def map_codes(apps, schema_editor):
    from clubs.iso3166 import normalize_country_code

    for model_name in ("TrainingVenue", "FederationProfile"):
        model = apps.get_model("clubs", model_name)
        for row in model.objects.all().iterator():
            mapped = normalize_country_code(row.country)
            if mapped != row.country:
                row.country = mapped
                row.save(update_fields=["country"])


class Migration(migrations.Migration):
    dependencies = [
        ("clubs", "0019_training_venue_country_code_default"),
    ]

    operations = [
        migrations.RunPython(map_codes, migrations.RunPython.noop),
    ]
