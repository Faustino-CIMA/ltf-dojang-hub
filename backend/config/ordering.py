def apply_list_ordering(queryset, ordering, *, allowed, default):
    """Apply a single `ordering` query value to a list queryset.

    `allowed` maps a public field name to ORM fields. Descending requests
    reverse every field so a name sort of last name, then first name stays
    consistent in both directions. Unknown fields fall back to `default`.
    """
    raw = (ordering or "").strip()
    if not raw:
        return queryset.order_by(*default)

    descending = raw.startswith("-")
    key = raw[1:] if descending else raw
    fields = allowed.get(key)
    if not fields:
        return queryset.order_by(*default)

    directed = []
    for field in fields:
        if descending:
            directed.append(field[1:] if field.startswith("-") else f"-{field}")
        else:
            directed.append(field)
    return queryset.order_by(*directed)
