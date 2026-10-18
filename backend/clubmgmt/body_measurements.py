"""Dated height and weight entries for a club member.

Club admins and coaches of a club with the club-management module record
these. The rows stay on the member so a later federation screen can read
them. That screen is not built yet, and LTF roles cannot read them here.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal, InvalidOperation

from django.conf import settings
from django.db import models
from django.db.models import OuterRef, Subquery
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from modules.entitlements import _stored_ids_for, is_install_entitled
from modules.models import ClubModuleAssignment
from modules.registry import CLUB_MANAGEMENT_MODULE_ID

WEIGHT_MIN = Decimal("10")
WEIGHT_MAX = Decimal("250")
HEIGHT_MIN = 80
HEIGHT_MAX = 230

# World Taekwondo Kyorugi ceilings, Article 5 of the Competition Rules &
# Interpretation in force 30 September 2024. A weight that does not exceed
# the ceiling stays in that class. The last ceiling is the open class above it.
# Men are listed first, women second. These are the world categories, not the
# shorter Olympic sets.
_KYORUGI_CEILINGS = {
    ("cadet", "M"): (33, 37, 41, 45, 49, 53, 57, 61, 65),
    ("cadet", "F"): (29, 33, 37, 41, 44, 47, 51, 55, 59),
    ("junior", "M"): (45, 48, 51, 55, 59, 63, 68, 73, 78),
    ("junior", "F"): (42, 44, 46, 49, 52, 55, 59, 63, 68),
    ("senior", "M"): (54, 58, 63, 68, 74, 80, 87),
    ("senior", "F"): (46, 49, 53, 57, 62, 67, 73),
}


class BodyMeasurement(models.Model):
    member = models.ForeignKey(
        "members.Member",
        on_delete=models.CASCADE,
        related_name="body_measurements",
    )
    measured_on = models.DateField()
    weight_kg = models.DecimalField(max_digits=5, decimal_places=1, null=True, blank=True)
    height_cm = models.PositiveSmallIntegerField(null=True, blank=True)
    note = models.CharField(max_length=240, blank=True)
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="recorded_body_measurements",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-measured_on", "-id"]
        indexes = [
            models.Index(fields=["member", "measured_on"], name="body_measure_member_date_idx"),
        ]

    def __str__(self) -> str:
        return f"{self.member_id} · {self.measured_on}"


def measurement_club_ids(user) -> set[int]:
    """Clubs whose measurements this user may read and write. Empty for everyone else."""
    if not user or not getattr(user, "is_authenticated", False):
        return set()
    role = getattr(user, "role", "")
    if role == "club_admin":
        club_ids = set(user.clubs_administered.values_list("id", flat=True))
    elif role == "coach":
        club_ids = set(user.clubs_administered.values_list("id", flat=True))
        club_ids.update(user.clubs_trained.values_list("id", flat=True))
    else:
        return set()
    if not club_ids or not is_install_entitled(CLUB_MANAGEMENT_MODULE_ID):
        return set()
    return set(
        ClubModuleAssignment.objects.filter(
            club_id__in=club_ids,
            module_id__in=_stored_ids_for(CLUB_MANAGEMENT_MODULE_ID),
            enabled=True,
        ).values_list("club_id", flat=True)
    )


def can_record_measurements(user, club_id: int | None) -> bool:
    if club_id is None:
        return False
    return club_id in measurement_club_ids(user)


def annotate_latest_measurements(queryset, club_ids: set[int]):
    if not club_ids:
        return queryset
    weight_rows = BodyMeasurement.objects.filter(
        member_id=OuterRef("pk"),
        weight_kg__isnull=False,
        member__club_id__in=club_ids,
    ).order_by("-measured_on", "-id")
    height_rows = BodyMeasurement.objects.filter(
        member_id=OuterRef("pk"),
        height_cm__isnull=False,
        member__club_id__in=club_ids,
    ).order_by("-measured_on", "-id")
    return queryset.annotate(
        latest_weight_kg=Subquery(weight_rows.values("weight_kg")[:1]),
        latest_weight_on=Subquery(weight_rows.values("measured_on")[:1]),
        latest_height_cm=Subquery(height_rows.values("height_cm")[:1]),
        latest_height_on=Subquery(height_rows.values("measured_on")[:1]),
    )


def suggest_age_class(date_of_birth, season_year: int) -> str:
    """Same bands as a squad selection, including the last-year move-up."""
    if date_of_birth is None or not season_year:
        return ""
    age = season_year - date_of_birth.year
    if age < 0 or date_of_birth.year < 1900:
        return ""
    if age < 7:
        return "youth"
    if age <= 8:
        return "pupils"
    if age <= 10:
        return "minimes"
    if age == 11:
        return "cadet"
    if age <= 13:
        return "cadet"
    if age == 14:
        return "junior"
    if age <= 16:
        return "junior"
    return "senior"


def kyorugi_category(weight_kg: Decimal, age_class: str, sex: str) -> str:
    ceilings = _KYORUGI_CEILINGS.get((age_class, sex))
    if ceilings is None or weight_kg is None:
        return ""
    for ceiling in ceilings:
        if weight_kg <= Decimal(ceiling):
            return f"-{ceiling} kg"
    return f"+{ceilings[-1]} kg"


def weight_close_to_limit(delta: str | None, category: str, margin: Decimal) -> bool:
    """True when a closed class is over its ceiling, or within the margin under it.

    The open class has no upper limit, so it is never marked.
    """
    if not category.startswith("-") or delta in (None, ""):
        return False
    return Decimal(delta) >= -Decimal(margin)


def kyorugi_margin(weight_kg: Decimal | None, age_class: str, sex: str) -> tuple[str, str | None]:
    """Category plus kilograms over or under that category's limit.

    A closed class uses its ceiling. The open class uses the last ceiling.
    On the limit the margin is 0.0. Pupils, Minimes, and Youth have no class.
    """
    if weight_kg is None:
        return "", None
    weight = Decimal(weight_kg)
    category = kyorugi_category(weight, age_class, sex)
    if not category:
        return "", None
    limit = Decimal(category[1:].split()[0])
    delta = (weight - limit).quantize(Decimal("0.1"))
    return category, f"{delta:.1f}"


# Individual recognized Poomsae divisions, Article 4.1.5 and Article 6.1 of the
# World Taekwondo Poomsae Competition Rules & Interpretation in force
# 30 September 2024. Age is the year of the championships, not the date.
# Pair and team divisions use wider bands and are not used here. Under 12 has
# no individual division.
# https://aliansitaekwondo.com/wp-content/uploads/2025/03/WT-Poomsae-Competition-Rules-and-Interpretation-In-force-as-of-September-30-2024.pdf
def poomsae_division(date_of_birth, season_year: int) -> str:
    if date_of_birth is None or not season_year or date_of_birth.year < 1900:
        return ""
    age = season_year - date_of_birth.year
    if age < 12:
        return ""
    if age <= 14:
        return "cadet"
    if age <= 17:
        return "junior"
    if age <= 30:
        return "under_30"
    if age <= 40:
        return "under_40"
    if age <= 50:
        return "under_50"
    if age <= 60:
        return "under_60"
    if age <= 65:
        return "under_65"
    return "over_65"


def weight_suggestion(member) -> dict | None:
    latest = (
        BodyMeasurement.objects.filter(member=member, weight_kg__isnull=False)
        .order_by("-measured_on", "-id")
        .first()
    )
    if latest is None:
        return None
    age_class = suggest_age_class(member.date_of_birth, timezone.localdate().year)
    category = kyorugi_category(latest.weight_kg, age_class, member.sex)
    if not category:
        return None
    return {
        "age_class": age_class,
        "category": category,
        "weight_kg": f"{latest.weight_kg:.1f}",
        "measured_on": latest.measured_on.isoformat(),
    }


def _parse_date(value):
    if isinstance(value, date):
        return value
    if value in (None, ""):
        raise ValidationError({"measured_on": "date_required"})
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError as exc:
        raise ValidationError({"measured_on": "date_required"}) from exc


def _parse_weight(value):
    if value in (None, ""):
        return None
    try:
        weight = Decimal(str(value))
    except (InvalidOperation, ValueError) as exc:
        raise ValidationError({"weight_kg": "weight_out_of_range"}) from exc
    if weight.as_tuple().exponent < -1:
        raise ValidationError({"weight_kg": "weight_out_of_range"})
    if weight < WEIGHT_MIN or weight > WEIGHT_MAX:
        raise ValidationError({"weight_kg": "weight_out_of_range"})
    return weight.quantize(Decimal("0.1"))


def _parse_height(value):
    if value in (None, ""):
        return None
    try:
        if isinstance(value, str) and "." in value:
            raise ValueError
        height = int(value)
    except (TypeError, ValueError) as exc:
        raise ValidationError({"height_cm": "height_out_of_range"}) from exc
    if height < HEIGHT_MIN or height > HEIGHT_MAX:
        raise ValidationError({"height_cm": "height_out_of_range"})
    return height


def apply_measurement_fields(measurement: BodyMeasurement, data: dict, *, creating: bool) -> None:
    if creating or "measured_on" in data:
        measurement.measured_on = _parse_date(data.get("measured_on"))
    if creating or "weight_kg" in data:
        measurement.weight_kg = _parse_weight(data.get("weight_kg"))
    if creating or "height_cm" in data:
        measurement.height_cm = _parse_height(data.get("height_cm"))
    if creating or "note" in data:
        measurement.note = str(data.get("note") or "").strip()[:240]
    if measurement.weight_kg is None and measurement.height_cm is None:
        raise ValidationError({"weight_kg": "measurement_required"})
