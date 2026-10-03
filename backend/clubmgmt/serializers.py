from decimal import Decimal

from rest_framework import serializers

from members.models import Member

from .models import (
    Committee,
    CommitteeMandate,
    Family,
    FamilyMember,
    FamilyRebateRule,
    MedicalCheckup,
    MemberAddress,
    MemberContact,
    MemberEmail,
    MemberPhone,
    MemberRecord,
    MembershipFee,
    MembershipFeePrice,
    Person,
    PersonAddress,
    PersonEmail,
    PersonPhone,
    ShopItem,
    ShopSale,
    ShopSaleLine,
    ShopSnapshot,
    ShopSnapshotLine,
    ShopVariant,
)


class PersonEmailSerializer(serializers.ModelSerializer):
    class Meta:
        model = PersonEmail
        fields = ["id", "email", "use_for_invoice"]


class PersonPhoneSerializer(serializers.ModelSerializer):
    class Meta:
        model = PersonPhone
        fields = ["id", "number", "label"]


class PersonAddressSerializer(serializers.ModelSerializer):
    class Meta:
        model = PersonAddress
        fields = ["id", "street", "house_number", "line2", "postal_code", "locality", "country", "use_for_invoice"]


class PersonSerializer(serializers.ModelSerializer):
    emails = PersonEmailSerializer(many=True, required=False, read_only=True)
    phones = PersonPhoneSerializer(many=True, required=False, read_only=True)
    addresses = PersonAddressSerializer(many=True, required=False, read_only=True)

    class Meta:
        model = Person
        fields = [
            "id",
            "club",
            "first_name",
            "last_name",
            "sex",
            "converted_member",
            "emails",
            "phones",
            "addresses",
        ]


class MemberEmailSerializer(serializers.ModelSerializer):
    class Meta:
        model = MemberEmail
        fields = ["id", "email", "use_for_invoice"]


class MemberPhoneSerializer(serializers.ModelSerializer):
    class Meta:
        model = MemberPhone
        fields = ["id", "number", "label"]


class MemberAddressSerializer(serializers.ModelSerializer):
    class Meta:
        model = MemberAddress
        fields = ["id", "street", "house_number", "line2", "postal_code", "locality", "country", "use_for_invoice"]


class MedicalCheckupSerializer(serializers.ModelSerializer):
    class Meta:
        model = MedicalCheckup
        fields = ["id", "member", "checked_on", "valid_until", "notes", "created_at"]
        read_only_fields = ["created_at"]


class MemberContactSerializer(serializers.ModelSerializer):
    person_detail = PersonSerializer(source="person", read_only=True)

    class Meta:
        model = MemberContact
        fields = ["id", "member", "person", "person_detail", "relation", "is_emergency", "is_primary"]


class MemberRecordSerializer(serializers.ModelSerializer):
    emails = MemberEmailSerializer(source="member.club_emails", many=True, read_only=True)
    phones = MemberPhoneSerializer(source="member.club_phones", many=True, read_only=True)
    addresses = MemberAddressSerializer(source="member.club_addresses", many=True, read_only=True)
    last_checkup_on = serializers.SerializerMethodField()
    is_underage = serializers.SerializerMethodField()
    family_name = serializers.SerializerMethodField()
    member_name = serializers.SerializerMethodField()

    class Meta:
        model = MemberRecord
        fields = [
            "id",
            "member",
            "member_name",
            "social_security_number",
            "nationality_1",
            "nationality_2",
            "joined_at",
            "invoice_delivery",
            "membership_fee",
            "pays_license_fee",
            "medical_notes",
            "publish_facebook",
            "publish_instagram",
            "publish_x",
            "publish_tiktok",
            "publish_webpage",
            "publish_print",
            "emails",
            "phones",
            "addresses",
            "last_checkup_on",
            "is_underage",
            "family_name",
        ]

    def get_last_checkup_on(self, obj):
        checkup = obj.member.medical_checkups.first()
        return checkup.checked_on.isoformat() if checkup else None

    def get_is_underage(self, obj):
        return obj.is_underage()

    def get_family_name(self, obj):
        link = obj.member.family_links.select_related("family").order_by("id").first()
        return link.family.name if link is not None else ""

    def get_member_name(self, obj):
        return f"{obj.member.first_name} {obj.member.last_name}"

    def validate_social_security_number(self, value):
        from .models import validate_luxembourg_ssn

        if value:
            validate_luxembourg_ssn(value)
        return value

    def validate_membership_fee(self, value):
        if value is None:
            return value
        member = getattr(self.instance, "member", None)
        if member is not None and value.club_id != member.club_id:
            raise serializers.ValidationError("Choose a membership fee from this club.")
        return value


