from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("clubmgmt", "0033_member_gear"),
    ]

    operations = [
        migrations.AddField(
            model_name="clubteam",
            name="pss_system",
            field=models.CharField(
                blank=True,
                choices=[("daedo", "Daedo"), ("kpnp", "KPNP")],
                max_length=8,
            ),
        ),
    ]
