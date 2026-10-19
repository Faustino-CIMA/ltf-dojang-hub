from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("clubmgmt", "0030_weight_category_sets"),
    ]

    operations = [
        migrations.AddField(
            model_name="clubteam",
            name="archived_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
