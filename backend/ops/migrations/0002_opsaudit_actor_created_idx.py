from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("ops", "0001_ops_console"),
    ]

    operations = [
        migrations.AddIndex(
            model_name="opsauditlog",
            index=models.Index(fields=["actor", "-created_at"], name="opsaudit_actor_created_idx"),
        ),
    ]