class FamilyMemberSerializer(serializers.ModelSerializer):
    member_name = serializers.SerializerMethodField()
    date_of_birth = serializers.DateField(source="member.date_of_birth", read_only=True, allow_null=True)
    is_underage = serializers.SerializerMethodField()
    dob_missing = serializers.SerializerMethodField()

    class Meta:
        model = FamilyMember
        fields = ["id", "member", "member_name", "sort_order", "date_of_birth", "is_underage", "dob_missing"]

    def get_member_name(self, obj):
        return f"{obj.member.first_name} {obj.member.last_name}"

    def get_is_underage(self, obj):
        from .guardians import is_underage_member

        return is_underage_member(obj.member)

    def get_dob_missing(self, obj):
        return not bool(obj.member.date_of_birth)


class FamilySerializer(serializers.ModelSerializer):
    memberships = FamilyMemberSerializer(many=True, read_only=True)
    guardians = serializers.SerializerMethodField()
    bill_to_name = serializers.SerializerMethodField()
    needs_recipient = serializers.SerializerMethodField()

    class Meta:
        model = Family
        fields = [
            "id",
            "club",
            "name",
            "invoice_member",
            "bill_to_person",
            "bill_to_name",
            "bill_to_delivery",
            "needs_recipient",
            "guardians",
            "memberships",
            "created_at",
        ]
        read_only_fields = ["created_at", "bill_to_name", "needs_recipient", "guardians"]

    def get_bill_to_name(self, obj):
        person = obj.bill_to_person
        if person is None:
            return ""
        return f"{person.first_name} {person.last_name}".strip()

    def get_needs_recipient(self, obj):
        from .guardians import needs_explicit_recipient, ordered_memberships

        return needs_explicit_recipient(obj, ordered_memberships(obj))

    def get_guardians(self, obj):
        from .guardians import PARENT_RELATIONS

        seen = set()
        rows = []
        for link in obj.memberships.all():
            for contact in link.member.club_contacts.all():
                if contact.relation not in PARENT_RELATIONS and not contact.is_primary:
                    continue
                if contact.person_id in seen:
                    continue
                seen.add(contact.person_id)
                person = contact.person
                emails = list(person.emails.all())
                preferred = [row.email for row in emails if row.use_for_invoice and row.email]
                phones = list(person.phones.all())
                rows.append(
                    {
                        "person_id": person.id,
                        "member_id": person.converted_member_id,
                        "name": f"{person.first_name} {person.last_name}".strip(),
                        "relation": contact.relation,
                        "email": preferred[0] if preferred else (emails[0].email if emails else ""),
                        "phone": phones[0].number if phones else "",
                        "is_primary": contact.is_primary,
                    }
                )
        return rows

    def validate(self, attrs):
        club = attrs.get("club") or (self.instance.club if self.instance is not None else None)
        invoice_member = attrs.get("invoice_member", serializers.empty)
        bill_to_person = attrs.get("bill_to_person", serializers.empty)
        if invoice_member not in (serializers.empty, None) and club is not None and invoice_member.club_id != club.id:
            raise serializers.ValidationError({"invoice_member": "Choose a member of this club."})
        if bill_to_person not in (serializers.empty, None) and club is not None and bill_to_person.club_id != club.id:
            raise serializers.ValidationError({"bill_to_person": "Choose a contact from this club."})
        return attrs

    def update(self, instance, validated_data):
        if validated_data.get("invoice_member") is not None:
            validated_data["bill_to_person"] = None
            validated_data["bill_to_delivery"] = ""
        elif validated_data.get("bill_to_person") is not None:
            validated_data["invoice_member"] = None
        return super().update(instance, validated_data)


