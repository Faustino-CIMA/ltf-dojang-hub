"""Record the desk and level choices on the office map.

The columns stay varchar. Choices are not a database constraint, and existing
rows are left as they are.
"""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0011_user_password_reset_generation"),
    ]

    operations = [
        migrations.AlterField(
            model_name="officedeskmap",
            name="desk",
            field=models.CharField(
                choices=[
                    ("ltf_finance", "LTF Finance"),
                    ("ltf_admin", "LTF Admin"),
                    ("club_admin", "Club Admin"),
                    ("coach", "Coach"),
                    ("member", "Member"),
                ],
                max_length=20,
            ),
        ),
        migrations.AlterField(
            model_name="officedeskmap",
            name="level",
            field=models.CharField(
                choices=[("full", "Full"), ("read_only", "Read only")],
                max_length=20,
            ),
        ),
    ]
