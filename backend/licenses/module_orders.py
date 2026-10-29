"""Club module and bundle orders. One invoice, activated when that invoice is paid."""

from __future__ import annotations

import calendar
from datetime import date
from decimal import Decimal

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from modules.entitlements import is_install_entitled
from modules.models import ClubModuleAssignment
from modules.registry import get_spec

from .models import (
    ClubFeePrice,
    ClubFeeType,
    FinanceAuditLog,
    Invoice,
    ModuleBundle,
    ModuleBundlePrice,
    ModulePurchase,
    ModuleSubscriptionSettings,
    Order,
    OrderItem,
)
from .module_fees import BILLABLE_MODULE_IDS, active_member_count, module_fee_line_description, quote_price


class ModuleOrderError(Exception):
    def __init__(self, detail: str):
        super().__init__(detail)
        self.detail = detail


def add_subscription_months(start: date, months: int) -> date:
    """Payment day plus whole months. 29 February lands on 28 February in a non-leap year."""
    month_index = start.month - 1 + int(months)
    year = start.year + month_index // 12
    month = month_index % 12 + 1
    last_day = calendar.monthrange(year, month)[1]
    return date(year, month, min(start.day, last_day))


def _money(value: Decimal) -> str:
    return f"{Decimal(value).quantize(Decimal('0.01'))}"


def module_label(module_id: str) -> str:
    spec = get_spec(module_id)
    return spec.label if spec else module_id


def _bundle_description(bundle: ModuleBundle, module_ids: list[str]) -> str:
    names = ", ".join(module_label(module_id) for module_id in module_ids)
    text = f"{bundle.name} — {names}" if names else bundle.name
    return text[:255]


def _invoice_of(order_item) -> Invoice | None:
    if order_item is None or not getattr(order_item, "order_id", None):
        return None
    try:
        return order_item.order.invoice
    except Invoice.DoesNotExist:
        return None


def _coverage(club) -> dict:
    today = timezone.localdate()
    assigned = set(
        ClubModuleAssignment.objects.filter(club=club, enabled=True).values_list("module_id", flat=True)
    )
    ever_purchased: set[str] = set()
    active_until: dict[str, date | None] = {}
    open_for_module: dict[str, Invoice] = {}
    open_for_bundle: dict[int, Invoice] = {}
    purchases = (
        ModulePurchase.objects.filter(club=club)
        .exclude(status=ModulePurchase.Status.CANCELLED)
        .select_related("order_item__order__invoice", "renewal_order_item__order__invoice", "bundle")
    )
    for purchase in purchases:
        module_ids = [str(module_id) for module_id in (purchase.module_ids or [])]
        ever_purchased.update(module_ids)
        renewal_invoice = _invoice_of(getattr(purchase, "renewal_order_item", None))
        if renewal_invoice is not None and renewal_invoice.status == Invoice.Status.ISSUED:
            for module_id in module_ids:
                open_for_module.setdefault(module_id, renewal_invoice)
            if purchase.bundle_id:
                open_for_bundle.setdefault(purchase.bundle_id, renewal_invoice)
        invoice = _invoice_of(purchase.order_item)
        if purchase.status == ModulePurchase.Status.PENDING and invoice is not None:
            if invoice.status == Invoice.Status.ISSUED:
                for module_id in module_ids:
                    open_for_module.setdefault(module_id, invoice)
                if purchase.bundle_id:
                    open_for_bundle[purchase.bundle_id] = invoice
            continue
        if purchase.status != ModulePurchase.Status.ACTIVE:
            continue
        if purchase.ends_at is not None and purchase.ends_at < today:
            continue
        for module_id in module_ids:
            current = active_until.get(module_id, None)
            if module_id not in active_until:
                active_until[module_id] = purchase.ends_at
            elif purchase.ends_at is None:
                active_until[module_id] = None
            elif current is not None and purchase.ends_at > current:
                active_until[module_id] = purchase.ends_at
    return {
        "assigned": assigned,
        "ever_purchased": ever_purchased,
        "active_until": active_until,
        "open_for_module": open_for_module,
        "open_for_bundle": open_for_bundle,
    }


