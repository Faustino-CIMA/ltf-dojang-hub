from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("nationalteam", "0002_seed_national_team"),
    ]

    operations = [
        migrations.AlterField(
            model_name="squadselection",
            name="age_class",
            field=models.CharField(
                blank=True,
                choices=[
                    ("youth", "Youth"),
                    ("cadet", "Cadet"),
                    ("junior", "Junior"),
                    ("senior", "Senior"),
                ],
                default="",
                max_length=20,
            ),
        ),
        migrations.AlterField(
            model_name="squadselection",
            name="weight_category",
            field=models.CharField(blank=True, default="", max_length=40),
        ),
    ]
