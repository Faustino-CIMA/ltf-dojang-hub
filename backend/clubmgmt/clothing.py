"""Club-defined clothing sizes.

Protectors and electronic gear stay on fixed manufacturer scales. A club
lists the clothes it actually orders. Deleting a size or an item keeps the
label already stored on a member.
"""

from django.db import models, transaction
from django.db.models import Count, Q
from rest_framework.exceptions import ValidationError

from .clothing_presets import DEFAULT_ITEMS, PRESET_BY_ID, PRESETS

CM_FIELDS = ("chest_cm", "length_cm", "height_min_cm", "height_max_cm")


class ClubClothingItem(models.Model):
    club = models.ForeignKey("clubs.Club", on_delete=models.CASCADE, related_name="clothing_items")
    name = models.CharField(max_length=80)
    note = models.CharField(max_length=120, blank=True)
    position = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["position", "id"]

    def __str__(self) -> str:
        return self.name


class ClubClothingSize(models.Model):
    item = models.ForeignKey(ClubClothingItem, on_delete=models.CASCADE, related_name="sizes")
    label = models.CharField(max_length=16)
    age = models.CharField(max_length=32, blank=True)
    chest_cm = models.PositiveSmallIntegerField(null=True, blank=True)
    length_cm = models.PositiveSmallIntegerField(null=True, blank=True)
    height_min_cm = models.PositiveSmallIntegerField(null=True, blank=True)
    height_max_cm = models.PositiveSmallIntegerField(null=True, blank=True)
    position = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["position", "id"]
        constraints = [
            models.UniqueConstraint(fields=["item", "label"], name="clothing_size_item_label"),
        ]

    def __str__(self) -> str:
        return f"{self.item_id}:{self.label}"


class MemberClothingValue(models.Model):
    member = models.ForeignKey("members.Member", on_delete=models.CASCADE, related_name="clothing_values")
    item = models.ForeignKey(
        ClubClothingItem,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="values",
    )
    item_name = models.CharField(max_length=80)
    label = models.CharField(max_length=16)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["member", "item"],
                condition=Q(item__isnull=False),
                name="clothing_value_member_item",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.member_id}:{self.item_name}:{self.label}"


def seed_default_clothing(club) -> None:
    """Dobok and T-shirt for a new club. Existing lists are left alone."""
    if ClubClothingItem.objects.filter(club=club).exists():
        return
    for position, (name, preset_id) in enumerate(DEFAULT_ITEMS):
        item = ClubClothingItem.objects.create(club=club, name=name, position=position)
        _write_sizes(item, PRESET_BY_ID[preset_id]["sizes"])


def public_presets() -> list[dict]:
    return [{"id": preset["id"], "sizes": preset["sizes"]} for preset in PRESETS]


def _cm(value, field: str):
    if value is None or value == "":
        return None
    if isinstance(value, bool) or isinstance(value, float) or not isinstance(value, (int, str)):
        raise ValidationError({field: "size_invalid"})
    try:
        number = int(str(value))
    except (TypeError, ValueError):
        raise ValidationError({field: "size_invalid"}) from None
    if str(value).strip() != str(number) or number < 1 or number > 400:
        raise ValidationError({field: "size_invalid"})
    return number


def _clean_sizes(raw) -> list[dict]:
    if not isinstance(raw, list):
        raise ValidationError({"sizes": "size_invalid"})
    cleaned = []
    seen = set()
    for entry in raw:
        if not isinstance(entry, dict):
            raise ValidationError({"sizes": "size_invalid"})
        label = str(entry.get("label") or "").strip()
        if not label or len(label) > 16 or label in seen:
            raise ValidationError({"sizes": "size_invalid"})
        seen.add(label)
        age = str(entry.get("age") or "").strip()
        if len(age) > 32:
            raise ValidationError({"age": "size_invalid"})
        cleaned.append(
            {
                "label": label,
                "age": age,
                "position": len(cleaned),
                **{field: _cm(entry.get(field), field) for field in CM_FIELDS},
            }
        )
    return cleaned


