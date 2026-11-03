from datetime import date

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Q
from django.utils.translation import gettext_lazy as _


def active_on(day: date) -> Q:
    """A dated row is current while started_on <= day < ended_on."""
    return Q(started_on__lte=day) & (Q(ended_on__isnull=True) | Q(ended_on__gt=day))


class NationalTeamSettings(models.Model):
    """One row. LTF can turn rules on without a code change."""

    forbid_overlapping_squads = models.BooleanField(default=False)

    class Meta:
        verbose_name = "National team settings"
        verbose_name_plural = "National team settings"

    def save(self, *args, **kwargs):
        self.pk = 1
        super().save(*args, **kwargs)

    @classmethod
    def load(cls) -> "NationalTeamSettings":
        row, _created = cls.objects.get_or_create(pk=1)
        return row

    def __str__(self) -> str:
        return "National team settings"


class Season(models.Model):
    """A season is a calendar year unless the start and end dates are changed."""

    year = models.PositiveIntegerField(unique=True)
    starts_on = models.DateField()
    ends_on = models.DateField()

    class Meta:
        ordering = ["-year"]

    def clean(self):
        if self.starts_on and self.ends_on and self.ends_on < self.starts_on:
            raise ValidationError({"ends_on": "end_before_start"})

    def __str__(self) -> str:
        return str(self.year)


class Squad(models.Model):
    class Discipline(models.TextChoices):
        KYORUGI = "kyorugi", _("Kyorugi")

    code = models.SlugField(max_length=40, unique=True)
    name = models.CharField(max_length=80)
    discipline = models.CharField(
        max_length=20,
        choices=Discipline.choices,
        default=Discipline.KYORUGI,
    )
    is_active = models.BooleanField(default=True)
    sort_order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["sort_order", "name"]

    def __str__(self) -> str:
        return self.name


class CadreLevel(models.Model):
    """An LTF cadre level such as A1 or Young talent. Inactive levels stay on history."""

    code = models.SlugField(max_length=32, unique=True)
    name = models.CharField(max_length=80)
    sort_order = models.PositiveSmallIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["sort_order", "code"]

    def __str__(self) -> str:
        return self.name


class SquadSelection(models.Model):
    class AgeClass(models.TextChoices):
        PUPILS = "pupils", _("Pupils")
        MINIMES = "minimes", _("Minimes")
        CADET = "cadet", _("Cadet")
        JUNIOR = "junior", _("Junior")
        SENIOR = "senior", _("Senior")
        YOUTH = "youth", _("Youth")

    member = models.ForeignKey(
        "members.Member",
        on_delete=models.CASCADE,
        related_name="squad_selections",
    )
    squad = models.ForeignKey(Squad, on_delete=models.PROTECT, related_name="selections")
    season = models.ForeignKey(Season, on_delete=models.PROTECT, related_name="selections")
    age_class = models.CharField(max_length=20, choices=AgeClass.choices, blank=True, default="")
    weight_category = models.CharField(max_length=40, blank=True, default="")
    is_captain = models.BooleanField(default=False)
    started_on = models.DateField()
    # Exclusive end, matching committee terms: selected while started_on <= day < ended_on.
    ended_on = models.DateField(null=True, blank=True)
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="recorded_squad_selections",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-started_on", "id"]
        indexes = [
            models.Index(fields=["season", "squad"], name="nt_sel_season_squad_idx"),
            models.Index(fields=["member", "season"], name="nt_sel_member_season_idx"),
        ]

    def is_active_on(self, day: date) -> bool:
        if self.started_on > day:
            return False
        if self.ended_on is None:
            return True
        return self.ended_on > day

    def __str__(self) -> str:
        return f"{self.member} · {self.squad} · {self.season}"


class AthleteStatus(models.Model):
    class Scheme(models.TextChoices):
        LTF_LEVEL = "ltf_level", _("LTF level")
        COSL = "cosl", _("COSL")
        SUPPORT = "support", _("Sportlycée / SSEA")

    class CoslPathway(models.TextChoices):
        ELITE = "elite", _("Elite")
        PROMOTION = "promotion", _("Promotion")

    class CoslRank(models.TextChoices):
        P1 = "P1", "P1"
        P2 = "P2", "P2"
        P3 = "P3", "P3"
        P4 = "P4", "P4"
        P5 = "P5", "P5"
        P6 = "P6", "P6"

    class CoslProject(models.TextChoices):
        OLYMPIC = "olympic", _("Olympic")
        QUALIFICATION = "qualification", _("Qualification")
        ELITE = "elite", _("Elite")

    class SupportProgram(models.TextChoices):
        SPORTLYCEE = "sportlycee", _("Sportlycée")
        SSEA = "ssea", _("SSEA")

    member = models.ForeignKey(
        "members.Member",
        on_delete=models.CASCADE,
        related_name="national_team_statuses",
    )
    scheme = models.CharField(max_length=20, choices=Scheme.choices)
    started_on = models.DateField()
    ended_on = models.DateField(null=True, blank=True)
    source_note = models.TextField(blank=True)
    cadre_level = models.ForeignKey(
        CadreLevel,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="statuses",
    )
    cosl_pathway = models.CharField(max_length=20, choices=CoslPathway.choices, blank=True)
    cosl_rank = models.CharField(max_length=4, choices=CoslRank.choices, blank=True)
    cosl_project = models.CharField(max_length=20, choices=CoslProject.choices, blank=True)
    support_program = models.CharField(max_length=20, choices=SupportProgram.choices, blank=True)
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="recorded_athlete_statuses",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-started_on", "-id"]
        indexes = [
            models.Index(fields=["member", "scheme", "started_on"], name="nt_status_member_scheme_idx"),
        ]

    def __str__(self) -> str:
        return f"{self.member} · {self.scheme} · {self.started_on}"


class NationalTeamStaff(models.Model):
    class Function(models.TextChoices):
        NATIONAL_COACH = "national_coach", _("National coach")
        SPORTLYCEE_COACH = "sportlycee_coach", _("Sportlycée coach")
        TECHNICAL_DIRECTOR = "technical_director", _("Technical director")
        PHYSIOTHERAPIST = "physiotherapist", _("Physiotherapist")
        PHOTOGRAPHER = "photographer", _("Photographer")
        OTHER = "other", _("Other")

    member = models.ForeignKey(
        "members.Member",
        on_delete=models.CASCADE,
        related_name="national_team_staff_roles",
    )
    function = models.CharField(max_length=32, choices=Function.choices)
    squad = models.ForeignKey(
        Squad,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="staff_roles",
    )
    title = models.CharField(max_length=80, blank=True)
    started_on = models.DateField()
    ended_on = models.DateField(null=True, blank=True)
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="recorded_national_team_staff",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["function", "-started_on", "id"]
        indexes = [
            models.Index(fields=["squad", "function"], name="nt_staff_squad_fn_idx"),
        ]

    def __str__(self) -> str:
        return f"{self.member} · {self.function}"
