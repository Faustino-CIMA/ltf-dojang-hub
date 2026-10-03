from django.conf import settings
from django.db import models
from django.utils.translation import gettext_lazy as _


class PublicHoliday(models.Model):
    date = models.DateField(unique=True)
    name = models.CharField(max_length=80)

    class Meta:
        ordering = ["date"]

    def __str__(self) -> str:
        return f"{self.date} {self.name}"


class SchoolHoliday(models.Model):
    school_year = models.PositiveIntegerField()
    name = models.CharField(max_length=80)
    starts_on = models.DateField()
    ends_on = models.DateField()

    class Meta:
        ordering = ["starts_on", "id"]

    def __str__(self) -> str:
        return self.name


class TrainingSettings(models.Model):
    class PayFrequency(models.TextChoices):
        MONTHLY = "monthly", _("Every month")
        QUARTERLY = "quarterly", _("Every quarter")
        TWICE = "twice", _("Twice a year")

    club = models.OneToOneField("clubs.Club", on_delete=models.CASCADE, related_name="training_settings")
    pay_frequency = models.CharField(max_length=20, choices=PayFrequency.choices, default=PayFrequency.TWICE)
    payday_day = models.PositiveSmallIntegerField(default=15)
    quarter_anchor_month = models.PositiveSmallIntegerField(default=3)
    default_place = models.CharField(max_length=120, blank=True)
    first_payday_month = models.PositiveSmallIntegerField(default=6)
    first_payday_day = models.PositiveSmallIntegerField(default=30)
    second_payday_month = models.PositiveSmallIntegerField(default=12)
    second_payday_day = models.PositiveSmallIntegerField(default=15)

    def __str__(self) -> str:
        return f"Training settings {self.club_id}"


class TrainingSeries(models.Model):
    class Audience(models.TextChoices):
        KIDS = "kids", _("Kids")
        ADULTS = "adults", _("Adults")
        BELT_TEST = "belt_test", _("Belt-test preparation")
        COMPETITION = "competition", _("Competition preparation")
        OTHER = "other", _("Other")

    club = models.ForeignKey("clubs.Club", on_delete=models.CASCADE, related_name="training_series")
    name = models.CharField(max_length=120)
    audience = models.CharField(max_length=20, choices=Audience.choices)
    weekday = models.PositiveSmallIntegerField()
    start_time = models.TimeField()
    end_time = models.TimeField()
    valid_from = models.DateField()
    valid_until = models.DateField()
    skip_public_holidays = models.BooleanField(default=True)
    skip_school_holidays = models.BooleanField(default=True)
    counts_for_under_16 = models.BooleanField(default=False)
    place = models.CharField(max_length=120, blank=True)
    coaches = models.ManyToManyField(settings.AUTH_USER_MODEL, blank=True, related_name="training_series_coached")
    regulars = models.ManyToManyField("members.Member", blank=True, related_name="training_series")
    active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["weekday", "start_time", "id"]

    def __str__(self) -> str:
        return self.name


class TrainingSession(models.Model):
    class Status(models.TextChoices):
        SCHEDULED = "scheduled", _("Scheduled")
        HELD = "held", _("Held")
        CANCELLED = "cancelled", _("Cancelled")

    club = models.ForeignKey("clubs.Club", on_delete=models.CASCADE, related_name="training_sessions")
    series = models.ForeignKey(
        TrainingSeries,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="sessions",
    )
    name = models.CharField(max_length=120)
    audience = models.CharField(max_length=20, choices=TrainingSeries.Audience.choices)
    held_on = models.DateField()
    start_time = models.TimeField()
    end_time = models.TimeField()
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.SCHEDULED)
    coaches = models.ManyToManyField(settings.AUTH_USER_MODEL, blank=True, related_name="training_sessions_coached")
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["held_on", "start_time", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["series", "held_on"],
                condition=models.Q(series__isnull=False),
                name="training_session_series_day",
            )
        ]

    def __str__(self) -> str:
        return f"{self.name} {self.held_on}"


class TrainingAttendance(models.Model):
    session = models.ForeignKey(TrainingSession, on_delete=models.CASCADE, related_name="attendances")
    member = models.ForeignKey("members.Member", on_delete=models.CASCADE, related_name="training_attendances")
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="training_attendance_recorded",
    )
    recorded_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = [("session", "member")]


class PromotionRule(models.Model):
    club = models.ForeignKey("clubs.Club", on_delete=models.CASCADE, related_name="promotion_rules")
    to_grade = models.CharField(max_length=20)
    required_hours = models.DecimalField(max_digits=6, decimal_places=2)
    audience = models.CharField(max_length=20, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = [("club", "to_grade")]
        ordering = ["to_grade", "id"]


class BeltTest(models.Model):
    club = models.ForeignKey("clubs.Club", on_delete=models.CASCADE, related_name="belt_tests")
    name = models.CharField(max_length=120)
    held_on = models.DateField()
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-held_on", "-id"]


class BeltTestResult(models.Model):
    class Result(models.TextChoices):
        PASSED = "passed", _("Passed")
        FAILED = "failed", _("Failed")

    belt_test = models.ForeignKey(BeltTest, on_delete=models.CASCADE, related_name="results")
    member = models.ForeignKey("members.Member", on_delete=models.CASCADE, related_name="belt_test_results")
    to_grade = models.CharField(max_length=20)
    result = models.CharField(max_length=20, choices=Result.choices)
    hours = models.DecimalField(max_digits=6, decimal_places=2, default=0)
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="belt_test_results_recorded",
    )
    recorded_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = [("belt_test", "member")]


class CoachPayRate(models.Model):
    """Euro rate for one coach. Hourly uses the length of each held class. A unit is one held class."""

    class Basis(models.TextChoices):
        HOURLY = "hourly", _("Per hour")
        UNIT = "unit", _("Per training unit")

    club = models.ForeignKey("clubs.Club", on_delete=models.CASCADE, related_name="coach_pay_rates")
    coach = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="coach_pay_rates")
    basis = models.CharField(max_length=20, choices=Basis.choices, default=Basis.HOURLY)
    rate = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["coach_id"]
        unique_together = [("club", "coach")]

    def __str__(self) -> str:
        return f"{self.coach_id} {self.basis} {self.rate}"


class CoachOuting(models.Model):
    """Tournament coaching, fuel, and hotel for one coach on one date.

    A set coaching amount replaces quantity times the current rate.
    An empty coaching amount uses that rate. Fuel and hotel are the amounts entered.
    """

    club = models.ForeignKey("clubs.Club", on_delete=models.CASCADE, related_name="coach_outings")
    coach = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="coach_outings")
    held_on = models.DateField()
    name = models.CharField(max_length=160)
    quantity = models.DecimalField(max_digits=6, decimal_places=2, default=0)
    coaching_amount = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    fuel_amount = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    hotel_amount = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["held_on", "id"]

    def __str__(self) -> str:
        return f"{self.name} {self.held_on}"
