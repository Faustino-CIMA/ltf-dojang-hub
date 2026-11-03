from decimal import Decimal

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("members", "0019_ltf_staff_medic_and_media"),
        ("clubmgmt", "0027_club_team"),
    ]

    operations = [
        migrations.AddField(
            model_name="clubteam",
            name="competition_name",
            field=models.CharField(blank=True, max_length=120),
        ),
        migrations.AddField(
            model_name="clubteam",
            name="competition_on",
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="clubteam",
            name="weight_margin_kg",
            field=models.DecimalField(decimal_places=1, default=Decimal("1.0"), max_digits=4),
        ),
        migrations.CreateModel(
            name="ClubTeamGroup",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("kind", models.CharField(choices=[("pair", "Pair"), ("team", "Team")], max_length=10)),
                ("name", models.CharField(blank=True, max_length=120)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "team",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="groups",
                        to="clubmgmt.clubteam",
                    ),
                ),
            ],
            options={"ordering": ["kind", "id"]},
        ),
        migrations.CreateModel(
            name="ClubTeamGroupMember",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("position", models.PositiveSmallIntegerField(default=0)),
                (
                    "group",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="slots",
                        to="clubmgmt.clubteamgroup",
                    ),
                ),
                (
                    "member",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="team_group_slots",
                        to="members.member",
                    ),
                ),
            ],
            options={"ordering": ["position", "id"]},
        ),
        migrations.AddConstraint(
            model_name="clubteamgroupmember",
            constraint=models.UniqueConstraint(fields=("group", "member"), name="club_team_group_member_uniq"),
        ),
    ]
