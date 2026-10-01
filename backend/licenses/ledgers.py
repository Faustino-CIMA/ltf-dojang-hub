from django.db.models import Q

from .models import Order


def federation_q(*, through_order: bool = False) -> Q:
    if through_order:
        return Q(order__ledger=Order.Ledger.FEDERATION)
    return Q(ledger=Order.Ledger.FEDERATION)


def apply_optional_ledger(queryset, request, *, through_order: bool = False):
    raw = (request.query_params.get("ledger") or "").strip()
    if raw not in {Order.Ledger.FEDERATION, Order.Ledger.CLUB}:
        return queryset
    if through_order:
        return queryset.filter(order__ledger=raw)
    return queryset.filter(ledger=raw)
