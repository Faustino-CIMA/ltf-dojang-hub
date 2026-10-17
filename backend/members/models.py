from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.utils.translation import gettext_lazy as _
from django.utils import timezone
from typing import TYPE_CHECKING, cast

from clubs.models import Club


class Member(models.Model):
    class Sex(models.TextChoices):
        MALE = "M", _("Male")
        FEMALE = "F", _("Female")

    class LicenseRole(models.TextChoices):
        ATHLETE = "Athlete", _("Athlete")
        COACH = "Coach", _("Coach")
        REFEREE = "Referee", _("Referee")
        OFFICIAL = "Official", _("Official")
        DOCTOR = "Doctor", _("Doctor")
        PHYSIOTHERAPIST = "Physiotherapist", _("Physiotherapist")
        VOLUNTEER = "Volunteer", _("Volunteer")
        STAFF = "Staff", _("Staff")
        MEDIA = "Media", _("Media")
        FAN = "Fan", _("Fan")

    @classmethod
    def canonicalize_license_role(cls, value) -> str:
        raw = str(value or "").strip()
        if not raw:
            return ""
        collapsed = " ".join(raw.lower().replace("_", " ").replace("-", " ").split())
        lookup = {str(choice.value).lower(): str(choice.value) for choice in cls.LicenseRole}
        return lookup.get(collapsed, "")

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="member_profile",
    )
    # Empty for LTF staff who are not in a club. A club member may also hold a staff function.
    club = models.ForeignKey(
        Club,
        on_delete=models.PROTECT,
        related_name="members",
        null=True,
        blank=True,
    )
    first_name = models.CharField(max_length=150)
    last_name = models.CharField(max_length=150)
    sex = models.CharField(max_length=1, choices=Sex.choices, default=Sex.MALE)
    email = models.EmailField(blank=True)
    wt_licenseid = models.CharField(max_length=20, blank=True)
    ltf_licenseid = models.CharField(max_length=20, blank=True)
    date_of_birth = models.DateField(null=True, blank=True)
    belt_rank = models.CharField(max_length=100, blank=True)
    primary_license_role = models.CharField(
        max_length=32,
        choices=LicenseRole.choices,
        blank=True,
    )
    secondary_license_role = models.CharField(
        max_length=32,
        choices=LicenseRole.choices,
        blank=True,
    )
    profile_picture_original = models.ImageField(
        upload_to="members/profile_pictures/original/",
        null=True,
        blank=True,
    )
    profile_picture_processed = models.ImageField(
        upload_to="members/profile_pictures/processed/",
        null=True,
        blank=True,
    )
    profile_picture_thumbnail = models.ImageField(
        upload_to="members/profile_pictures/thumbnails/",
        null=True,
        blank=True,
    )
    photo_edit_metadata = models.JSONField(default=dict, blank=True)
    photo_consent_attested_at = models.DateTimeField(null=True, blank=True)
    photo_consent_attested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="photo_consent_attestations",
    )
    is_active = models.BooleanField(default=True)  # type: ignore[call-arg]
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=["club", "is_active"], name="member_club_active_idx"),
            models.Index(
                fields=["club", "last_name", "first_name"],
                name="member_club_name_idx",
            ),
        ]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(secondary_license_role="")
                | ~models.Q(primary_license_role=""),
                name="member_secondary_role_requires_primary",
            ),
            models.CheckConstraint(
                condition=models.Q(primary_license_role="")
                | ~models.Q(primary_license_role=models.F("secondary_license_role")),
                name="member_primary_secondary_role_must_differ",
            ),
            models.UniqueConstraint(
                fields=["wt_licenseid"],
                condition=~models.Q(wt_licenseid=""),
                name="member_unique_nonblank_wt_licenseid",
            ),
            models.UniqueConstraint(
                fields=["ltf_licenseid"],
                condition=~models.Q(ltf_licenseid=""),
                name="member_unique_nonblank_ltf_licenseid",
            ),
        ]

    @staticmethod
    def normalize_first_name(value) -> str:
        first_name_value = str(value or "").strip()
        if not first_name_value:
            return ""
        formatted_words = []
        for word in first_name_value.split():
            if "-" in word:
                formatted_words.append("-".join(part.capitalize() for part in word.split("-")))
            else:
                formatted_words.append(word.capitalize())
        return " ".join(formatted_words)

    @staticmethod
    def normalize_last_name(value) -> str:
        last_name_value = str(value or "").strip()
        if not last_name_value:
            return ""
        formatted_words = []
        for word in last_name_value.split():
            if "-" in word:
                formatted_words.append("-".join(part.upper() for part in word.split("-")))
            else:
                formatted_words.append(word.upper())
        return " ".join(formatted_words)

    def save(self, *args, **kwargs):
        # Normalize names for consistent display/searching.
        self.first_name = self.normalize_first_name(self.first_name)
        self.last_name = self.normalize_last_name(self.last_name)
        primary_role = self.canonicalize_license_role(self.primary_license_role)
        if primary_role:
            self.primary_license_role = primary_role
        secondary_role = self.canonicalize_license_role(self.secondary_license_role)
        if secondary_role:
            self.secondary_license_role = secondary_role
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.first_name} {self.last_name}"


