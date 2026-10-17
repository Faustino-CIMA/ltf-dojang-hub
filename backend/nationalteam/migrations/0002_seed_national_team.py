from datetime import date

from django.db import migrations
from django.utils import timezone


def seed_national_team(apps, schema_editor):
    NationalTeamSettings = apps.get_model("nationalteam", "NationalTeamSettings")
    Season = apps.get_model("nationalteam", "Season")
    Squad = apps.get_model("nationalteam", "Squad")
    CadreLevel = apps.get_model("nationalteam", "CadreLevel")

    NationalTeamSettings.objects.get_or_create(
        pk=1,
        defaults={"forbid_overlapping_squads": False},
    )
    year = timezone.localdate().year
    Season.objects.get_or_create(
        year=year,
        defaults={"starts_on": date(year, 1, 1), "ends_on": date(year, 12, 31)},
    )
    Squad.objects.get_or_create(
        code="national_team",
        defaults={
            "name": "National team",
            "discipline": "kyorugi",
            "is_active": True,
            "sort_order": 1,
        },
    )
    Squad.objects.get_or_create(
        code="young_talents",
        defaults={
            "name": "Young talents",
            "discipline": "kyorugi",
            "is_active": True,
            "sort_order": 2,
        },
    )
    for index in range(1, 10):
        CadreLevel.objects.get_or_create(
            code=f"A{index}",
            defaults={"name": f"A{index}", "sort_order": index, "is_active": True},
        )
    CadreLevel.objects.get_or_create(
        code="young_talent",
        defaults={"name": "Young talent", "sort_order": 10, "is_active": True},
    )


class Migration(migrations.Migration):

    dependencies = [
        ("nationalteam", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(seed_national_team, migrations.RunPython.noop),
    ]
