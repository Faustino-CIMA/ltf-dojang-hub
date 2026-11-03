from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("nationalteam", "0003_optional_weight_and_age_class"),
    ]

    operations = [
        migrations.AlterField(
            model_name="squadselection",
            name="age_class",
            field=models.CharField(
                blank=True,
                choices=[
                    ("pupils", "Pupils"),
                    ("minimes", "Minimes"),
                    ("cadet", "Cadet"),
                    ("junior", "Junior"),
                    ("senior", "Senior"),
                    ("youth", "Youth"),
                ],
                default="",
                max_length=20,
            ),
        ),
    ]
