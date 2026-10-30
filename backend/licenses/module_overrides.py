"""LTF Admin overrides for a module purchase. Each one is audited and held.

The daily job skips a held purchase. Clearing the hold does not send notices whose day has already passed.
"""

from __future__ import annotations

from datetime import date, timedelta

from django.db import transaction
from django.utils import timezone
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from accounts.permissions import IsLtfAdmin
from modules.entitlements import is_install_entitled

from .models import ModulePurchase, ModulePurchaseOverride, ModuleRenewalJournal, ModuleSubscriptionSettings
from .module_orders import _grant_modules
from .module_renewals import release_modules

HOLD = "override"


class ModuleOverrideError(Exception):
    def __init__(self, detail: str):
        super().__init__(detail)
        self.detail = detail


def _snapshot(purchase: ModulePurchase) -> dict:
    return {
        "status": purchase.status,
        "ends_at": purchase.ends_at.isoformat() if purchase.ends_at else None,
        "automation_hold": purchase.automation_hold,
        "switched_off": purchase.switched_off_at is not None,
        "module_ids": [str(module_id) for module_id in (purchase.module_ids or [])],
    }


def _entitled(purchase: ModulePurchase) -> None:
    module_ids = [str(module_id) for module_id in (purchase.module_ids or [])]
    if not module_ids or any(not is_install_entitled(module_id) for module_id in module_ids):
        raise ModuleOverrideError("The installation is not entitled to every module on this line.")


def _suppress_missed_notices(purchase: ModulePurchase, today) -> None:
    if purchase.ends_at is None:
        return
    settings_row = ModuleSubscriptionSettings.load()
    end = purchase.ends_at
    notice_on = end - timedelta(days=settings_row.renewal_notice_days)
    if today >= notice_on:
        ModuleRenewalJournal.objects.get_or_create(
            purchase=purchase,
            period_end=end,
            stage=ModuleRenewalJournal.Stage.RENEWAL_NOTICE,
        )
    half = settings_row.renewal_notice_days // 2
    if half and today >= end - timedelta(days=half):
        ModuleRenewalJournal.objects.get_or_create(
            purchase=purchase,
            period_end=end,
            stage=ModuleRenewalJournal.Stage.NOTICE_REMINDER,
        )


def apply_module_override(purchase: ModulePurchase, *, action: str, actor, ends_at=None, reason: str = "") -> ModulePurchaseOverride:
    allowed = {choice.value for choice in ModulePurchaseOverride.Action}
    if action not in allowed:
        raise ModuleOverrideError("Choose an override.")
    reason = (reason or "").strip()[:255]
    today = timezone.localdate()
    with transaction.atomic():
        locked = ModulePurchase.objects.select_for_update().get(pk=purchase.pk)
        before = _snapshot(locked)
        previous_end = locked.ends_at
        if action == ModulePurchaseOverride.Action.SWITCH_ON:
            _entitled(locked)
            _grant_modules(locked, actor)
            locked.switched_off_at = None
            if locked.status != ModulePurchase.Status.ACTIVE:
                locked.status = ModulePurchase.Status.ACTIVE
            locked.automation_hold = HOLD
        elif action == ModulePurchaseOverride.Action.SWITCH_OFF:
            release_modules(locked, today)
            locked.switched_off_at = timezone.now()
            locked.automation_hold = HOLD
        elif action == ModulePurchaseOverride.Action.KEEP_OPEN:
            _entitled(locked)
            _grant_modules(locked, actor)
            locked.ends_at = None
            locked.switched_off_at = None
            locked.status = ModulePurchase.Status.ACTIVE
            locked.automation_hold = HOLD
        elif action == ModulePurchaseOverride.Action.SET_END:
            if ends_at is None:
                raise ModuleOverrideError("Enter an end date.")
            locked.ends_at = ends_at
            locked.automation_hold = HOLD
        elif action == ModulePurchaseOverride.Action.WAIVE:
            if locked.ends_at is None:
                raise ModuleOverrideError("Set an end date before waiving this period.")
            _entitled(locked)
            _grant_modules(locked, actor)
            locked.switched_off_at = None
            locked.status = ModulePurchase.Status.ACTIVE
            locked.automation_hold = HOLD
        elif action == ModulePurchaseOverride.Action.CANCEL:
            release_modules(locked, today)
            locked.status = ModulePurchase.Status.CANCELLED
            locked.switched_off_at = timezone.now()
            locked.automation_hold = HOLD
        elif action == ModulePurchaseOverride.Action.CLEAR_HOLD:
            _suppress_missed_notices(locked, today)
            locked.automation_hold = ""
        locked.save()
        after = _snapshot(locked)
        audit = ModulePurchaseOverride.objects.create(
            purchase=locked,
            actor=actor if getattr(actor, "is_authenticated", False) else None,
            action=action,
            previous_ends_at=previous_end,
            new_ends_at=locked.ends_at,
            before=before,
            after=after,
            reason=reason,
        )
        return audit


