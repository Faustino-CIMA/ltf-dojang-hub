from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("members", "0019_ltf_staff_medic_and_media"),
    ]

    operations = [
        migrations.AddField(
            model_name="member",
            name="is_demo",
            field=models.BooleanField(
                default=False,
                help_text="Marks a fictional member created for the separate demo app.",
            ),
        ),
    ]