class FamilyRebateRuleSerializer(serializers.ModelSerializer):
    amount_off = serializers.DecimalField(max_digits=8, decimal_places=2, required=False, allow_null=True)

    class Meta:
        model = FamilyRebateRule
        fields = ["id", "club", "member_rank", "percent_off", "amount_off", "applies_to_later"]

    def validate(self, attrs):
        amount = attrs.get("amount_off", None)
        if "amount_off" not in attrs and self.instance is not None:
            amount = self.instance.amount_off
        if amount in ("", None):
            amount = None
        else:
            amount = Decimal(amount)
            if amount < 0:
                raise serializers.ValidationError({"amount_off": "Enter a rebate of zero or more."})
        if amount is not None:
            attrs["amount_off"] = amount
            attrs["percent_off"] = Decimal("0")
        else:
            percent = attrs.get("percent_off", self.instance.percent_off if self.instance else None)
            if percent is None:
                raise serializers.ValidationError({"percent_off": "Enter a percent or a fixed amount."})
            percent = Decimal(percent)
            if percent < 0 or percent > 100:
                raise serializers.ValidationError({"percent_off": "Enter a percent from 0 to 100."})
            attrs["percent_off"] = percent
            attrs["amount_off"] = None
        rank = attrs.get("member_rank", self.instance.member_rank if self.instance else None)
        club = attrs.get("club", self.instance.club if self.instance else None)
        if rank is not None and int(rank) < 1:
            raise serializers.ValidationError({"member_rank": "Rank starts at 1."})
        if rank is not None and club is not None:
            clash = FamilyRebateRule.objects.filter(club=club, member_rank=rank)
            if self.instance is not None:
                clash = clash.exclude(pk=self.instance.pk)
            if clash.exists():
                raise serializers.ValidationError({"member_rank": "This rank already has a rebate."})
        return attrs


class MembershipFeePriceSerializer(serializers.ModelSerializer):
    class Meta:
        model = MembershipFeePrice
        fields = ["id", "amount", "effective_from", "created_at"]
        read_only_fields = ["created_at"]


class MembershipFeeSerializer(serializers.ModelSerializer):
    prices = MembershipFeePriceSerializer(many=True, read_only=True)

    class Meta:
        model = MembershipFee
        fields = ["id", "club", "name", "amount", "year", "is_active", "prices"]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if self.instance is not None:
            self.fields["club"].read_only = True

    def validate_name(self, value):
        name = str(value or "").strip()
        if not name:
            raise serializers.ValidationError("Name is required.")
        return name

    def validate_amount(self, value):
        if value < 0:
            raise serializers.ValidationError("Amount cannot be negative.")
        return value


class CommitteeMandateSerializer(serializers.ModelSerializer):
    member_name = serializers.SerializerMethodField()
    person_name = serializers.SerializerMethodField()

    class Meta:
        model = CommitteeMandate
        fields = [
            "id",
            "committee",
            "role",
            "title",
            "member",
            "member_name",
            "person",
            "person_name",
            "started_on",
            "ended_on",
            "notes",
        ]

    def get_member_name(self, obj):
        if not obj.member_id:
            return ""
        return f"{obj.member.first_name} {obj.member.last_name}"

    def get_person_name(self, obj):
        if not obj.person_id:
            return ""
        return f"{obj.person.first_name} {obj.person.last_name}"

    def validate(self, attrs):
        member = attrs.get("member", getattr(self.instance, "member", None) if self.instance else None)
        person = attrs.get("person", getattr(self.instance, "person", None) if self.instance else None)
        if member and person:
            raise serializers.ValidationError("Choose either a member or a person, not both.")
        committee = attrs.get("committee") or getattr(self.instance, "committee", None)
        if member is not None and committee is not None:
            club_id = getattr(committee, "club_id", None)
            if club_id and member.club_id != club_id:
                raise serializers.ValidationError({"member": "Member must belong to this club."})
        if member is not None:
            started_on = attrs.get(
                "started_on", getattr(self.instance, "started_on", None) if self.instance else None
            )
            if not CommitteeMandate.member_is_adult(member, started_on):
                raise serializers.ValidationError(
                    {"member": "Committee members must be 18 or older."}
                )
        if committee is not None:
            role = attrs.get("role", getattr(self.instance, "role", None) if self.instance else None)
            started_on = attrs.get(
                "started_on", getattr(self.instance, "started_on", None) if self.instance else None
            )
            ended_on = attrs.get(
                "ended_on", getattr(self.instance, "ended_on", None) if self.instance else None
            )
            title = attrs.get("title", getattr(self.instance, "title", "") if self.instance else "")
            if role and started_on and CommitteeMandate.overlapping_office_exists(
                committee=committee,
                role=role,
                started_on=started_on,
                ended_on=ended_on,
                title=title or "",
                exclude_pk=self.instance.pk if self.instance else None,
            ):
                raise serializers.ValidationError(
                    {"role": "This office is already held for that period."}
                )
        return attrs

    def update(self, instance, validated_data):
        if validated_data.get("member") is not None:
            validated_data["person"] = None
        return super().update(instance, validated_data)