def _write_sizes(item: ClubClothingItem, sizes: list[dict]) -> None:
    item.sizes.all().delete()
    ClubClothingSize.objects.bulk_create(
        [
            ClubClothingSize(
                item=item,
                label=size["label"],
                age=size.get("age") or "",
                chest_cm=size.get("chest_cm"),
                length_cm=size.get("length_cm"),
                height_min_cm=size.get("height_min_cm"),
                height_max_cm=size.get("height_max_cm"),
                position=index,
            )
            for index, size in enumerate(sizes)
        ]
    )


def _clean_text(value, field: str, limit: int, required: bool) -> str:
    text = str(value or "").strip()
    if required and not text:
        raise ValidationError({field: "required"})
    if len(text) > limit:
        raise ValidationError({field: "size_invalid"})
    return text


def size_payload(size: ClubClothingSize) -> dict:
    return {
        "label": size.label,
        "age": size.age,
        "chest_cm": size.chest_cm,
        "length_cm": size.length_cm,
        "height_min_cm": size.height_min_cm,
        "height_max_cm": size.height_max_cm,
    }


def item_payload(item: ClubClothingItem) -> dict:
    count = getattr(item, "member_count", None)
    if count is None:
        count = item.values.exclude(label="").count()
    return {
        "id": item.id,
        "club": item.club_id,
        "name": item.name,
        "note": item.note,
        "position": item.position,
        "member_count": count,
        "sizes": [size_payload(size) for size in item.sizes.all()],
    }


def items_for_club(club_id: int):
    return (
        ClubClothingItem.objects.filter(club_id=club_id)
        .annotate(member_count=Count("values", filter=Q(values__label__gt="")))
        .prefetch_related("sizes")
        .order_by("position", "id")
    )


@transaction.atomic
def create_item(club, data) -> ClubClothingItem:
    if not isinstance(data, dict):
        raise ValidationError({"name": "required"})
    item = ClubClothingItem.objects.create(
        club=club,
        name=_clean_text(data.get("name"), "name", 80, required=True),
        note=_clean_text(data.get("note"), "note", 120, required=False),
        position=ClubClothingItem.objects.filter(club=club).count(),
    )
    _write_sizes(item, _clean_sizes(data.get("sizes") or []))
    return items_for_club(club.id).get(pk=item.id)


@transaction.atomic
def update_item(item: ClubClothingItem, data) -> ClubClothingItem:
    if not isinstance(data, dict):
        raise ValidationError({"name": "required"})
    if "name" in data:
        item.name = _clean_text(data.get("name"), "name", 80, required=True)
    if "note" in data:
        item.note = _clean_text(data.get("note"), "note", 120, required=False)
    item.save(update_fields=["name", "note"])
    MemberClothingValue.objects.filter(item=item).update(item_name=item.name)
    if "sizes" in data:
        _write_sizes(item, _clean_sizes(data.get("sizes")))
    return items_for_club(item.club_id).get(pk=item.id)


@transaction.atomic
def delete_clothing_item(item: ClubClothingItem) -> None:
    MemberClothingValue.objects.filter(item=item).update(item_name=item.name)
    item.delete()


@transaction.atomic
def reorder_items(club, order) -> None:
    items = list(ClubClothingItem.objects.filter(club=club).order_by("position", "id"))
    if not isinstance(order, list):
        raise ValidationError({"order": "size_invalid"})
    try:
        wanted = [int(item_id) for item_id in order]
    except (TypeError, ValueError):
        raise ValidationError({"order": "size_invalid"}) from None
    if sorted(wanted) != sorted(item.id for item in items):
        raise ValidationError({"order": "size_invalid"})
    for position, item_id in enumerate(wanted):
        ClubClothingItem.objects.filter(pk=item_id, club=club).update(position=position)


