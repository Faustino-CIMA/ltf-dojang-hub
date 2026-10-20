from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
from django.utils import timezone


def snapshot_current_rosters(apps, schema_editor):
    ClubTeam = apps.get_model("clubmgmt", "ClubTeam")
    ClubTeamMembership = apps.get_model("clubmgmt", "ClubTeamMembership")
    Event = apps.get_model("clubmgmt", "ClubTeamMembershipEvent")
    now = timezone.now()
    day = timezone.localdate()
    ClubTeam.objects.update(roster_history_from=day)
    rows = []
    for membership in ClubTeamMembership.objects.select_related("member"):
        member = membership.member
        rows.append(
            Event(
                team_id=membership.team_id,
                member_id=member.id,
                member_key=member.id,
                last_name=member.last_name,
                first_name=member.first_name,
                role=membership.role,
                previous_role="",
                action="already",
                note="",
                occurred_at=now,
                actor_id=None,
            )
        )
    Event.objects.bulk_create(rows)


def clear_snapshot(apps, schema_editor):
    Event = apps.get_model("clubmgmt", "ClubTeamMembershipEvent")
    Event.objects.all().delete()
    ClubTeam = apps.get_model("clubmgmt", "ClubTeam")
    ClubTeam.objects.update(roster_history_from=None)


class Migration(migrations.Migration):

    dependencies = [
        ("clubmgmt", "0031_club_team_archived"),
        ("members", "0019_ltf_staff_medic_and_media"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name="clubteam",
            name="roster_history_from",
            field=models.DateField(blank=True, null=True),
        ),
        migrations.CreateModel(
            name="ClubTeamMembershipEvent",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("member_key", models.PositiveIntegerField()),
                ("last_name", models.CharField(max_length=150)),
                ("first_name", models.CharField(max_length=150)),
                ("role", models.CharField(choices=[("athlete", "Athlete"), ("coach", "Coach")], max_length=10)),
                ("previous_role", models.CharField(blank=True, max_length=10)),
                (
                    "action",
                    models.CharField(
                        choices=[
                            ("already", "Already"),
                            ("added", "Added"),
                            ("removed", "Removed"),
                            ("role_changed", "Role changed"),
                        ],
                        max_length=20,
                    ),
                ),
                ("note", models.CharField(blank=True, max_length=120)),
                ("occurred_at", models.DateTimeField()),
                (
                    "actor",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="recorded_team_membership_events",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "member",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="team_membership_events",
                        to="members.member",
                    ),
                ),
                (
                    "team",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="membership_events",
                        to="clubmgmt.clubteam",
                    ),
                ),
            ],
            options={"ordering": ["occurred_at", "id"]},
        ),
        migrations.AddIndex(
            model_name="clubteammembershipevent",
            index=models.Index(fields=["team", "occurred_at"], name="club_team_event_when_idx"),
        ),
        migrations.RunPython(snapshot_current_rosters, clear_snapshot),
    ]
