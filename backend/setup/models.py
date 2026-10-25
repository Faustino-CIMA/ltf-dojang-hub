from django.conf import settings
from django.db import models


class SetupState(models.Model):
    class Step(models.TextChoices):
        CLUBS = "clubs", "Clubs"
        MEMBERS = "members", "Members"
        ADMINS = "admins", "Admins"
        DONE = "done", "Done"

    started_at = models.DateTimeField(null=True, blank=True)
    started_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="setups_started",
    )
    current_step = models.CharField(max_length=16, choices=Step.choices, default=Step.CLUBS)
    completed_at = models.DateTimeField(null=True, blank=True)
    completed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="setups_completed",
    )
    step_results = models.JSONField(default=dict, blank=True)
    ltf_prefix_rewrite = models.BooleanField(default=False)

    def save(self, *args, **kwargs):
        if self.pk is None:
            self.pk = 1
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Setup ({self.current_step})"
