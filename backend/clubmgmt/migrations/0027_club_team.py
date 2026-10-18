import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("members", "0019_ltf_staff_medic_and_media"),
        ("clubs", "0001_initial"),
        ("clubmgmt", "0026_body_measurement"),
    ]

    operations = [
        migrations.CreateModel(
            name="ClubTeam",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=120)),
                (
                    "discipline",
                    models.CharField(
                        choices=[("kyorugi", "Kyorugi"), ("poomsae", "Poomsae")],
                        max_length=20,
                    ),
                ),
                ("note", models.CharField(blank=True, max_length=240)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "club",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="teams",
                        to="clubs.club",
                    ),
                ),
            ],
            options={"ordering": ["name", "id"]},
        ),
        migrations.CreateModel(
            name="ClubTeamMembership",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                (
                    "member",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="team_memberships",
                        to="members.member",
                    ),
                ),
                (
                    "team",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="memberships",
                        to="clubmgmt.clubteam",
                    ),
                ),
            ],
            options={"ordering": ["member__last_name", "member__first_name", "id"]},
        ),
        migrations.AddConstraint(
            model_name="clubteammembership",
            constraint=models.UniqueConstraint(fields=("team", "member"), name="club_team_member_uniq"),
        ),
    ]