def _module_state(module_id: str, coverage: dict) -> tuple[str, date | None, Invoice | None]:
    invoice = coverage["open_for_module"].get(module_id)
    if invoice is not None:
        return "open_invoice", None, invoice
    if module_id in coverage["active_until"]:
        return "on", coverage["active_until"][module_id], None
    if module_id in coverage["assigned"] and module_id not in coverage["ever_purchased"]:
        return "on", None, None
    return "available", None, None


def _comparison(module_ids: list[str], fees: dict, count: int, bundle_amount: Decimal | None, as_of: date) -> dict:
    lines = []
    comparable = bundle_amount is not None
    total = Decimal("0.00")
    for module_id in module_ids:
        fee = fees.get(module_id)
        price = None
        if fee is not None and fee.is_active:
            price = ClubFeePrice.get_active_price(fee_type=fee, as_of=as_of)
        if price is None:
            comparable = False
            lines.append(
                {
                    "module_id": module_id,
                    "name": module_label(module_id),
                    "kind": "missing",
                    "amount": None,
                }
            )
            continue
        quoted = quote_price(
            amount=price.amount,
            pricing_type=price.pricing_type,
            minimum_amount=price.minimum_amount,
            active_members=count,
        )
        per_member = price.pricing_type == ClubFeePrice.PricingType.PER_ACTIVE_MEMBER
        total += quoted["charged_amount"]
        lines.append(
            {
                "module_id": module_id,
                "name": module_label(module_id),
                "kind": "per_member" if per_member else "flat",
                "amount": _money(quoted["charged_amount"]),
            }
        )
    difference = None
    summed = None
    if comparable and lines:
        summed = total.quantize(Decimal("0.01"))
        difference = (bundle_amount - summed).quantize(Decimal("0.01"))
    return {
        "lines": lines,
        "sum": _money(summed) if summed is not None else None,
        "difference": _money(difference) if difference is not None else None,
    }


