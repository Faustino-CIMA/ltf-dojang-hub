from django.db import migrations, models


def _write_sizes(Size, item, sizes):
    for position, size in enumerate(sizes):
        Size.objects.create(
            item_id=item.id,
            label=size["label"],
            age=size.get("age") or "",
            chest_cm=size.get("chest_cm"),
            length_cm=size.get("length_cm"),
            height_min_cm=size.get("height_min_cm"),
            height_max_cm=size.get("height_max_cm"),
            position=position,
        )


def _seed_club(Item, Size, club_id):
    if Item.objects.filter(club_id=club_id).exists():
        return
    from clubmgmt.clothing_presets import DEFAULT_ITEMS, PRESET_BY_ID

    for position, (name, preset_id) in enumerate(DEFAULT_ITEMS):
        item = Item.objects.create(club_id=club_id, name=name, note="", position=position)
        _write_sizes(Size, item, PRESET_BY_ID[preset_id]["sizes"])


def _ensure_label(Size, item, label):
    if Size.objects.filter(item_id=item.id, label=label).exists():
        return
    position = Size.objects.filter(item_id=item.id).count()
    Size.objects.create(
        item_id=item.id,
        label=label,
        age="",
        chest_cm=None,
        length_cm=None,
        height_min_cm=None,
        height_max_cm=None,
        position=position,
    )


def copy_fixed_clothing(apps, schema_editor):
    Club = apps.get_model("clubs", "Club")
    Member = apps.get_model("members", "Member")
    Gear = apps.get_model("clubmgmt", "MemberGear")
    Item = apps.get_model("clubmgmt", "ClubClothingItem")
    Size = apps.get_model("clubmgmt", "ClubClothingSize")
    Value = apps.get_model("clubmgmt", "MemberClothingValue")
    for club in Club.objects.all().only("id"):
        _seed_club(Item, Size, club.id)
    for gear in Gear.objects.all().iterator():
        pairs = (("Dobok", gear.dobok), ("T-shirt", gear.tshirt))
        if not any(label for _name, label in pairs):
            continue
        member = Member.objects.filter(pk=gear.member_id).only("id", "club_id").first()
        if member is None:
            continue
        for name, label in pairs:
            label = (label or "").strip()
            if not label:
                continue
            item = Item.objects.filter(club_id=member.club_id, name=name).order_by("position", "id").first()
            if item is None:
                continue
            _ensure_label(Size, item, label)
            Value.objects.create(member_id=member.id, item_id=item.id, item_name=name, label=label)


def restore_fixed_clothing(apps, schema_editor):
    Gear = apps.get_model("clubmgmt", "MemberGear")
    Item = apps.get_model("clubmgmt", "ClubClothingItem")
    Value = apps.get_model("clubmgmt", "MemberClothingValue")
    for value in Value.objects.all().iterator():
        name = value.item_name
        if value.item_id:
            item = Item.objects.filter(pk=value.item_id).only("id", "name").first()
            if item is not None:
                name = item.name
        field = {"Dobok": "dobok", "T-shirt": "tshirt"}.get(name)
        if field is None or not value.label or len(value.label) > 8:
            continue
        gear, _created = Gear.objects.get_or_create(member_id=value.member_id)
        setattr(gear, field, value.label)
        gear.save(update_fields=[field])


class Migration(migrations.Migration):

    dependencies = [
        ("clubmgmt", "0034_team_pss_system"),
    ]

    operations = [
        migrations.CreateModel(
            name="ClubClothingItem",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=80)),
                ("note", models.CharField(blank=True, max_length=120)),
                ("position", models.PositiveIntegerField(default=0)),
                (
                    "club",
                    models.ForeignKey(
                        on_delete=models.deletion.CASCADE,
                        related_name="clothing_items",
                        to="clubs.club",
                    ),
                ),
            ],
            options={"ordering": ["position", "id"]},
        ),
        migrations.CreateModel(
            name="ClubClothingSize",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("label", models.CharField(max_length=16)),
                ("age", models.CharField(blank=True, max_length=32)),
                ("chest_cm", models.PositiveSmallIntegerField(blank=True, null=True)),
                ("length_cm", models.PositiveSmallIntegerField(blank=True, null=True)),
                ("height_min_cm", models.PositiveSmallIntegerField(blank=True, null=True)),
                ("height_max_cm", models.PositiveSmallIntegerField(blank=True, null=True)),
                ("position", models.PositiveIntegerField(default=0)),
                (
                    "item",
                    models.ForeignKey(
                        on_delete=models.deletion.CASCADE,
                        related_name="sizes",
                        to="clubmgmt.clubclothingitem",
                    ),
                ),
            ],
            options={
                "ordering": ["position", "id"],
                "constraints": [
                    models.UniqueConstraint(fields=("item", "label"), name="clothing_size_item_label"),
                ],
            },
        ),
        migrations.CreateModel(
            name="MemberClothingValue",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("item_name", models.CharField(max_length=80)),
                ("label", models.CharField(max_length=16)),
                (
                    "item",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=models.deletion.SET_NULL,
                        related_name="values",
                        to="clubmgmt.clubclothingitem",
                    ),
                ),
                (
                    "member",
                    models.ForeignKey(
                        on_delete=models.deletion.CASCADE,
                        related_name="clothing_values",
                        to="members.member",
                    ),
                ),
            ],
            options={
                "constraints": [
                    models.UniqueConstraint(
                        condition=models.Q(("item__isnull", False)),
                        fields=("member", "item"),
                        name="clothing_value_member_item",
                    ),
                ],
            },
        ),
        migrations.RunPython(copy_fixed_clothing, restore_fixed_clothing),
        migrations.RemoveField(model_name="membergear", name="dobok"),
        migrations.RemoveField(model_name="membergear", name="tshirt"),
    ]
