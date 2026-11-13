from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("members", "0025_open_notices_for_waiting_pictures"),
    ]

    operations = [
        migrations.AlterField(
            model_name="adminnotice",
            name="kind",
            field=models.CharField(
                choices=[
                    ("picture_review", "Picture review"),
                    ("picture_rejected", "Picture rejected"),
                ],
                max_length=40,
            ),
        ),
    ]