def module_order_catalog(club, *, include_unentitled: bool = False, as_of: date | None = None) -> dict:
    as_of = as_of or timezone.localdate()
    year = as_of.year
    count = active_member_count(club.id, year)
    coverage = _coverage(club)
    fees = {
        fee.module_id: fee
        for fee in ClubFeeType.objects.filter(module_id__in=BILLABLE_MODULE_IDS).prefetch_related("prices")
    }
    offers = []
    for module_id in BILLABLE_MODULE_IDS:
        entitled = is_install_entitled(module_id)
        if not entitled and not include_unentitled:
            continue
        fee = fees.get(module_id)
        price = None
        if fee is not None and fee.is_active:
            price = ClubFeePrice.get_active_price(fee_type=fee, as_of=as_of)
        state, ends_at, invoice = _module_state(module_id, coverage)
        if not entitled and state == "available":
            state = "not_entitled"
        elif state == "available" and price is None:
            state = "no_price"
        estimated = None
        pricing_type = None
        amount = None
        if price is not None:
            quoted = quote_price(
                amount=price.amount,
                pricing_type=price.pricing_type,
                minimum_amount=price.minimum_amount,
                active_members=count,
            )
            estimated = _money(quoted["charged_amount"])
            pricing_type = price.pricing_type
            amount = _money(price.amount)
        offers.append(
            {
                "kind": "module",
                "key": module_id,
                "module_id": module_id,
                "bundle_id": None,
                "name": module_label(module_id),
                "module_ids": [module_id],
                "module_names": [module_label(module_id)],
                "amount": amount,
                "estimated_amount": estimated,
                "currency": "EUR",
                "pricing_type": pricing_type,
                "active_member_count": count if pricing_type == ClubFeePrice.PricingType.PER_ACTIVE_MEMBER else None,
                "state": state,
                "ends_at": ends_at.isoformat() if ends_at else None,
                "invoice_id": invoice.id if invoice else None,
                "invoice_number": invoice.invoice_number if invoice else None,
                "comparison": None,
            }
        )

    bundles = ModuleBundle.objects.filter(is_active=True).prefetch_related("modules", "prices")
    for bundle in bundles:
        module_ids = list(bundle.modules.order_by("module_id").values_list("module_id", flat=True))
        module_ids = [module_id for module_id in BILLABLE_MODULE_IDS if module_id in module_ids]
        entitled = all(is_install_entitled(module_id) for module_id in module_ids) if module_ids else False
        if not entitled and not include_unentitled:
            continue
        price = ModuleBundlePrice.get_active_price(bundle=bundle, as_of=as_of)
        invoice = coverage["open_for_bundle"].get(bundle.id)
        state = "available"
        ends_at = None
        if invoice is not None:
            state = "open_invoice"
        else:
            blocked = False
            for module_id in module_ids:
                module_state, module_end, module_invoice = _module_state(module_id, coverage)
                if module_invoice is not None:
                    invoice = module_invoice
                    state = "open_invoice"
                    blocked = True
                    break
                if module_state == "on":
                    blocked = True
                    ends_at = module_end if ends_at is None else ends_at
            if state != "open_invoice" and blocked:
                state = "blocked"
        if not entitled and state == "available":
            state = "not_entitled"
        elif state == "available" and price is None:
            state = "no_price"
        amount = _money(price.amount) if price else None
        offers.append(
            {
                "kind": "bundle",
                "key": f"bundle:{bundle.id}",
                "module_id": None,
                "bundle_id": bundle.id,
                "name": bundle.name,
                "module_ids": module_ids,
                "module_names": [module_label(module_id) for module_id in module_ids],
                "amount": amount,
                "estimated_amount": amount,
                "currency": price.currency if price else "EUR",
                "pricing_type": "flat",
                "active_member_count": None,
                "state": state,
                "ends_at": ends_at.isoformat() if ends_at else None,
                "invoice_id": invoice.id if invoice else None,
                "invoice_number": invoice.invoice_number if invoice else None,
                "comparison": _comparison(
                    module_ids,
                    fees,
                    count,
                    price.amount if price else None,
                    as_of,
                ),
            }
        )
    settings_row = ModuleSubscriptionSettings.load()
    from .module_renewals import renewal_rows_for_club

    return {
        "club_id": club.id,
        "active_member_count": count,
        "subscription_months": settings_row.subscription_months,
        "offers": offers,
        "renewals": renewal_rows_for_club(club, as_of),
    }


def _reject_if_unavailable(offer_state: str, name: str) -> None:
    if offer_state == "open_invoice":
        raise ModuleOrderError(f"{name} already has an open invoice.")
    if offer_state in {"on", "blocked"}:
        raise ModuleOrderError(f"{name} is already on for this club.")
    if offer_state == "not_entitled":
        raise ModuleOrderError(f"{name} is not available on this installation.")
    if offer_state == "no_price":
        raise ModuleOrderError(f"{name} has no price yet.")