class CommitteeSerializer(serializers.ModelSerializer):
    mandates = CommitteeMandateSerializer(many=True, read_only=True)

    class Meta:
        model = Committee
        fields = ["id", "scope", "club", "name", "mandates", "created_at"]
        read_only_fields = ["created_at"]


class ShopVariantSerializer(serializers.ModelSerializer):
    low_stock = serializers.SerializerMethodField()
    qr_payload = serializers.SerializerMethodField()
    qr_png = serializers.SerializerMethodField()
    sale_price = serializers.SerializerMethodField()
    cost_price = serializers.SerializerMethodField()

    class Meta:
        model = ShopVariant
        fields = [
            "id",
            "label",
            "quantity",
            "reorder_level",
            "is_active",
            "low_stock",
            "qr_payload",
            "qr_png",
            "sale_price",
            "cost_price",
        ]

    def get_low_stock(self, obj):
        return bool(obj.item.track_stock and obj.quantity <= obj.reorder_level)

    def get_qr_payload(self, obj):
        from .shop import qr_payload

        return qr_payload(obj)

    def get_qr_png(self, obj):
        if not self.context.get("include_qr"):
            return ""
        from .shop import _qr_data_uri, qr_payload

        return _qr_data_uri(qr_payload(obj))

    def get_sale_price(self, obj):
        return str(obj.resolved_sale_price())

    def get_cost_price(self, obj):
        cost = obj.resolved_cost_price()
        return str(cost) if cost is not None else None


