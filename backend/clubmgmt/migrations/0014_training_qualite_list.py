from django.db import migrations, models


def mark_kids_classes(apps, schema_editor):
    TrainingSeries = apps.get_model("clubmgmt", "TrainingSeries")
    TrainingSeries.objects.filter(audience="kids").update(counts_for_under_16=True)


class Migration(migrations.Migration):

    dependencies = [
        ("clubmgmt", "0013_belt_promotion"),
    ]

    operations = [
        migrations.AddField(
            model_name="trainingsettings",
            name="default_place",
            field=models.CharField(blank=True, max_length=120),
        ),
        migrations.AddField(
            model_name="trainingseries",
            name="counts_for_under_16",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="trainingseries",
            name="place",
            field=models.CharField(blank=True, max_length=120),
        ),
        migrations.RunPython(mark_kids_classes, migrations.RunPython.noop),
    ]
