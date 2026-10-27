import re

from django.core.exceptions import ObjectDoesNotExist, ValidationError
from rest_framework import serializers

from django.utils.translation import gettext_lazy as _

from .banking import derive_bank_name_from_iban, is_valid_iban, normalize_iban
from .languages import normalize_club_language
from .models import (
    BrandingAsset,
    Club,
    FederationProfile,
    TrainingVenue,
    RCS_NUMBER_RE,
    normalize_club_website,
    normalize_rcs_number,
)


class ClubSerializer(serializers.ModelSerializer):
    website = serializers.CharField(required=False, allow_blank=True, max_length=255)
    is_home = serializers.SerializerMethodField()

    class Meta:
        model = Club
        fields = [
            "id",
            "name",
            "city",
            "address",
            "address_line1",
            "address_line2",
            "postal_code",
            "locality",
            "iban",
            "bank_name",
            "email",
            "website",
            "is_active",
            "federation",
            "rcs_number",
            "external_ref",
            "communication_language",
            "max_admins",
            "created_by",
            "admins",
            "is_home",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["bank_name", "created_by", "is_home", "created_at", "updated_at"]

    def get_is_home(self, obj):
        return self._home_club_id() == obj.id

    def _home_club_id(self):
        if getattr(self, "_home_club_resolved", False):
            return getattr(self, "_cached_home_club_id", None)
        self._home_club_resolved = True
        request = self.context.get("request")
        user = getattr(request, "user", None)
        home_id = None
        if user is not None and getattr(user, "is_authenticated", False):
            try:
                home_id = user.member_profile.club_id
            except ObjectDoesNotExist:
                home_id = None
        self._cached_home_club_id = home_id
        return home_id

    def validate_postal_code(self, value):
        return str(value or "").strip()

    def validate_iban(self, value):
        normalized = normalize_iban(value)
        if normalized and not is_valid_iban(normalized):
            raise serializers.ValidationError("Enter a valid IBAN.")
        return normalized

    def validate_email(self, value):
        return str(value or "").strip()

    def validate_website(self, value):
        try:
            return normalize_club_website(value)
        except ValidationError as exc:
            raise serializers.ValidationError(exc.messages) from exc

    def validate_communication_language(self, value):
        return normalize_club_language(value)

    def validate_rcs_number(self, value):
        normalized = normalize_rcs_number(value)
        if not normalized:
            return ""
        if not RCS_NUMBER_RE.fullmatch(normalized):
            raise serializers.ValidationError(
                _("Enter an RCS number like B123456 (one letter, then up to 6 digits).")
            )
        clash = Club.objects.filter(rcs_number=normalized)
        if self.instance is not None:
            clash = clash.exclude(pk=self.instance.pk)
        if clash.exists() or FederationProfile.objects.filter(rcs_number=normalized).exists():
            raise serializers.ValidationError(_("This RCS number is already used by another club."))
        return normalized

    def validate_external_ref(self, value):
        return str(value or "").strip()

    def validate_federation(self, value):
        normalized = str(value or "").strip().upper()
        if normalized not in {Club.Federation.WT, Club.Federation.ITF}:
            raise serializers.ValidationError(_("Choose WT or ITF."))
        return normalized

    def validate(self, attrs):
        attrs = super().validate(attrs)

        if attrs.get("address_line1") in (None, "") and attrs.get("address"):
            attrs["address_line1"] = str(attrs["address"]).strip()
        if attrs.get("locality") in (None, "") and attrs.get("city"):
            attrs["locality"] = str(attrs["city"]).strip()

        if attrs.get("address_line1") not in (None, ""):
            attrs["address"] = str(attrs["address_line1"]).strip()
        if attrs.get("locality") not in (None, ""):
            attrs["city"] = str(attrs["locality"]).strip()

        postal_code = str(
            attrs.get(
                "postal_code",
                getattr(self.instance, "postal_code", ""),
            )
            or ""
        ).strip()
        if postal_code and not re.fullmatch(r"\d{4}", postal_code):
            raise serializers.ValidationError(
                {"postal_code": "Postal code must be 4 digits for Luxembourg."}
            )
        if "iban" in attrs:
            attrs["bank_name"] = derive_bank_name_from_iban(attrs["iban"])
        elif attrs.get("iban"):
            attrs["bank_name"] = derive_bank_name_from_iban(attrs["iban"])

        request = self.context.get("request")
        user = getattr(request, "user", None)
        role = getattr(user, "role", None)
        if role == "ltf_finance":
            attrs = {key: value for key, value in attrs.items() if key == "is_active"}
        elif role == "club_admin":
            attrs.pop("is_active", None)
        return attrs


class FederationProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = FederationProfile
        fields = [
            "id",
            "name",
            "address_line1",
            "address_line2",
            "postal_code",
            "locality",
            "rcs_number",
            "iban",
            "bank_name",
            "rewrite_lux_prefix_on_member_import",
            "club_tourist_transfer_threshold",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["bank_name", "created_at", "updated_at"]

    def validate_club_tourist_transfer_threshold(self, value):
        try:
            threshold = int(value)
        except (TypeError, ValueError) as error:
            raise serializers.ValidationError("Enter a whole number.") from error
        if threshold < 1 or threshold > 99:
            raise serializers.ValidationError("Enter a number between 1 and 99.")
        return threshold

    def validate_postal_code(self, value):
        return str(value or "").strip()

    def validate_rcs_number(self, value):
        normalized = normalize_rcs_number(value)
        if not normalized:
            return ""
        if not RCS_NUMBER_RE.fullmatch(normalized):
            raise serializers.ValidationError(
                _("Enter an RCS number like B123456 (one letter, then up to 6 digits).")
            )
        if Club.objects.filter(rcs_number=normalized).exists():
            raise serializers.ValidationError(_("This RCS number is already used by another club."))
        return normalized

    def validate_iban(self, value):
        normalized = normalize_iban(value)
        if normalized and not is_valid_iban(normalized):
            raise serializers.ValidationError("Enter a valid IBAN.")
        return normalized

    def validate(self, attrs):
        attrs = super().validate(attrs)
        postal_code = str(
            attrs.get(
                "postal_code",
                getattr(self.instance, "postal_code", ""),
            )
            or ""
        ).strip()
        if postal_code and not re.fullmatch(r"\d{4}", postal_code):
            raise serializers.ValidationError(
                {"postal_code": "Postal code must be 4 digits for Luxembourg."}
            )
        if "iban" in attrs:
            attrs["bank_name"] = derive_bank_name_from_iban(attrs["iban"])
        elif attrs.get("iban"):
            attrs["bank_name"] = derive_bank_name_from_iban(attrs["iban"])
        return attrs


class BrandingAssetSerializer(serializers.ModelSerializer):
    content_url = serializers.SerializerMethodField()
    file_name = serializers.SerializerMethodField()
    file_size = serializers.SerializerMethodField()

    class Meta:
        model = BrandingAsset
        fields = [
            "id",
            "scope_type",
            "asset_type",
            "usage_type",
            "label",
            "is_selected",
            "file_name",
            "file_size",
            "content_url",
            "created_at",
            "updated_at",
        ]

    def get_file_name(self, obj: BrandingAsset) -> str:
        return str(obj.file.name or "").split("/")[-1]

    def get_file_size(self, obj: BrandingAsset) -> int:
        try:
            return int(obj.file.size)
        except Exception:
            return 0

    def get_content_url(self, obj: BrandingAsset) -> str | None:
        # Root-relative on purpose. build_absolute_uri follows the socket the
        # proxy opened, so live responses become http:// or an internal host.
        # The browser then cannot load the preview. The client resolves this
        # path against the public API origin.
        if obj.scope_type == BrandingAsset.ScopeType.CLUB and obj.club_id:
            return f"/api/clubs/{obj.club_id}/logos/{obj.id}/content/"
        if (
            obj.scope_type == BrandingAsset.ScopeType.FEDERATION
            and obj.federation_profile_id
        ):
            return f"/api/federation-profile/logos/{obj.id}/content/"
        return None


class BrandingAssetCreateSerializer(serializers.Serializer):
    file = serializers.FileField()
    usage_type = serializers.ChoiceField(
        choices=BrandingAsset.UsageType.choices,
        default=BrandingAsset.UsageType.GENERAL,
        required=False,
    )
    label = serializers.CharField(max_length=120, required=False, allow_blank=True)
    is_selected = serializers.BooleanField(required=False, default=False)


class BrandingAssetUpdateSerializer(serializers.Serializer):
    usage_type = serializers.ChoiceField(
        choices=BrandingAsset.UsageType.choices,
        required=False,
    )
    label = serializers.CharField(max_length=120, required=False, allow_blank=True)
    is_selected = serializers.BooleanField(required=False)


class TrainingVenueSerializer(serializers.ModelSerializer):
    class Meta:
        model = TrainingVenue
        fields = [
            "id",
            "club",
            "name",
            "street",
            "house_number",
            "line2",
            "postal_code",
            "locality",
            "country",
            "notes",
            "is_active",
            "sort_order",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["club", "created_at", "updated_at"]

    def validate_name(self, value):
        name = str(value or "").strip()
        if not name:
            raise serializers.ValidationError(_("Enter a name for this training venue."))
        return name

    def validate_postal_code(self, value):
        return str(value or "").strip()

    def validate(self, attrs):
        attrs = super().validate(attrs)
        country = str(
            attrs.get("country", getattr(self.instance, "country", "Luxembourg")) or "Luxembourg"
        ).strip()
        attrs["country"] = country
        postal_code = str(
            attrs.get("postal_code", getattr(self.instance, "postal_code", "")) or ""
        ).strip()
        if country.casefold() in {"luxembourg", "luxemburg", "letzebuerg", "lëtzebuerg"}:
            if postal_code and not re.fullmatch(r"\d{4}", postal_code):
                raise serializers.ValidationError(
                    {"postal_code": _("Postal code must be 4 digits for Luxembourg.")}
                )
        return attrs