class ModulePurchaseAdminSerializer(serializers.ModelSerializer):
    club_name = serializers.CharField(source="club.name", read_only=True)
    switched_off = serializers.SerializerMethodField()

    class Meta:
        model = ModulePurchase
        fields = [
            "id",
            "club",
            "club_name",
            "description",
            "module_ids",
            "status",
            "ends_at",
            "automation_hold",
            "switched_off",
            "renewal_choice",
            "source",
        ]

    def get_switched_off(self, obj: ModulePurchase) -> bool:
        return obj.switched_off_at is not None


class ModulePurchaseOverrideSerializer(serializers.ModelSerializer):
    actor_name = serializers.SerializerMethodField()
    purchase_name = serializers.CharField(source="purchase.description", read_only=True)

    class Meta:
        model = ModulePurchaseOverride
        fields = [
            "id",
            "purchase",
            "purchase_name",
            "actor_name",
            "action",
            "previous_ends_at",
            "new_ends_at",
            "before",
            "after",
            "reason",
            "created_at",
        ]

    def get_actor_name(self, obj: ModulePurchaseOverride) -> str:
        if obj.actor_id is None:
            return ""
        return obj.actor.get_username()


class ModulePurchaseAdminViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    permission_classes = [IsLtfAdmin]
    serializer_class = ModulePurchaseAdminSerializer
    queryset = ModulePurchase.objects.select_related("club").all()

    def get_queryset(self):
        queryset = super().get_queryset()
        club = self.request.query_params.get("club")
        if club:
            queryset = queryset.filter(club_id=club)
        return queryset.order_by("ends_at", "id")

    @action(detail=True, methods=["post"])
    def override(self, request, pk=None):
        purchase = self.get_object()
        from accounts.duties import refuse_own_club_override

        refused = refuse_own_club_override(request, purchase.club_id)
        if refused:
            return Response({"detail": refused}, status=status.HTTP_403_FORBIDDEN)
        raw_end = request.data.get("ends_at")
        parsed_end = None
        if raw_end:
            try:
                parsed_end = date.fromisoformat(str(raw_end))
            except ValueError:
                return Response({"detail": "Enter an end date."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            audit = apply_module_override(
                purchase,
                action=str(request.data.get("action") or ""),
                actor=request.user,
                ends_at=parsed_end,
                reason=str(request.data.get("reason") or ""),
            )
        except ModuleOverrideError as exc:
            return Response({"detail": exc.detail}, status=status.HTTP_400_BAD_REQUEST)
        return Response(ModulePurchaseOverrideSerializer(audit).data)


class ModulePurchaseOverrideViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    permission_classes = [IsLtfAdmin]
    serializer_class = ModulePurchaseOverrideSerializer
    queryset = ModulePurchaseOverride.objects.select_related("actor", "purchase").all()

    def get_queryset(self):
        queryset = super().get_queryset()
        club = self.request.query_params.get("club")
        purchase = self.request.query_params.get("purchase")
        if club:
            queryset = queryset.filter(purchase__club_id=club)
        if purchase:
            queryset = queryset.filter(purchase_id=purchase)
        return queryset.order_by("-created_at", "id")