def _member_values(member):
    cache = getattr(member, "_prefetched_objects_cache", {})
    if "clothing_values" in cache:
        return list(member.clothing_values.all())
    return list(MemberClothingValue.objects.filter(member=member).select_related("item"))


def clothing_choices(member, items=None) -> list[dict]:
    if items is None:
        items = list(
            ClubClothingItem.objects.filter(club_id=member.club_id).prefetch_related("sizes").order_by("position", "id")
        )
    catalog_ids = {item.id for item in items}
    by_item = {}
    orphans = []
    for value in _member_values(member):
        if value.item_id and value.item_id in catalog_ids:
            by_item[value.item_id] = value
        elif value.label:
            orphans.append(value)
    rows = []
    for item in items:
        value = by_item.get(item.id)
        sizes = list(item.sizes.all())
        labels = {size.label for size in sizes}
        label = value.label if value else ""
        rows.append(
            {
                "item": item.id,
                "value": value.id if value else None,
                "name": item.name,
                "note": item.note,
                "label": label,
                "offered": not label or label in labels,
                "retired": False,
                "sizes": [size_payload(size) for size in sizes],
            }
        )
    for value in orphans:
        rows.append(
            {
                "item": None,
                "value": value.id,
                "name": value.item_name,
                "note": "",
                "label": value.label,
                "offered": False,
                "retired": True,
                "sizes": [],
            }
        )
    return rows


def prepare_clothing(member, entries):
    """Validate a gear save. None means the request did not mention clothing."""
    if entries is None:
        return None
    if not isinstance(entries, list):
        raise ValidationError({"clothing": "size_invalid"})
    items = {
        item.id: item
        for item in ClubClothingItem.objects.filter(club_id=member.club_id).prefetch_related("sizes")
    }
    existing = {
        row.item_id: row
        for row in MemberClothingValue.objects.filter(member=member, item_id__isnull=False).select_related("item")
        if row.item_id in items
    }
    orphan_rows = [
        row
        for row in MemberClothingValue.objects.filter(member=member).select_related("item")
        if row.item_id is None or row.item_id not in items
    ]
    orphans = {row.id: row for row in orphan_rows}
    plan = []
    seen = set()
    errors = {}
    for index, entry in enumerate(entries):
        if not isinstance(entry, dict):
            errors[str(index)] = "size_invalid"
            continue
        label = str(entry.get("label") or "").strip()
        if len(label) > 16:
            errors[str(index)] = "size_invalid"
            continue
        raw_item = entry.get("item")
        if raw_item not in (None, ""):
            try:
                item_id = int(raw_item)
            except (TypeError, ValueError):
                errors[str(index)] = "size_invalid"
                continue
            item = items.get(item_id)
            if item is None or item_id in seen:
                errors[str(index)] = "size_invalid"
                continue
            seen.add(item_id)
            current = existing.get(item_id)
            allowed = {size.label for size in item.sizes.all()}
            if label and label not in allowed and not (current and current.label == label):
                errors[str(index)] = "size_invalid"
                continue
            plan.append(("item", item, current, label))
            continue
        raw_value = entry.get("value")
        if raw_value in (None, ""):
            continue
        try:
            value_id = int(raw_value)
        except (TypeError, ValueError):
            errors[str(index)] = "size_invalid"
            continue
        row = orphans.get(value_id)
        if row is None or (label and label != row.label):
            errors[str(index)] = "size_invalid"
            continue
        plan.append(("orphan", row, label))
    if errors:
        raise ValidationError({"clothing": errors})
    return plan


@transaction.atomic
def apply_clothing_plan(member, plan) -> None:
    if plan is None:
        return
    for kind, *rest in plan:
        if kind == "item":
            item, current, label = rest
            if not label:
                if current is not None:
                    current.delete()
                continue
            if current is None:
                MemberClothingValue.objects.create(member=member, item=item, item_name=item.name, label=label)
            else:
                current.label = label
                current.item_name = item.name
                current.save(update_fields=["label", "item_name"])
        else:
            row, label = rest
            if not label:
                row.delete()