def create_module_order(club, *, module_ids: list[str], bundle_ids: list[int], actor, allow_unentitled: bool):
    wanted_modules = []
    seen_modules: set[str] = set()
    for raw in module_ids:
        module_id = str(raw or "").strip()
        if not module_id or module_id in seen_modules:
            continue
        if module_id not in BILLABLE_MODULE_IDS:
            raise ModuleOrderError("Choose a billable module.")
        seen_modules.add(module_id)
        wanted_modules.append(module_id)
    wanted_bundles = []
    seen_bundles: set[int] = set()
    for raw in bundle_ids:
        try:
            bundle_id = int(raw)
        except (TypeError, ValueError) as exc:
            raise ModuleOrderError("Choose a bundle from the list.") from exc
        if bundle_id in seen_bundles:
            continue
        seen_bundles.add(bundle_id)
        wanted_bundles.append(bundle_id)
    if not wanted_modules and not wanted_bundles:
        raise ModuleOrderError("Choose at least one module or bundle.")

    as_of = timezone.localdate()
    year = as_of.year
    count = active_member_count(club.id, year)
    with transaction.atomic():
        type(club).objects.select_for_update().get(pk=club.pk)
        bundles = list(
            ModuleBundle.objects.filter(id__in=wanted_bundles, is_active=True).prefetch_related("modules", "prices")
        )
        if len(bundles) != len(wanted_bundles):
            raise ModuleOrderError("That bundle is not for sale.")
        bundle_modules: dict[int, list[str]] = {}
        for bundle in bundles:
            module_list = [
                module_id
                for module_id in BILLABLE_MODULE_IDS
                if module_id in set(bundle.modules.values_list("module_id", flat=True))
            ]
            bundle_modules[bundle.id] = module_list
        claimed: dict[str, str] = {}
        for bundle in bundles:
            for module_id in bundle_modules[bundle.id]:
                if module_id in claimed:
                    raise ModuleOrderError("These bundles share a module. Choose only one.")
                claimed[module_id] = bundle.name
        notices = []
        kept_modules = []
        for module_id in wanted_modules:
            if module_id in claimed:
                notices.append(
                    {
                        "code": "dropped_single",
                        "module_id": module_id,
                        "bundle_name": claimed[module_id],
                    }
                )
                continue
            kept_modules.append(module_id)

        catalog = module_order_catalog(club, include_unentitled=True, as_of=as_of)
        by_key = {offer["key"]: offer for offer in catalog["offers"]}
        lines = []
        for module_id in kept_modules:
            offer = by_key.get(module_id)
            if offer is None:
                raise ModuleOrderError("Choose a billable module.")
            if offer["state"] == "not_entitled" and not allow_unentitled:
                raise ModuleOrderError(f"{offer['name']} is not available on this installation.")
            if offer["state"] != "not_entitled":
                _reject_if_unavailable(offer["state"], offer["name"])
            fee = ClubFeeType.objects.filter(module_id=module_id, is_active=True).first()
            price = ClubFeePrice.get_active_price(fee_type=fee, as_of=as_of) if fee else None
            if price is None:
                raise ModuleOrderError(f"{offer['name']} has no price yet.")
            quoted = quote_price(
                amount=price.amount,
                pricing_type=price.pricing_type,
                minimum_amount=price.minimum_amount,
                active_members=count,
            )
            if quoted["charged_amount"] <= 0:
                raise ModuleOrderError(f"{offer['name']} has no price yet.")
            per_member = price.pricing_type == ClubFeePrice.PricingType.PER_ACTIVE_MEMBER
            if per_member:
                description = module_fee_line_description(
                    name=module_label(module_id),
                    year=year,
                    pricing_type=price.pricing_type,
                    amount=price.amount,
                    active_members=count,
                    minimum_applied=quoted["minimum_applied"],
                )
                quantity = count if count > 0 else 1
            else:
                description = module_label(module_id)
                quantity = 1
            lines.append(
                {
                    "fee_type": fee,
                    "bundle": None,
                    "module_ids": [module_id],
                    "description": description[:255],
                    "price_snapshot": price.amount,
                    "quantity": quantity,
                    "charged_amount": quoted["charged_amount"],
                    "active_member_count": quoted["active_member_count"],
                    "minimum_applied": quoted["minimum_applied"],
                }
            )
        for bundle in bundles:
            offer = by_key.get(f"bundle:{bundle.id}")
            if offer is None:
                raise ModuleOrderError("That bundle is not for sale.")
            if offer["state"] == "not_entitled" and not allow_unentitled:
                raise ModuleOrderError(f"{offer['name']} is not available on this installation.")
            if offer["state"] != "not_entitled":
                _reject_if_unavailable(offer["state"], offer["name"])
            price = ModuleBundlePrice.get_active_price(bundle=bundle, as_of=as_of)
            if price is None or price.currency != "EUR":
                raise ModuleOrderError(f"{bundle.name} has no price yet.")
            if price.amount < 0:
                raise ModuleOrderError(f"{bundle.name} has no price yet.")
            module_list = bundle_modules[bundle.id]
            lines.append(
                {
                    "fee_type": None,
                    "bundle": bundle,
                    "module_ids": module_list,
                    "description": _bundle_description(bundle, module_list),
                    "price_snapshot": price.amount,
                    "quantity": 1,
                    "charged_amount": price.amount,
                    "active_member_count": None,
                    "minimum_applied": False,
                }
            )
        if not lines:
            raise ModuleOrderError("Choose at least one module or bundle.")

        subtotal = sum((line["charged_amount"] for line in lines), Decimal("0.00"))
        order = Order.objects.create(
            club=club,
            member=None,
            ledger=Order.Ledger.FEDERATION,
            status=Order.Status.PENDING,
            currency="EUR",
            subtotal=subtotal,
            tax_total=Decimal("0.00"),
            total=subtotal,
        )
        created_lines = []
        for line in lines:
            item = OrderItem.objects.create(
                order=order,
                license=None,
                fee_type=line["fee_type"],
                bundle=line["bundle"],
                description=line["description"],
                billing_club=club,
                charge_active=False,
                price_snapshot=line["price_snapshot"],
                quantity=line["quantity"],
                active_member_count=line["active_member_count"],
                minimum_applied=line["minimum_applied"],
                charged_amount=line["charged_amount"],
            )
            purchase = ModulePurchase.objects.create(
                club=club,
                fee_type=line["fee_type"],
                bundle=line["bundle"],
                module_ids=line["module_ids"],
                description=line["description"],
                price_snapshot=line["charged_amount"],
                currency="EUR",
                status=ModulePurchase.Status.PENDING,
                order_item=item,
                source=ModulePurchase.Source.ORDER,
            )
            created_lines.append(
                {
                    "purchase_id": purchase.id,
                    "description": line["description"],
                    "amount": _money(line["charged_amount"]),
                }
            )
        invoice = Invoice.objects.create(
            order=order,
            club=club,
            member=None,
            status=Invoice.Status.ISSUED,
            currency="EUR",
            subtotal=subtotal,
            tax_total=Decimal("0.00"),
            total=subtotal,
            issued_at=timezone.now(),
        )
        FinanceAuditLog.objects.create(
            action="module_order.created",
            message="Module order invoice created.",
            actor=actor if getattr(actor, "is_authenticated", False) else None,
            club=club,
            order=order,
            invoice=invoice,
            metadata={"total": _money(subtotal), "lines": created_lines},
        )
    return {
        "invoice_id": invoice.id,
        "invoice_number": invoice.invoice_number,
        "order_id": order.id,
        "total": _money(subtotal),
        "currency": "EUR",
        "lines": created_lines,
        "notices": notices,
    }


