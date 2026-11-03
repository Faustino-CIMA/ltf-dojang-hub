from django.db import migrations, models


def rename_photographer_to_media(apps, schema_editor):
    StaffFunction = apps.get_model("members", "LtfStaffFunction")
    StaffFunction.objects.filter(function="photographer").update(function="media")


def rename_media_to_photographer(apps, schema_editor):
    StaffFunction = apps.get_model("members", "LtfStaffFunction")
    StaffFunction.objects.filter(function="media").update(function="photographer")


class Migration(migrations.Migration):

    dependencies = [
        ("members", "0018_ltf_staff_coach"),
    ]

    operations = [
        migrations.RunPython(rename_photographer_to_media, rename_media_to_photographer),
        migrations.AlterField(
            model_name="ltfstafffunction",
            name="function",
            field=models.CharField(
                choices=[
                    ("secretary", "Secretary"),
                    ("coach", "LTF Coach"),
                    ("medic", "LTF Medic"),
                    ("media", "LTF Media"),
                    ("other", "Other staff"),
                ],
                max_length=32,
            ),
        ),
    ]
