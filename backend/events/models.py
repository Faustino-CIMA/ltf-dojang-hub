from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models


class Event(models.Model):
    class Kind(models.TextChoices):
        CALENDAR = "calendar", "Calendar"
        KYORUGI = "kyorugi", "Kyorugi"
        POOMSAE = "poomsae", "Poomsae"

    class OwnerScope(models.TextChoices):
        FEDERATION = "federation", "Federation"
        CLUB = "club", "Club"

    class Visibility(models.TextChoices):
        PUBLIC = "public", "Public"
        INTERNAL = "internal", "Internal"
        PRIVATE = "private", "Private"
        SHARED = "shared", "All clubs and the LTF"
        PRESIDENTS = "presidents", "Club presidents"

    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    kind = models.CharField(max_length=16, choices=Kind.choices, default=Kind.CALENDAR)
    owner_scope = models.CharField(max_length=16, choices=OwnerScope.choices)
    club = models.ForeignKey(
        "clubs.Club",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="events",
    )
    venue_name = models.CharField(max_length=200, blank=True)
    venue_address = models.CharField(max_length=255, blank=True)
    starts_at = models.DateTimeField()
    ends_at = models.DateTimeField()
    all_day = models.BooleanField(default=False)
    visibility = models.CharField(
        max_length=16,
        choices=Visibility.choices,
        default=Visibility.PUBLIC,
    )
    audience_clubs = models.ManyToManyField(
        "clubs.Club",
        blank=True,
        related_name="president_events",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="events_created",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["starts_at", "id"]
        indexes = [
            models.Index(fields=["owner_scope", "starts_at"], name="evt_scope_start_idx"),
            models.Index(fields=["club", "starts_at"], name="evt_club_start_idx"),
            models.Index(fields=["kind", "starts_at"], name="evt_kind_start_idx"),
        ]

    def clean(self):
        if self.owner_scope == self.OwnerScope.CLUB and not self.club_id:
            raise ValidationError({"club": "A club event needs a club."})
        if self.owner_scope == self.OwnerScope.FEDERATION and self.club_id:
            raise ValidationError({"club": "A federation event cannot be tied to a club."})
        if self.starts_at and self.ends_at and self.ends_at < self.starts_at:
            raise ValidationError({"ends_at": "End must be on or after the start."})

    def __str__(self) -> str:
        return self.title


class EventAttention(models.Model):
    """Per-user visit and reminder state for one event."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="event_attentions",
    )
    event = models.ForeignKey(
        Event,
        on_delete=models.CASCADE,
        related_name="attentions",
    )
    seen_at = models.DateTimeField(null=True, blank=True)
    remind_on = models.DateField(null=True, blank=True)
    snoozed_until = models.DateTimeField(null=True, blank=True)
    dismissed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["user", "event"], name="evt_attention_user_event"),
        ]
