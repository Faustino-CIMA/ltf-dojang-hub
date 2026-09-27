from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("clubmgmt", "0011_training"),
    ]

    operations = [
        migrations.AddField(
            model_name="trainingsettings",
            name="pay_frequency",
            field=models.CharField(
                choices=[
                    ("monthly", "Every month"),
                    ("quarterly", "Every quarter"),
                    ("twice", "Twice a year"),
                ],
                default="twice",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="trainingsettings",
            name="payday_day",
            field=models.PositiveSmallIntegerField(default=15),
        ),
        migrations.AddField(
            model_name="trainingsettings",
            name="quarter_anchor_month",
            field=models.PositiveSmallIntegerField(default=3),
        ),
    ]
