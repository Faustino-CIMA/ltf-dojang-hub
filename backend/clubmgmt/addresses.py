"""Luxembourg address lookup.

The cached CACLR register is the complete list for a postcode. Geoportail's
fulltext search is only the fallback while that cache is empty: it stops at
200 features and ranks nearby streets ahead of the rest of the postcode.
"""

from __future__ import annotations

import json
import re
import urllib.parse
import urllib.request

_LABEL_POSTAL = re.compile(r"L-(\d{4})\b", re.IGNORECASE)
_HOUSE_NUMBER = re.compile(r"^(\d+)\s*(.*)$")

GEOPORTAIL = "https://apiv4.geoportail.lu/fulltextsearch"
# The public fulltext search stops returning features at 200, even when asked for more.
GEOPORTAIL_LIMIT = 200


def _empty(postal_code: str) -> dict:
    return {"postal_code": postal_code, "localities": [], "streets": [], "street_rows": [], "houses": []}


def _house_sort_key(value: str) -> tuple[int, str]:
    match = _HOUSE_NUMBER.match(value.strip())
    if not match:
        return (10**9, value.casefold())
    return (int(match.group(1)), match.group(2).casefold())


def _database_unavailable(exc: BaseException) -> bool:
    if type(exc).__name__ == "DatabaseOperationForbidden":
        return True
    from django.db.utils import DatabaseError

    return isinstance(exc, DatabaseError)


def lookup_luxembourg(postal_code: str, street: str = "") -> dict:
    code = "".join(ch for ch in (postal_code or "") if ch.isdigit())
    if len(code) != 4:
        return _empty(code)
    try:
        registered = _lookup_register(code, street)
    except Exception as exc:
        if not _database_unavailable(exc):
            raise
        registered = None
    if registered is not None:
        return registered
    return _lookup_geoportail(code, street)


def _lookup_register(postal_code: str, street: str) -> dict | None:
    """Complete postcode list from the cache. None when the cache has not been loaded."""
    from clubmgmt.models import LuxembourgRegisteredHouse, LuxembourgRegisteredStreet

    street_pairs = list(
        LuxembourgRegisteredStreet.objects.filter(postal_code=postal_code).values_list("locality", "street")
    )
    if not street_pairs and not LuxembourgRegisteredStreet.objects.exists():
        return None

    localities = sorted({locality for locality, _street in street_pairs if locality}, key=str.casefold)
    streets = sorted({name for _locality, name in street_pairs if name}, key=str.casefold)
    street_rows = [
        {"street": name, "locality": locality}
        for locality, name in sorted(street_pairs, key=lambda item: (item[1].casefold(), item[0].casefold()))
    ]
    houses = LuxembourgRegisteredHouse.objects.filter(postal_code=postal_code)
    wanted = street.strip()
    if wanted:
        houses = houses.filter(street__iexact=wanted)
    ordered = sorted(
        houses.values_list("house_number", "street", "locality"),
        key=lambda item: (_house_sort_key(item[0]), item[1].casefold(), item[2].casefold()),
    )
    return {
        "postal_code": postal_code,
        "localities": localities,
        "streets": streets,
        "street_rows": street_rows,
        "houses": [
            {
                "house_number": number,
                "street": name,
                "locality": locality,
                "postal_code": postal_code,
                "label": f"{number}, {name}, L-{postal_code} {locality}".strip(),
            }
            for number, name, locality in ordered
        ],
    }


def _lookup_geoportail(postal_code: str, street: str) -> dict:
    code = postal_code
    query = f"{code} {street}".strip()
    url = f"{GEOPORTAIL}?{urllib.parse.urlencode({'query': query, 'limit': GEOPORTAIL_LIMIT, 'layer': 'Adresse,nom_de_rue,Localite'})}"
    req = urllib.request.Request(url, headers={"User-Agent": "LTF-License-Manager/0.10"})
    try:
        with urllib.request.urlopen(req, timeout=8) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except Exception:
        return _empty(code)

    localities: set[str] = set()
    streets: set[str] = set()
    street_rows: set[tuple[str, str]] = set()
    houses: list[dict] = []
    for feature in payload.get("features") or []:
        props = feature.get("properties") or {}
        label = str(props.get("label") or "")
        layer = str(props.get("layer_name") or "")
        parsed = _parse_label(label, code)
        if parsed["locality"]:
            localities.add(parsed["locality"])
        if parsed["street"]:
            streets.add(parsed["street"])
            street_rows.add((parsed["street"], parsed["locality"]))
        if layer == "Adresse" and parsed["street"]:
            houses.append(
                {
                    "house_number": parsed["house_number"],
                    "street": parsed["street"],
                    "locality": parsed["locality"],
                    "postal_code": parsed["postal_code"] or code,
                    "label": label,
                }
            )
    return {
        "postal_code": code,
        "localities": sorted(localities),
        "streets": sorted(streets),
        "street_rows": [
            {"street": name, "locality": locality}
            for name, locality in sorted(street_rows, key=lambda item: (item[0].casefold(), item[1].casefold()))
        ],
        "houses": houses,
    }


def _parse_label(label: str, postal_code: str = "") -> dict:
    # "1, Rue Example, L-1234 Luxembourg" — the postcode in the label wins over the query.
    house_number = ""
    text = (label or "").strip()
    if "," in text:
        first, rest = text.split(",", 1)
        token = first.strip()
        if token[:1].isdigit():
            house_number = token
            text = rest.strip()
    match = _LABEL_POSTAL.search(text)
    if match:
        street = text[: match.start()].strip(" ,")
        locality = text[match.end() :].strip(" ,")
        found_postal = match.group(1)
    else:
        street = text
        locality = ""
        found_postal = ""
    queried = "".join(ch for ch in (postal_code or "") if ch.isdigit())
    return {
        "house_number": house_number,
        "street": street,
        "locality": locality,
        "postal_code": found_postal or queried,
    }
