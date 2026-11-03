"""Catalog of module bundles. Phase 1 stores the catalog and prices. Nothing is billed."""

from __future__ import annotations

from django.db import transaction
from django.utils import timezone
from rest_framework import serializers, status, viewsets
from rest_framework.permissions import SAFE_METHODS
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsLtfFinance, IsLtfFinanceOrLtfAdmin

from .models import ModuleBundle, ModuleBundleModule, ModuleBundlePrice, ModuleSubscriptionSettings
from .module_fees import BILLABLE_MODULE_IDS

BILLABLE_MODULE_ID_SET = frozenset(BILLABLE_MODULE_IDS)


class ModuleBundleSerializer(serializers.ModelSerializer):
    modules = serializers.ListField(child=serializers.CharField(), write_only=True, required=False)
    module_ids = serializers.SerializerMethodField()
    current_amount = serializers.SerializerMethodField()
    current_currency = serializers.SerializerMethodField()
    current_effective_from = serializers.SerializerMethodField()
    has_invoices = serializers.SerializerMethodField()
    initial_amount = serializers.DecimalField(
        max_digits=10, decimal_places=2, required=False, write_only=True
    )
    initial_currency = serializers.CharField(max_length=3, required=False, write_only=True, default="EUR")
    initial_effective_from = serializers.DateField(required=False, write_only=True)

    class Meta:
        model = ModuleBundle
        fields = [
            "id",
            "name",
            "code",
            "description",
            "is_active",
            "modules",
            "module_ids",
            "current_amount",
            "current_currency",
            "current_effective_from",
            "has_invoices",
            "initial_amount",
            "initial_currency",
            "initial_effective_from",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["code", "created_at", "updated_at"]

    def get_module_ids(self, obj: ModuleBundle) -> list[str]:
        return list(obj.modules.order_by("module_id").values_list("module_id", flat=True))

    def _current_price(self, obj: ModuleBundle):
        return ModuleBundlePrice.get_active_price(bundle=obj)

    def get_current_amount(self, obj: ModuleBundle):
        price = self._current_price(obj)
        return str(price.amount) if price else None

    def get_current_currency(self, obj: ModuleBundle):
        price = self._current_price(obj)
        return price.currency if price else None

    def get_current_effective_from(self, obj: ModuleBundle):
        price = self._current_price(obj)
        return price.effective_from.isoformat() if price else None

    def get_has_invoices(self, obj: ModuleBundle) -> bool:
        return obj.has_been_invoiced()

    def validate_name(self, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise serializers.ValidationError("Name is required.")
        return cleaned

    def validate_initial_amount(self, value):
        if value is not None and value < 0:
            raise serializers.ValidationError("Amount cannot be negative.")
        return value

    def validate_initial_currency(self, value: str) -> str:
        currency = (value or "EUR").upper()
        if currency != "EUR":
            raise serializers.ValidationError("Currency must be EUR.")
        return currency

    def validate_modules(self, value: list[str]) -> list[str]:
        cleaned = []
        seen: set[str] = set()
        for raw in value:
            module_id = str(raw or "").strip()
            if not module_id or module_id in seen:
                continue
            if module_id not in BILLABLE_MODULE_ID_SET:
                raise serializers.ValidationError("Choose a billable module.")
            seen.add(module_id)
            cleaned.append(module_id)
        if len(cleaned) < 2:
            raise serializers.ValidationError("A bundle needs at least two modules.")
        return cleaned

    def validate(self, attrs):
        creating = self.instance is None
        if creating and "modules" not in attrs:
            raise serializers.ValidationError({"modules": "A bundle needs at least two modules."})
        if creating and attrs.get("initial_amount") is None:
            raise serializers.ValidationError({"initial_amount": "Enter an amount."})
        name = attrs.get("name")
        if name:
            clash = ModuleBundle.objects.filter(name=name)
            if self.instance is not None:
                clash = clash.exclude(pk=self.instance.pk)
            if clash.exists():
                raise serializers.ValidationError({"name": "A bundle with this name already exists."})
        return attrs

    def _replace_modules(self, bundle: ModuleBundle, module_ids: list[str]) -> None:
        bundle.modules.all().delete()
        ModuleBundleModule.objects.bulk_create(
            [ModuleBundleModule(bundle=bundle, module_id=module_id) for module_id in module_ids]
        )

    def _store_price(self, bundle: ModuleBundle, amount, currency, effective_from) -> None:
        if amount is None:
            return
        request = self.context.get("request")
        created_by = getattr(request, "user", None) if request else None
        if created_by is not None and not getattr(created_by, "is_authenticated", False):
            created_by = None
        ModuleBundlePrice.objects.create(
            bundle=bundle,
            amount=amount,
            currency=currency or "EUR",
            effective_from=effective_from or timezone.localdate(),
            created_by=created_by,
        )

    def create(self, validated_data):
        module_ids = validated_data.pop("modules")
        amount = validated_data.pop("initial_amount", None)
        currency = validated_data.pop("initial_currency", "EUR")
        effective_from = validated_data.pop("initial_effective_from", None)
        with transaction.atomic():
            bundle = ModuleBundle.objects.create(**validated_data)
            self._replace_modules(bundle, module_ids)
            self._store_price(bundle, amount, currency, effective_from)
        return bundle

    def update(self, instance, validated_data):
        module_ids = validated_data.pop("modules", None)
        amount = validated_data.pop("initial_amount", None)
        currency = validated_data.pop("initial_currency", "EUR")
        effective_from = validated_data.pop("initial_effective_from", None)
        with transaction.atomic():
            bundle = super().update(instance, validated_data)
            if module_ids is not None:
                self._replace_modules(bundle, module_ids)
            self._store_price(bundle, amount, currency, effective_from)
        return bundle


class ModuleSubscriptionSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = ModuleSubscriptionSettings
        fields = [
            "subscription_months",
            "renewal_notice_days",
            "payment_window_days",
            "payment_warning_days",
            "updated_at",
        ]
        read_only_fields = ["updated_at"]

    def validate_subscription_months(self, value: int) -> int:
        if value < 1 or value > 36:
            raise serializers.ValidationError("Use 1 to 36 months.")
        return value

    def validate_renewal_notice_days(self, value: int) -> int:
        if value < 7 or value > 90:
            raise serializers.ValidationError("Use 7 to 90 days.")
        return value

    def validate_payment_window_days(self, value: int) -> int:
        if value < 1 or value > 90:
            raise serializers.ValidationError("Use 1 to 90 days.")
        return value

    def validate_payment_warning_days(self, value: int) -> int:
        if value < 1 or value > 30:
            raise serializers.ValidationError("Use 1 to 30 days.")
        return value

    def validate(self, attrs):
        window = attrs.get("payment_window_days", getattr(self.instance, "payment_window_days", 30))
        warning = attrs.get("payment_warning_days", getattr(self.instance, "payment_warning_days", 7))
        if warning >= window:
            raise serializers.ValidationError(
                {"payment_warning_days": "The warning must be sooner than the end of the payment window."}
            )
        return attrs


class ModuleBundleViewSet(viewsets.ModelViewSet):
    serializer_class = ModuleBundleSerializer
    queryset = ModuleBundle.objects.prefetch_related("modules", "prices").all()

    def get_permissions(self):
        if self.request.method in SAFE_METHODS:
            return [IsLtfFinanceOrLtfAdmin()]
        return [IsLtfFinance()]

    def destroy(self, request, *args, **kwargs):
        bundle = self.get_object()
        if bundle.has_been_invoiced():
            if bundle.is_active:
                bundle.is_active = False
                bundle.save(update_fields=["is_active", "updated_at"])
            return Response(self.get_serializer(bundle).data)
        self.perform_destroy(bundle)
        return Response(status=status.HTTP_204_NO_CONTENT)


class ModuleSubscriptionSettingsView(APIView):
    def get_permissions(self):
        if self.request.method in SAFE_METHODS:
            return [IsLtfFinanceOrLtfAdmin()]
        return [IsLtfFinance()]

    def get(self, request):
        return Response(ModuleSubscriptionSettingsSerializer(ModuleSubscriptionSettings.load()).data)

    def patch(self, request):
        settings_row = ModuleSubscriptionSettings.load()
        serializer = ModuleSubscriptionSettingsSerializer(settings_row, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)
