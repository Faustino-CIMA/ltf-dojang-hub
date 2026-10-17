from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("members", "0017_ltf_staff_without_club"),
    ]

    operations = [
        migrations.AlterField(
            model_name="ltfstafffunction",
            name="function",
            field=models.CharField(
                choices=[
                    ("secretary", "Secretary"),
                    ("coach", "LTF Coach"),
                    ("photographer", "Photographer"),
                    ("other", "Other staff"),
                ],
                max_length=32,
            ),
        ),
    ]