def build_renewal_line(purchase, as_of: date) -> dict | None:
    """Catalog price for the next period. None when the catalog has no price."""
    module_ids = [str(module_id) for module_id in (purchase.module_ids or [])]
    year = as_of.year
    count = active_member_count(purchase.club_id, year)
    if purchase.bundle_id:
        bundle = purchase.bundle
        price = ModuleBundlePrice.get_active_price(bundle=bundle, as_of=as_of) if bundle else None
        if price is None or price.currency != "EUR" or price.amount < 0:
            return None
        ordered = [module_id for module_id in BILLABLE_MODULE_IDS if module_id in module_ids]
        return {
            "fee_type": None,
            "bundle": bundle,
            "module_ids": ordered or module_ids,
            "description": _bundle_description(bundle, ordered or module_ids),
            "price_snapshot": price.amount,
            "quantity": 1,
            "charged_amount": price.amount,
            "active_member_count": None,
            "minimum_applied": False,
        }
    module_id = module_ids[0] if module_ids else None
    fee = purchase.fee_type
    if fee is None or not fee.is_active or fee.module_id != module_id:
        fee = ClubFeeType.objects.filter(module_id=module_id, is_active=True).first() if module_id else None
    price = ClubFeePrice.get_active_price(fee_type=fee, as_of=as_of) if fee else None
    if price is None or module_id is None:
        return None
    quoted = quote_price(
        amount=price.amount,
        pricing_type=price.pricing_type,
        minimum_amount=price.minimum_amount,
        active_members=count,
    )
    if quoted["charged_amount"] <= 0:
        return None
    per_member = price.pricing_type == ClubFeePrice.PricingType.PER_ACTIVE_MEMBER
    if per_member:
        description = module_fee_line_description(
            name=module_label(module_id),
            year=year,
            pricing_type=price.pricing_type,
            amount=price.amount,
            active_members=count,
            minimum_applied=quoted["minimum_applied"],
        )
        quantity = count if count > 0 else 1
    else:
        description = module_label(module_id)
        quantity = 1
    return {
        "fee_type": fee,
        "bundle": None,
        "module_ids": [module_id],
        "description": description[:255],
        "price_snapshot": price.amount,
        "quantity": quantity,
        "charged_amount": quoted["charged_amount"],
        "active_member_count": quoted["active_member_count"],
        "minimum_applied": quoted["minimum_applied"],
    }


