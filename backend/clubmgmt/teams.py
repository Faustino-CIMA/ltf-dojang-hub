"""Club competition teams.

Club admins and coaches of a club with the club-management module manage
every team in that club. Membership is the current list only. LTF roles
cannot read these rows.
"""

from decimal import Decimal

from django.db import models


class ClubTeam(models.Model):
    class Discipline(models.TextChoices):
        KYORUGI = "kyorugi", "Kyorugi"
        POOMSAE = "poomsae", "Poomsae"

    club = models.ForeignKey("clubs.Club", on_delete=models.CASCADE, related_name="teams")
    name = models.CharField(max_length=120)
    discipline = models.CharField(max_length=20, choices=Discipline.choices)
    note = models.CharField(max_length=240, blank=True)
    competition_on = models.DateField(null=True, blank=True)
    competition_name = models.CharField(max_length=120, blank=True)
    weight_margin_kg = models.DecimalField(max_digits=4, decimal_places=1, default=Decimal("1.0"))
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name", "id"]

    def __str__(self) -> str:
        return f"{self.name} · {self.discipline}"


class ClubTeamMembership(models.Model):
    class Role(models.TextChoices):
        ATHLETE = "athlete", "Athlete"
        COACH = "coach", "Coach"

    team = models.ForeignKey(ClubTeam, on_delete=models.CASCADE, related_name="memberships")
    member = models.ForeignKey(
        "members.Member",
        on_delete=models.CASCADE,
        related_name="team_memberships",
    )
    role = models.CharField(max_length=10, choices=Role.choices, default=Role.ATHLETE)

    class Meta:
        ordering = ["member__last_name", "member__first_name", "id"]
        constraints = [
            models.UniqueConstraint(fields=["team", "member"], name="club_team_member_uniq"),
        ]


class ClubTeamGroup(models.Model):
    """A Poomsae pair (mixed) or team of three (same sex)."""

    class Kind(models.TextChoices):
        PAIR = "pair", "Pair"
        TEAM = "team", "Team"

    team = models.ForeignKey(ClubTeam, on_delete=models.CASCADE, related_name="groups")
    kind = models.CharField(max_length=10, choices=Kind.choices)
    name = models.CharField(max_length=120, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["kind", "id"]


class ClubTeamGroupMember(models.Model):
    group = models.ForeignKey(ClubTeamGroup, on_delete=models.CASCADE, related_name="slots")
    member = models.ForeignKey(
        "members.Member",
        on_delete=models.CASCADE,
        related_name="team_group_slots",
    )
    position = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["position", "id"]
        constraints = [
            models.UniqueConstraint(fields=["group", "member"], name="club_team_group_member_uniq"),
        ]
