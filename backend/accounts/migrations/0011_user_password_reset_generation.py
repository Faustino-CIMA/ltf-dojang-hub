"""Add the counter that invalidates older password-reset links.

Existing rows take the default of 0. Tokens issued before this column existed
still check while the counter stays 0. The next issued link moves it to 1.
"""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0010_seed_office_map"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="password_reset_generation",
            field=models.PositiveIntegerField(default=0),
        ),
    ]
