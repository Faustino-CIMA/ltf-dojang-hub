"""Club competition teams.

Club admins and coaches of a club with the club-management module manage
every team in that club. Membership is the current list only. LTF roles
cannot read these rows.
"""

from django.db import models


class ClubTeam(models.Model):
    class Discipline(models.TextChoices):
        KYORUGI = "kyorugi", "Kyorugi"
        POOMSAE = "poomsae", "Poomsae"

    club = models.ForeignKey("clubs.Club", on_delete=models.CASCADE, related_name="teams")
    name = models.CharField(max_length=120)
    discipline = models.CharField(max_length=20, choices=Discipline.choices)
    note = models.CharField(max_length=240, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name", "id"]

    def __str__(self) -> str:
        return f"{self.name} · {self.discipline}"


class ClubTeamMembership(models.Model):
    team = models.ForeignKey(ClubTeam, on_delete=models.CASCADE, related_name="memberships")
    member = models.ForeignKey(
        "members.Member",
        on_delete=models.CASCADE,
        related_name="team_memberships",
    )

    class Meta:
        ordering = ["member__last_name", "member__first_name", "id"]
        constraints = [
            models.UniqueConstraint(fields=["team", "member"], name="club_team_member_uniq"),
        ]
