"""Club competition teams.

Club admins and coaches of a club with the competition module manage
every team in that club. The current roster is the membership list.
Changes are kept on membership events. LTF roles cannot read these rows.
"""

from decimal import Decimal

from django.conf import settings
from django.db import models
from django.utils import timezone


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
    category_set_code = models.CharField(max_length=20, default="wt")
    archived_at = models.DateTimeField(null=True, blank=True)
    roster_history_from = models.DateField(null=True, blank=True)
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


class WeightCategorySet(models.Model):
    """A national or world Kyorugi weight-category preset.

    Youth bands live on the bands. Cadet, Junior, and Senior always use the
    World Taekwondo ceilings, so the world preset has no bands of its own.
    """

    class AgeBasis(models.TextChoices):
        BIRTH_YEAR = "birth_year", "Birth year"
        COMPETITION_DAY = "competition_day", "Competition day"

    code = models.CharField(max_length=20, unique=True)
    source_note = models.CharField(max_length=280)
    age_basis = models.CharField(max_length=20, choices=AgeBasis.choices, default=AgeBasis.BIRTH_YEAR)
    position = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["position", "id"]

    def __str__(self) -> str:
        return self.code


class WeightCategoryBand(models.Model):
    category_set = models.ForeignKey(WeightCategorySet, on_delete=models.CASCADE, related_name="bands")
    code = models.CharField(max_length=40)
    age_min = models.PositiveSmallIntegerField()
    age_max = models.PositiveSmallIntegerField()
    sex = models.CharField(max_length=1)
    ceilings = models.JSONField()
    position = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["position", "id"]


class ClubTeamCategoryBand(models.Model):
    """Youth limits typed in for one team's Custom category set."""

    team = models.ForeignKey(ClubTeam, on_delete=models.CASCADE, related_name="custom_bands")
    label = models.CharField(max_length=80, blank=True)
    age_min = models.PositiveSmallIntegerField()
    age_max = models.PositiveSmallIntegerField()
    sex = models.CharField(max_length=1)
    ceilings = models.JSONField()
    position = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["position", "id"]


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


class ClubTeamMembershipEvent(models.Model):
    """One roster change. member_key keeps the person after the member row is gone."""

    class Action(models.TextChoices):
        ALREADY = "already", "Already"
        ADDED = "added", "Added"
        REMOVED = "removed", "Removed"
        ROLE_CHANGED = "role_changed", "Role changed"

    team = models.ForeignKey(ClubTeam, on_delete=models.CASCADE, related_name="membership_events")
    member = models.ForeignKey(
        "members.Member",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="team_membership_events",
    )
    member_key = models.PositiveIntegerField()
    last_name = models.CharField(max_length=150)
    first_name = models.CharField(max_length=150)
    role = models.CharField(max_length=10, choices=ClubTeamMembership.Role.choices)
    previous_role = models.CharField(max_length=10, blank=True)
    action = models.CharField(max_length=20, choices=Action.choices)
    note = models.CharField(max_length=120, blank=True)
    occurred_at = models.DateTimeField()
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="recorded_team_membership_events",
    )

    class Meta:
        ordering = ["occurred_at", "id"]
        indexes = [
            models.Index(fields=["team", "occurred_at"], name="club_team_event_when_idx"),
        ]


def record_membership_event(*, team, member, action: str, role: str, actor=None, previous_role: str = "", note: str = ""):
    ClubTeamMembershipEvent.objects.create(
        team=team,
        member=member,
        member_key=member.id,
        last_name=member.last_name,
        first_name=member.first_name,
        role=role,
        previous_role=previous_role,
        action=action,
        note=(note or "")[:120],
        occurred_at=timezone.now(),
        actor=actor if getattr(actor, "is_authenticated", False) else None,
    )


def log_memberships_before_member_delete(sender, instance, **kwargs):
    for row in instance.team_memberships.select_related("team"):
        record_membership_event(
            team=row.team,
            member=instance,
            action=ClubTeamMembershipEvent.Action.REMOVED,
            role=row.role,
        )
