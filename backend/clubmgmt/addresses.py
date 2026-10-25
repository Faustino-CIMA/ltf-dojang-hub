"""Luxembourg address lookup via Geoportail (postal code first, like vo.lu)."""

from __future__ import annotations

import json
import re
import urllib.parse
import urllib.request

_LABEL_POSTAL = re.compile(r"L-(\d{4})\b", re.IGNORECASE)

GEOPORTAIL = "https://apiv4.geoportail.lu/fulltextsearch"


def lookup_luxembourg(postal_code: str, street: str = "") -> dict:
    code = "".join(ch for ch in (postal_code or "") if ch.isdigit())
    if len(code) != 4:
        return {"postal_code": code, "localities": [], "streets": [], "houses": []}
    query = f"{code} {street}".strip()
    url = f"{GEOPORTAIL}?{urllib.parse.urlencode({'query': query, 'limit': 80, 'layer': 'Adresse,nom_de_rue,Localite'})}"
    req = urllib.request.Request(url, headers={"User-Agent": "LTF-License-Manager/0.10"})
    try:
        with urllib.request.urlopen(req, timeout=8) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except Exception:
        return {"postal_code": code, "localities": [], "streets": [], "houses": []}

    localities: set[str] = set()
    streets: set[str] = set()
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
        "houses": houses[:60],
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
