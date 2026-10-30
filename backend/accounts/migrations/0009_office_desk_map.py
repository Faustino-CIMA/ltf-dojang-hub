import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0008_mfa_grace_rows"),
        ("clubmgmt", "0039_trainingsession_venue"),
    ]

    operations = [
        migrations.AddField(
            model_name="deskgrant",
            name="mandate",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="desk_grants",
                to="clubmgmt.committeemandate",
            ),
        ),
        migrations.CreateModel(
            name="OfficeDeskMap",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("office", models.CharField(max_length=32)),
                ("desk", models.CharField(max_length=20)),
                ("level", models.CharField(max_length=20)),
            ],
            options={"ordering": ["office", "desk"]},
        ),
        migrations.AddConstraint(
            model_name="officedeskmap",
            constraint=models.UniqueConstraint(fields=("office", "desk"), name="office_desk_map_uniq"),
        ),
        migrations.AddConstraint(
            model_name="deskgrant",
            constraint=models.UniqueConstraint(
                condition=models.Q(source="office"),
                fields=("mandate", "desk", "level"),
                name="desk_grant_office_uniq",
            ),
        ),
    ]
