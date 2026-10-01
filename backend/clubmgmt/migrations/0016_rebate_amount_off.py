from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("clubmgmt", "0015_coach_include_in_qualite"),
    ]

    operations = [
        migrations.AddField(
            model_name="familyrebaterule",
            name="amount_off",
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=8, null=True),
        ),
        migrations.AlterField(
            model_name="familyrebaterule",
            name="percent_off",
            field=models.DecimalField(decimal_places=2, default=0, max_digits=5),
        ),
    ]
