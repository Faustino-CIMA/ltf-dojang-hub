from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("clubmgmt", "0040_person_user"),
    ]

    operations = [
        migrations.AddField(
            model_name="memberrecord",
            name="social_security_country",
            field=models.CharField(blank=True, max_length=2),
        ),
        migrations.AlterField(
            model_name="memberrecord",
            name="social_security_number",
            field=models.CharField(blank=True, max_length=20),
        ),
    ]