def _grant_modules(purchase, actor) -> None:
    assigned_by = actor if getattr(actor, "is_authenticated", False) else None
    for module_id in [str(module_id) for module_id in (purchase.module_ids or [])]:
        ClubModuleAssignment.objects.update_or_create(
            club=purchase.club,
            module_id=module_id,
            defaults={"enabled": True, "assigned_by": assigned_by},
        )


def activate_module_purchases(order, *, actor=None) -> list[int]:
    """Switch on modules for purchases on a paid invoice. A second call changes nothing."""
    try:
        invoice = order.invoice
    except Invoice.DoesNotExist:
        return []
    if invoice.status != Invoice.Status.PAID:
        return []
    paid_at = invoice.paid_at or timezone.now()
    paid_on = timezone.localtime(paid_at).date()
    months = ModuleSubscriptionSettings.load().subscription_months
    activated: list[int] = []
    purchase_ids = list(
        ModulePurchase.objects.filter(Q(order_item__order=order) | Q(renewal_order_item__order=order))
        .exclude(status=ModulePurchase.Status.CANCELLED)
        .values_list("id", flat=True)
    )
    purchases = ModulePurchase.objects.select_for_update().filter(id__in=purchase_ids)
    for purchase in purchases:
        is_renewal = bool(
            purchase.renewal_order_item_id and purchase.renewal_order_item.order_id == order.id
        )
        if not is_renewal and purchase.status == ModulePurchase.Status.ACTIVE and purchase.activated_at:
            continue
        if is_renewal and purchase.renewal_order_item_id is None:
            continue
        module_ids = [str(module_id) for module_id in (purchase.module_ids or [])]
        if not module_ids or any(not is_install_entitled(module_id) for module_id in module_ids):
            purchase.activation_error = "The installation is not entitled to every module on this line."
            purchase.save(update_fields=["activation_error", "updated_at"])
            continue
        if purchase.automation_hold:
            continue
        _grant_modules(purchase, actor)
        if is_renewal:
            was_off = purchase.switched_off_at is not None
            old_end = purchase.ends_at or paid_on
            purchase.ends_at = add_subscription_months(paid_on if was_off else old_end, months)
            purchase.renewal_choice = ModulePurchase.RenewalChoice.UNANSWERED
            purchase.renewal_order_item = None
            purchase.switched_off_at = None
            purchase.status = ModulePurchase.Status.ACTIVE
            purchase.activation_error = ""
            purchase.save(
                update_fields=[
                    "ends_at",
                    "renewal_choice",
                    "renewal_order_item",
                    "switched_off_at",
                    "status",
                    "activation_error",
                    "updated_at",
                ]
            )
            if was_off:
                from .models import ModuleRenewalJournal

                ModuleRenewalJournal.objects.get_or_create(
                    purchase=purchase,
                    period_end=old_end,
                    stage=ModuleRenewalJournal.Stage.LATE_REACTIVATED,
                )
        else:
            purchase.status = ModulePurchase.Status.ACTIVE
            purchase.activated_at = paid_at
            purchase.ends_at = add_subscription_months(paid_on, months)
            purchase.activation_error = ""
            purchase.save(
                update_fields=["status", "activated_at", "ends_at", "activation_error", "updated_at"]
            )
        activated.append(purchase.id)
    return activated


def active_purchase_module_ids(club) -> set[str]:
    return set(_coverage(club)["active_until"])


def module_covered_by_active_purchase(club, module_id: str) -> bool:
    return module_id in active_purchase_module_ids(club)
