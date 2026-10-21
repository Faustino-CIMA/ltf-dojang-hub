"""Current equipment sizes for one club member.

Club admins and coaches of a club with the competition module keep the
labels the athlete wears now. There is no history of older sizes. LTF
roles cannot read these rows.
"""

from django.db import models
from django.utils import timezone
from rest_framework.exceptions import ValidationError

DAEDO_SOCK = ("XXXS", "XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL", "XXXXL")
DAEDO_GLOVE = DAEDO_SOCK
DAEDO_HOGU = ("XXS", "XS", "S", "M", "L", "XL")
DAEDO_HEAD = ("XS", "S", "M", "L", "XL")
KPNP_SOCK = ("1", "2", "3", "4", "5", "6", "7", "8", "9", "10")
KPNP_GLOVE = ("XS", "S", "M", "L", "XL", "2XL")
KPNP_HOGU = ("0", "1", "2", "3", "4", "5")
KPNP_HEAD = ("XS", "S", "M", "L")
GENERIC_SIZE = ("XS", "S", "M", "L", "XL")
REGULAR_SIZE = ("XXS", "XS", "S", "M", "L", "XL", "XXL")
MOUTHGUARD = ("youth", "adult")
DOBOK = ("100", "110", "120", "130", "140", "150", "160", "170", "180", "190", "200", "210")
TSHIRT = ("98", "104", "110", "116", "128", "140", "152", "164", "XS", "S", "M", "L", "XL", "2XL", "3XL")
CLUB_TSHIRT = (
    "YXS",
    "YS",
    "YM",
    "YL",
    "YXL",
    "Y2XL",
    "Y3XL",
    "XXS",
    "XS",
    "S",
    "M",
    "L",
    "XL",
    "2XL",
    "3XL",
    "4XL",
    "5XL",
    "6XL",
    "7XL",
    "8XL",
    "9XL",
    "10XL",
)

GEAR_SCALES = {
    "daedo_sock": DAEDO_SOCK,
    "daedo_glove": DAEDO_GLOVE,
    "daedo_hogu": DAEDO_HOGU,
    "daedo_head": DAEDO_HEAD,
    "kpnp_sock": KPNP_SOCK,
    "kpnp_glove": KPNP_GLOVE,
    "kpnp_hogu": KPNP_HOGU,
    "kpnp_head": KPNP_HEAD,
    "chest": REGULAR_SIZE,
    "headgear": REGULAR_SIZE,
    "shin": GENERIC_SIZE,
    "forearm": GENERIC_SIZE,
    "groin": GENERIC_SIZE,
    "mouthguard": MOUTHGUARD,
    "dobok": DOBOK,
    "tshirt": TSHIRT,
    "club_tshirt": CLUB_TSHIRT,
}


class MemberGear(models.Model):
    member = models.OneToOneField(
        "members.Member",
        on_delete=models.CASCADE,
        related_name="gear",
    )
    daedo_sock = models.CharField(max_length=8, blank=True)
    daedo_glove = models.CharField(max_length=8, blank=True)
    daedo_hogu = models.CharField(max_length=8, blank=True)
    daedo_head = models.CharField(max_length=8, blank=True)
    kpnp_sock = models.CharField(max_length=8, blank=True)
    kpnp_glove = models.CharField(max_length=8, blank=True)
    kpnp_hogu = models.CharField(max_length=8, blank=True)
    kpnp_head = models.CharField(max_length=8, blank=True)
    chest = models.CharField(max_length=8, blank=True)
    headgear = models.CharField(max_length=8, blank=True)
    shin = models.CharField(max_length=8, blank=True)
    forearm = models.CharField(max_length=8, blank=True)
    groin = models.CharField(max_length=8, blank=True)
    mouthguard = models.CharField(max_length=8, blank=True)
    dobok = models.CharField(max_length=8, blank=True)
    tshirt = models.CharField(max_length=8, blank=True)
    club_tshirt = models.CharField(max_length=8, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f"gear:{self.member_id}"


def roster_gear(member) -> dict:
    try:
        row = member.gear
    except MemberGear.DoesNotExist:
        payload = {key: "" for key in GEAR_SCALES}
        payload["updated_at"] = None
        return payload
    payload = {key: getattr(row, key) or "" for key in GEAR_SCALES}
    payload["updated_at"] = timezone.localtime(row.updated_at).date().isoformat()
    return payload


def blank_gear_payload(member_id: int) -> dict:
    payload = {key: "" for key in GEAR_SCALES}
    payload["member"] = member_id
    payload["updated_at"] = None
    return payload


def gear_payload(member) -> dict:
    try:
        row = member.gear
    except MemberGear.DoesNotExist:
        return blank_gear_payload(member.id)
    return gear_row_payload(row)


def gear_row_payload(row: MemberGear) -> dict:
    payload = {key: getattr(row, key) or "" for key in GEAR_SCALES}
    payload["member"] = row.member_id
    payload["updated_at"] = timezone.localtime(row.updated_at).date().isoformat()
    return payload


def clean_gear_fields(data) -> dict:
    if not isinstance(data, dict):
        raise ValidationError({"gear": "size_invalid"})
    cleaned = {}
    errors = {}
    for key, allowed in GEAR_SCALES.items():
        if key not in data:
            continue
        value = str(data.get(key) or "").strip()
        if value and value not in allowed:
            errors[key] = "size_invalid"
            continue
        cleaned[key] = value
    if errors:
        raise ValidationError(errors)
    return cleaned
