from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("clubmgmt", "0014_training_qualite_list"),
    ]

    operations = [
        migrations.AddField(
            model_name="coachqualification",
            name="include_in_qualite",
            field=models.BooleanField(default=True),
        ),
    ]
