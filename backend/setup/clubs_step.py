import re

from clubs.federation import infer_club_federation
from clubs.models import Club, RCS_NUMBER_RE, normalize_rcs_number
from imports.csv_utils import to_row_dict
from imports.mapping import normalize_header
from imports.views import parse_club_address_fields

from .names import is_ltf_name, normalize_club_name


def _header(headers, aliases: set[str]) -> str:
    for header in headers:
        if normalize_header(header) in aliases:
            return header
    return ""


def detect_club_mapping(headers) -> dict:
    return {
        "name": _header(headers, {"organization name", "organisation name", "name", "club name"}),
        "address_line1": _header(headers, {"address", "address line 1", "address line1", "street"}),
        "address_line2": _header(headers, {"address line 2", "address line2"}),
        "postal_code": _header(headers, {"postal code", "postcode", "zip"}),
        "locality": _header(headers, {"locality", "city"}),
        "iban": _header(headers, {"iban"}),
    }


def _blank(row) -> bool:
    return all(not str(cell or "").strip() for cell in row)


def preview_clubs(headers, rows, edits: dict | None = None) -> dict:
    edits = edits or {}
    mapping = detect_club_mapping(headers)
    existing = {}
    for club in Club.objects.all().only("id", "name", "federation", "rcs_number", "is_demo"):
        existing[normalize_club_name(club.name)] = club
    seen = {}
    preview = []
    blank = 0
    skipped_ltf = 0
    for index, row in enumerate(rows, start=1):
        if _blank(row):
            blank += 1
            continue
        data = to_row_dict(headers, row)
        name = data.get(mapping["name"], "").strip() if mapping["name"] else ""
        if not name:
            continue
        if is_ltf_name(name):
            skipped_ltf += 1
            continue
        key = normalize_club_name(name)
        if key in seen:
            continue
        errors = []
        address = parse_club_address_fields(data, mapping, errors)
        row_edits = (edits.get("rows") or {}).get(str(index)) or {}
        federation = str(row_edits.get("federation") or infer_club_federation(name)).upper()
        if federation not in {Club.Federation.WT, Club.Federation.ITF}:
            federation = infer_club_federation(name)
        rcs = normalize_rcs_number(row_edits.get("rcs_number") or "")
        rcs_error = ""
        if rcs and not RCS_NUMBER_RE.fullmatch(rcs):
            rcs_error = "invalid_rcs"
        if "address_line1" in row_edits:
            address["address_line1"] = str(row_edits.get("address_line1") or "").strip()
            address["address_line2"] = str(row_edits.get("address_line2") or "").strip()
            address["postal_code"] = str(row_edits.get("postal_code") or "").strip()
            address["locality"] = str(row_edits.get("locality") or "").strip()
        if address["postal_code"] and not re.fullmatch(r"\d{4}", address["postal_code"]):
            errors.append("postal_code must be 4 digits for Luxembourg")
        match = existing.get(key)
        disposition = "update" if match else "create"
        seen[key] = index
        preview.append(
            {
                "row_index": index,
                "name": name,
                "normalized_name": key,
                "federation": federation,
                "rcs_number": rcs,
                "rcs_error": rcs_error,
                "address_line1": address["address_line1"],
                "address_line2": address["address_line2"],
                "postal_code": address["postal_code"],
                "locality": address["locality"],
                "iban": address["iban"],
                "disposition": disposition,
                "existing_id": match.id if match else None,
                "errors": errors,
            }
        )
    rcs_counts: dict[str, int] = {}
    for row in preview:
        if row["rcs_number"]:
            rcs_counts[row["rcs_number"]] = rcs_counts.get(row["rcs_number"], 0) + 1
    for row in preview:
        if row["rcs_number"] and rcs_counts[row["rcs_number"]] > 1:
            row["rcs_error"] = row["rcs_error"] or "duplicate_rcs"
        if row["rcs_number"]:
            clash = Club.objects.filter(rcs_number=row["rcs_number"])
            if row["existing_id"]:
                clash = clash.exclude(pk=row["existing_id"])
            if clash.exists():
                row["rcs_error"] = "duplicate_rcs"
    blocking = any(row["rcs_error"] or row["errors"] for row in preview)
    return {
        "headers": headers,
        "mapping": mapping,
        "rows": preview,
        "blank_rows_ignored": blank,
        "ltf_rows_ignored": skipped_ltf,
        "can_confirm": not blocking,
    }


def apply_clubs(headers, rows, edits, user) -> dict:
    planned = preview_clubs(headers, rows, edits)
    if not planned["can_confirm"]:
        return planned | {"confirmed": False}
    created = 0
    updated = 0
    skipped = 0
    for row in planned["rows"]:
        club = Club.objects.filter(pk=row["existing_id"]).first() if row["existing_id"] else None
        if club is None:
            club = Club(name=row["name"], created_by=user, external_ref=row["normalized_name"])
            created += 1
        else:
            changed = False
            if club.federation != row["federation"] or (row["rcs_number"] and club.rcs_number != row["rcs_number"]):
                changed = True
            for field in ("address_line1", "address_line2", "postal_code", "locality", "iban"):
                incoming = row[field]
                if incoming and getattr(club, field) != incoming:
                    changed = True
            if not changed and club.external_ref == row["normalized_name"]:
                skipped += 1
                row["disposition"] = "skip"
                continue
            updated += 1
        club.name = row["name"]
        club.federation = row["federation"]
        if row["rcs_number"]:
            club.rcs_number = row["rcs_number"]
        club.external_ref = row["normalized_name"]
        for field in ("address_line1", "address_line2", "postal_code", "locality", "iban"):
            if row[field]:
                setattr(club, field, row[field])
        if club.address_line1:
            club.address = club.address_line1
        if club.locality:
            club.city = club.locality
        club.save()
    return {
        "confirmed": True,
        "created": created,
        "updated": updated,
        "skipped": skipped,
        "blank_rows_ignored": planned["blank_rows_ignored"],
        "ltf_rows_ignored": planned["ltf_rows_ignored"],
        "rows": [
            {"name": row["name"], "federation": row["federation"], "disposition": row["disposition"]}
            for row in planned["rows"]
        ],
    }
