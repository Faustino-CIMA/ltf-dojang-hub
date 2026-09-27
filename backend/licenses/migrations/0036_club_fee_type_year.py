from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("licenses", "0035_club_fee_billing"),
    ]

    operations = [
        migrations.AddField(
            model_name="clubfeetype",
            name="year",
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
    ]