class ShopItemSerializer(serializers.ModelSerializer):
    variants = ShopVariantSerializer(many=True, read_only=True)
    quantity = serializers.IntegerField(read_only=True)
    photo_url = serializers.SerializerMethodField()
    sizes = serializers.JSONField(write_only=True, required=False)

    class Meta:
        model = ShopItem
        fields = [
            "id",
            "club",
            "sku",
            "name",
            "description",
            "category",
            "photo",
            "photo_url",
            "sale_price",
            "cost_price",
            "track_stock",
            "is_active",
            "quantity",
            "variants",
            "sizes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["sku", "club", "created_at", "updated_at"]
        extra_kwargs = {
            "sale_price": {"required": False, "allow_null": True},
            "cost_price": {"required": False, "allow_null": True},
            "photo": {"required": False},
        }

    def to_internal_value(self, data):
        if hasattr(data, "copy"):
            data = {key: data.get(key) for key in data.keys()}
            raw_sizes = data.get("sizes")
            if isinstance(raw_sizes, str):
                import json

                try:
                    data["sizes"] = json.loads(raw_sizes or "[]")
                except json.JSONDecodeError:
                    data["sizes"] = [
                        {"label": part.strip()} for part in raw_sizes.split(",") if part.strip()
                    ]
            for key in ("sale_price", "cost_price"):
                if data.get(key) in ("", None):
                    data[key] = None
            raw_track = data.get("track_stock")
            if isinstance(raw_track, str):
                data["track_stock"] = raw_track.strip().lower() in {"1", "true", "yes", "on"}
        return super().to_internal_value(data)

    def get_photo_url(self, obj):
        if not obj.photo:
            return ""
        request = self.context.get("request")
        url = obj.photo.url
        if request:
            return request.build_absolute_uri(url)
        return url

    def _size_rows(self, sizes):
        rows = []
        for entry in sizes or []:
            if isinstance(entry, str):
                label = entry.strip()
                if label:
                    rows.append(
                        {
                            "label": label,
                            "sale_price": None,
                            "cost_price": None,
                            "quantity": None,
                            "reorder_level": None,
                        }
                    )
                continue
            if not isinstance(entry, dict):
                continue
            label = str(entry.get("label") or "").strip()
            if not label:
                continue
            rows.append(
                {
                    "label": label,
                    "sale_price": entry.get("sale_price"),
                    "cost_price": entry.get("cost_price"),
                    "quantity": entry.get("quantity"),
                    "reorder_level": entry.get("reorder_level"),
                }
            )
        return rows

    def _apply_variants(self, item, sizes, sale_price, cost_price, *, apply_opening=False):
        from .shop import parse_money, upsert_variants

        request = self.context.get("request")
        actor = getattr(request, "user", None) if request else None
        default_sale = parse_money(sale_price)
        default_cost = parse_money(cost_price)
        upsert_variants(
            item,
            self._size_rows(sizes),
            default_sale=default_sale,
            default_cost=default_cost,
            apply_opening=apply_opening,
            actor=actor,
        )
        item.refresh_from_db()
        return item

    def create(self, validated_data):
        from .shop import parse_money, prepare_shop_photo

        sizes = validated_data.pop("sizes", [])
        photo = validated_data.pop("photo", None)
        if photo:
            validated_data["photo"] = prepare_shop_photo(photo)
        sale = parse_money(validated_data.get("sale_price"))
        cost = parse_money(validated_data.get("cost_price"))
        if sale is None:
            first = next(
                (
                    row
                    for row in self._size_rows(sizes)
                    if row.get("sale_price") not in (None, "")
                ),
                None,
            )
            sale = parse_money(first["sale_price"]) if first else None
        validated_data["sale_price"] = sale if sale is not None else 0
        validated_data["cost_price"] = cost
        item = super().create(validated_data)
        return self._apply_variants(
            item, sizes, validated_data["sale_price"], cost, apply_opening=True
        )

    def update(self, instance, validated_data):
        from .shop import parse_money, prepare_shop_photo, sync_item_prices

        sizes = validated_data.pop("sizes", None)
        photo = validated_data.pop("photo", None)
        if photo:
            validated_data["photo"] = prepare_shop_photo(photo)
        if "sale_price" in validated_data:
            sale = parse_money(validated_data.get("sale_price"))
            validated_data["sale_price"] = sale if sale is not None else instance.sale_price
        if "cost_price" in validated_data:
            validated_data["cost_price"] = parse_money(validated_data.get("cost_price"))
        item = super().update(instance, validated_data)
        if sizes is not None:
            return self._apply_variants(
                item, sizes, item.sale_price, item.cost_price
            )
        sync_item_prices(item)
        item.refresh_from_db()
        return item


class ShopSaleLineSerializer(serializers.ModelSerializer):
    class Meta:
        model = ShopSaleLine
        fields = ["id", "variant", "quantity", "unit_price", "name_snapshot"]


class ShopSaleSerializer(serializers.ModelSerializer):
    lines = ShopSaleLineSerializer(many=True, read_only=True)
    member_name = serializers.SerializerMethodField()

    class Meta:
        model = ShopSale
        fields = [
            "id",
            "sale_number",
            "member",
            "member_name",
            "walk_in_name",
            "status",
            "payment_method",
            "total",
            "income",
            "lines",
            "created_at",
            "paid_at",
        ]

    def get_member_name(self, obj):
        if obj.member_id:
            return f"{obj.member.first_name} {obj.member.last_name}"
        return obj.walk_in_name


class ShopSnapshotLineSerializer(serializers.ModelSerializer):
    class Meta:
        model = ShopSnapshotLine
        fields = ["sku", "name", "variant_label", "quantity", "sale_price", "reorder_level"]


class ShopSnapshotSerializer(serializers.ModelSerializer):
    line_count = serializers.SerializerMethodField()
    units = serializers.SerializerMethodField()

    class Meta:
        model = ShopSnapshot
        fields = ["id", "taken_at", "note", "line_count", "units"]

    def get_line_count(self, obj):
        return obj.lines.count()

    def get_units(self, obj):
        return sum(row.quantity for row in obj.lines.all())