class LtfStaffFunction(models.Model):
    """A dated LTF job. It can sit on a club member or on someone with no club."""

    class Function(models.TextChoices):
        SECRETARY = "secretary", _("Secretary")
        COACH = "coach", _("LTF Coach")
        MEDIC = "medic", _("LTF Medic")
        MEDIA = "media", _("LTF Media")
        OTHER = "other", _("Other staff")

    member = models.ForeignKey(
        Member,
        on_delete=models.CASCADE,
        related_name="ltf_staff_functions",
    )
    function = models.CharField(max_length=32, choices=Function.choices)
    started_on = models.DateField(null=True, blank=True)
    # Exclusive end, matching committee terms: the function is held while day < ended_on.
    ended_on = models.DateField(null=True, blank=True)
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="recorded_ltf_staff_functions",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-started_on", "-id"]
        indexes = [
            models.Index(fields=["member", "ended_on"], name="ltf_staff_member_end_idx"),
        ]

    def clean(self):
        if self.started_on and self.ended_on and self.ended_on < self.started_on:
            raise ValidationError({"ended_on": _("End must be on or after the start.")})

    def __str__(self):
        return f"{self.member} · {self.function}"


class MemberLicenseIdCounter(models.Model):
    class Prefix(models.TextChoices):
        LUX = "LUX", _("LUX")
        LTF = "LTF", _("LTF")

    prefix = models.CharField(max_length=8, choices=Prefix.choices, unique=True)
    next_value = models.PositiveBigIntegerField(default=1)  # type: ignore[call-arg]
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.prefix} -> {self.next_value}"


class GradePromotionHistory(models.Model):
    member = models.ForeignKey(
        Member, on_delete=models.CASCADE, related_name="grade_history"
    )
    club = models.ForeignKey(
        Club, on_delete=models.PROTECT, related_name="grade_history"
    )
    examiner_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="examined_grade_promotions",
    )
    from_grade = models.CharField(max_length=100, blank=True)
    to_grade = models.CharField(max_length=100)
    promotion_date = models.DateField(default=timezone.localdate)
    exam_date = models.DateField(null=True, blank=True)
    proof_ref = models.CharField(max_length=255, blank=True)
    notes = models.TextField(blank=True)
    created_by = models.CharField(max_length=255, blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-promotion_date", "-created_at"]
        indexes = [
            models.Index(fields=["member", "-promotion_date"]),
            models.Index(fields=["club", "-promotion_date"]),
        ]

    if TYPE_CHECKING:
        objects: models.Manager
        member_id: int | None
        club_id: int | None

    def clean(self):
        member_id = cast(int | None, getattr(self, "member_id", None))
        club_id = cast(int | None, getattr(self, "club_id", None))
        member_club_id = cast(
            int | None, getattr(getattr(self, "member", None), "club_id", None)
        )

        if (
            member_id
            and club_id
            and member_club_id is not None
            and member_club_id != club_id
        ):
            raise ValidationError(_("Member does not belong to this club."))
        if self.exam_date and self.exam_date > self.promotion_date:
            raise ValidationError(_("Exam date cannot be after promotion date."))
        if member_id and self._state.adding:
            latest = (
                GradePromotionHistory.objects.filter(member_id=member_id)
                .order_by("-promotion_date", "-created_at")
                .first()
            )
            if latest and self.promotion_date < latest.promotion_date:
                raise ValidationError(
                    _(
                        "Promotion date cannot be earlier than the latest recorded promotion date."
                    )
                )

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError(_("Grade promotion history is append-only."))

    def __str__(self):
        return f"{self.member} · {self.from_grade} -> {self.to_grade}"


class MemberTransfer(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        COMPLETED = "completed", "Completed"
        REJECTED = "rejected", "Rejected"
        CANCELLED = "cancelled", "Cancelled"

    member = models.ForeignKey(Member, on_delete=models.PROTECT, related_name="transfers")
    from_club = models.ForeignKey(
        Club, on_delete=models.PROTECT, related_name="outgoing_member_transfers"
    )
    to_club = models.ForeignKey(
        Club, on_delete=models.PROTECT, related_name="incoming_member_transfers"
    )
    initiated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="initiated_member_transfers",
    )
    decided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="decided_member_transfers",
    )
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    fee_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    fee_currency = models.CharField(max_length=3, default="EUR")
    note = models.TextField(blank=True)
    ltf_notified = models.BooleanField(default=False)
    completed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["status", "-created_at"], name="mtr_status_created_idx"),
            models.Index(fields=["from_club", "status"], name="mtr_from_status_idx"),
            models.Index(fields=["to_club", "status"], name="mtr_to_status_idx"),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["member"],
                condition=models.Q(status="pending"),
                name="unique_pending_member_transfer",
            ),
            models.CheckConstraint(
                condition=~models.Q(from_club=models.F("to_club")),
                name="member_transfer_clubs_must_differ",
            ),
        ]

    def __str__(self):
        return f"{self.member} {self.from_club} -> {self.to_club} ({self.status})"


class MemberTransferMessage(models.Model):
    transfer = models.ForeignKey(
        MemberTransfer, on_delete=models.CASCADE, related_name="messages"
    )
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="member_transfer_messages",
    )
    body = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return f"Message on transfer {self.transfer_id}"
