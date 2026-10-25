"""Wizard step 2: members and LTF staff from a SimplyCompete export."""

from __future__ import annotations

from datetime import date

from django.utils import timezone

from imports.csv_utils import to_row_dict
from imports.mapping import detect_membership_end_date_header, suggest_member_mapping
from imports.member_match import MemberMatchIndex
from members.ltf_staff import _apply_function
from members.models import Member
from members.services import apply_ltf_license_id_import_prefix

from .dates import detect_column_format, parse_with_format, plausible_birth_date
from .names import is_ltf_name, is_near_ltf_name, normalize_club_name

_SEX = {
    "m": "M",
    "male": "M",
    "man": "M",
    "masculin": "M",
    "homme": "M",
    "mannlich": "M",
    "männlich": "M",
    "f": "F",
    "female": "F",
    "woman": "F",
    "feminin": "F",
    "féminin": "F",
    "femme": "F",
    "weiblich": "F",
}


def _blank(row) -> bool:
    return all(not str(cell or "").strip() for cell in row)


def _cell(data, mapping, field) -> str:
    header = str(mapping.get(field) or "").strip()
    if not header:
        return ""
    return str(data.get(header) or "").strip()


def parse_gender(value: str) -> str:
    key = str(value or "").strip().casefold()
    key = key.replace("ä", "a").replace("é", "e")
    if not key:
        return ""
    return _SEX.get(key, "")


def licence_roles(primary_raw: str, secondary_raw: str) -> tuple[str, str, str]:
    primary = Member.canonicalize_license_role(primary_raw)
    secondary = Member.canonicalize_license_role(secondary_raw)
    note = ""
    if not primary and secondary:
        primary = secondary
        secondary = ""
        note = "secondary_became_primary"
    elif primary and secondary and primary == secondary:
        secondary = ""
        note = "secondary_dropped"
    if secondary and not primary:
        secondary = ""
    return primary, secondary, note


def _staff_match(value: str) -> str:
    canonical = Member.canonicalize_license_role(value)
    if canonical == Member.LicenseRole.COACH:
        return "coach"
    if canonical in {Member.LicenseRole.DOCTOR, Member.LicenseRole.PHYSIOTHERAPIST}:
        return "medic"
    if canonical == Member.LicenseRole.MEDIA:
        return "media"
    return ""


def staff_function_for(primary_raw: str, secondary_raw: str) -> str:
    return _staff_match(primary_raw) or _staff_match(secondary_raw) or "other"


def role_summary(raw_values: list[str]) -> list[dict]:
    counts: dict[str, int] = {}
    for value in raw_values:
        text = str(value or "").strip()
        if not text:
            continue
        counts[text] = counts.get(text, 0) + 1
    summary = []
    for value, count in sorted(counts.items(), key=lambda item: (-item[1], item[0].casefold())):
        mapped = Member.canonicalize_license_role(value)
        summary.append({"value": value, "count": count, "mapped": mapped or None})
    return summary


def _override_map(options: dict, key: str) -> dict:
    raw = options.get(key) or {}
    return {str(item_key): value for item_key, value in raw.items()}


def _mapping_for(headers, options: dict) -> dict:
    """Use a caller-supplied column map when present.

    A supplied map is not filled back in from the suggestion, so a cleared
    column stays cleared. Email is never mapped. With no map, detection matches
    the previous setup import.
    """
    supplied = options.get("mapping")
    header_set = {str(header) for header in headers}
    if isinstance(supplied, dict):
        mapping = {}
        for key, header in supplied.items():
            if str(key) == "email":
                continue
            header = str(header or "").strip()
            if header in header_set:
                mapping[str(key)] = header
        return mapping
    mapping = suggest_member_mapping(headers)
    mapping.pop("email", None)
    if "membership_end_date" not in mapping:
        end_header = detect_membership_end_date_header(headers, mapping)
        if end_header:
            mapping["membership_end_date"] = end_header
    return mapping


def preview_members(headers, rows, options: dict, *, rewrite_enabled: bool) -> dict:
    options = options or {}
    mapping = _mapping_for(headers, options)
    blank = 0
    kept = []
    for index, row in enumerate(rows, start=1):
        if _blank(row):
            blank += 1
            continue
        kept.append((index, to_row_dict(headers, row)))

    dob_values = [_cell(data, mapping, "date_of_birth") for _, data in kept]
    end_values = [_cell(data, mapping, "membership_end_date") for _, data in kept]
    dob_detect = detect_column_format(dob_values)
    end_detect = detect_column_format(end_values)
    dob_format = str(options.get("date_format") or dob_detect["format"])
    end_format = str(options.get("end_date_format") or end_detect["format"])
    today = timezone.localdate()
    sex_overrides = _override_map(options, "sex_overrides")
    active_overrides = _override_map(options, "active_overrides")
    function_overrides = _override_map(options, "staff_function_overrides")
    role_overrides = _override_map(options, "role_overrides")
    club_overrides = _override_map(options, "club_name_overrides")
    club_choices = _override_map(options, "club_choices")
    allow_missing = {int(item) for item in options.get("allow_missing_id") or []}

    from clubs.models import Club

    clubs_by_key = {}
    for club in Club.objects.filter(is_demo=False):
        clubs_by_key.setdefault(normalize_club_name(club.name), club)

    parsed_rows = []
    gender_counts: dict[str, int] = {}
    raw_roles: list[str] = []
    for index, data in kept:
        sex_raw = _cell(data, mapping, "sex")
        if sex_raw:
            gender_counts[sex_raw] = gender_counts.get(sex_raw, 0) + 1
        else:
            gender_counts["(blank)"] = gender_counts.get("(blank)", 0) + 1
        primary_raw = _cell(data, mapping, "primary_license_role")
        secondary_raw = _cell(data, mapping, "secondary_license_role")
        raw_roles.extend([primary_raw, secondary_raw])
        member_id, _rewritten = apply_ltf_license_id_import_prefix(
            _cell(data, mapping, "ltf_licenseid"),
            enabled=rewrite_enabled,
        )
        sex = parse_gender(sex_raw)
        sex_override = str(sex_overrides.get(str(index)) or "")
        skipped = sex_override == "skip"
        if sex_override in {"M", "F"}:
            sex = sex_override
        sex_blocking = not sex and not skipped
        dob_raw = _cell(data, mapping, "date_of_birth")
        dob = parse_with_format(dob_raw, dob_format) if dob_raw else None
        dob_flag = ""
        if not dob_raw:
            dob_flag = "blank"
        elif dob is None:
            dob_flag = "unparseable"
        elif not plausible_birth_date(dob, today):
            dob_flag = "implausible"
        end_raw = _cell(data, mapping, "membership_end_date")
        end_date = parse_with_format(end_raw, end_format) if end_raw else None
        end_unparseable = bool(end_raw) and end_date is None
        if str(index) in active_overrides:
            is_active = bool(active_overrides[str(index)])
            end_unparseable = False
        elif end_unparseable:
            is_active = None
        elif end_date is None or end_date >= today:
            is_active = True
        else:
            is_active = False
        primary, secondary, role_note = licence_roles(primary_raw, secondary_raw)
        role_override = role_overrides.get(str(index)) or {}
        if isinstance(role_override, dict) and role_override:
            primary = Member.canonicalize_license_role(role_override.get("primary") or "")
            secondary = Member.canonicalize_license_role(role_override.get("secondary") or "")
            if secondary and not primary:
                secondary = ""
            if primary and secondary == primary:
                secondary = ""
            role_note = "override"
        club_raw = _cell(data, mapping, "club_name")
        resolution = _resolve_club(club_raw, clubs_by_key, club_overrides)
        function = staff_function_for(primary_raw, secondary_raw)
        if str(index) in function_overrides:
            function = str(function_overrides[str(index)] or function)
        parsed_rows.append(
            {
                "row_index": index,
                "member_id": member_id,
                "first_name": _cell(data, mapping, "first_name"),
                "last_name": _cell(data, mapping, "last_name"),
                "club_name": club_raw,
                "resolution": resolution,
                "sex": sex,
                "sex_raw": sex_raw,
                "sex_blocking": sex_blocking,
                "skipped": skipped,
                "date_of_birth": dob.isoformat() if dob else None,
                "dob_flag": dob_flag,
                "primary_license_role": primary,
                "secondary_license_role": secondary,
                "primary_raw": primary_raw,
                "secondary_raw": secondary_raw,
                "role_note": role_note,
                "is_active": is_active,
                "end_unparseable": end_unparseable,
                "staff_function": function if resolution["kind"] in {"staff", "near_ltf"} else "",
                "allow_missing_id": index in allow_missing,
            }
        )

    _mark_groups(parsed_rows, club_choices)
    unknown = {}
    for row in parsed_rows:
        if row["resolution"]["kind"] in {"unknown", "near_ltf"} and not row["skipped"]:
            label = row["club_name"]
            bucket = unknown.setdefault(label, {"name": label, "count": 0, "row_indexes": []})
            bucket["count"] += 1
            bucket["row_indexes"].append(row["row_index"])
    blocking = any(_row_blocking(row) for row in parsed_rows)
    return {
        "mapping": {key: value for key, value in mapping.items() if key != "email"},
        "email_ignored": True,
        "rows": parsed_rows,
        "blank_rows_ignored": blank,
        "gender_summary": [{"value": key, "count": count} for key, count in sorted(gender_counts.items())],
        "role_summary": role_summary(raw_roles),
        "unknown_clubs": list(unknown.values()),
        "date_of_birth_format": dob_detect,
        "membership_end_format": end_detect,
        "applied_date_format": dob_format,
        "applied_end_date_format": end_format,
        "can_confirm": not blocking,
        "clubs": [
            {"id": club.id, "name": club.name, "federation": club.federation}
            for club in Club.objects.filter(is_demo=False).order_by("name")
        ],
    }


def _resolve_club(club_raw: str, clubs_by_key: dict, overrides: dict) -> dict:
    key = normalize_club_name(club_raw)
    override = overrides.get(key) or overrides.get(club_raw) or overrides.get(club_raw.casefold())
    if isinstance(override, dict):
        if override.get("skip"):
            return {"kind": "skip", "club_id": None, "club_name": ""}
        if override.get("staff"):
            return {"kind": "staff", "club_id": None, "club_name": "LTF"}
        club_id = override.get("club_id")
        if club_id:
            return {"kind": "club", "club_id": int(club_id), "club_name": club_raw}
    if is_ltf_name(club_raw):
        return {"kind": "staff", "club_id": None, "club_name": "LTF"}
    if is_near_ltf_name(club_raw):
        return {"kind": "near_ltf", "club_id": None, "club_name": club_raw}
    match = clubs_by_key.get(key)
    if match is not None:
        return {"kind": "club", "club_id": match.id, "club_name": match.name}
    return {"kind": "unknown", "club_id": None, "club_name": club_raw}


def _mark_groups(rows: list[dict], club_choices: dict) -> None:
    grouped: dict[str, list[dict]] = {}
    for row in rows:
        if row["skipped"] or not row["member_id"]:
            row["group_conflict"] = False
            continue
        grouped.setdefault(row["member_id"], []).append(row)
    for member_id, group in grouped.items():
        club_ids = {row["resolution"]["club_id"] for row in group if row["resolution"]["kind"] == "club"}
        choice = club_choices.get(member_id)
        if len(club_ids) > 1 and not choice:
            for row in group:
                row["group_conflict"] = True
            continue
        if choice:
            chosen = int(choice)
            for row in group:
                row["group_conflict"] = False
                if row["resolution"]["kind"] == "club":
                    row["resolution"] = {"kind": "club", "club_id": chosen, "club_name": row["club_name"]}
            continue
        for row in group:
            row["group_conflict"] = False
        staff_rows = [row for row in group if row["resolution"]["kind"] == "staff"]
        if staff_rows and club_ids:
            function = next((row["staff_function"] for row in staff_rows if row["staff_function"]), "other")
            for row in group:
                if row["resolution"]["kind"] == "club":
                    row["staff_function"] = function
                    row["also_staff"] = True


def _row_blocking(row: dict) -> bool:
    if row["skipped"]:
        return False
    if row.get("group_conflict"):
        return True
    if row["sex_blocking"]:
        return True
    if row["end_unparseable"]:
        return True
    if not row["member_id"] and not row["allow_missing_id"]:
        return True
    kind = row["resolution"]["kind"]
    if kind in {"unknown", "near_ltf"}:
        return True
    return False


def apply_members(headers, rows, options: dict, *, rewrite_enabled: bool, actor) -> dict:
    planned = preview_members(headers, rows, options, rewrite_enabled=rewrite_enabled)
    if not planned["can_confirm"]:
        return planned | {"confirmed": False, "error": "sex_required" if any(row["sex_blocking"] for row in planned["rows"]) else "unresolved_rows"}
    index = MemberMatchIndex(None)
    created = 0
    updated = 0
    skipped = 0
    staff_ids: set[int] = set()
    seen_ids = set()
    for row in planned["rows"]:
        if row["skipped"] or row["resolution"]["kind"] == "skip":
            skipped += 1
            continue
        if row["member_id"] and row["member_id"] in seen_ids and row["resolution"]["kind"] == "staff" and not row.get("also_staff"):
            member = Member.objects.filter(ltf_licenseid=row["member_id"]).first()
            if member is not None and row["staff_function"]:
                _apply_function(member, function=row["staff_function"], started_on=None, ended_on=None, actor=actor)
                staff_ids.add(member.id)
            skipped += 1
            continue
        target_club_id = row["resolution"]["club_id"]
        wants_staff = row["resolution"]["kind"] == "staff" or row.get("also_staff")
        member, match_by = index.match(
            ltf_licenseid=row["member_id"],
            wt_licenseid="",
            first_name=row["first_name"],
            last_name=row["last_name"],
            date_of_birth=date.fromisoformat(row["date_of_birth"]) if row["date_of_birth"] else None,
            club_id=target_club_id,
        )
        if member is not None and match_by == "ltf_licenseid" and member.club_id and target_club_id and member.club_id != target_club_id:
            skipped += 1
            row["disposition"] = "club_conflict"
            continue
        if member is None or getattr(member, "pk", 0) < 1:
            member = Member(
                first_name=row["first_name"] or "Unknown",
                last_name=row["last_name"] or "UNKNOWN",
                sex=row["sex"],
                club_id=target_club_id,
                ltf_licenseid=row["member_id"],
                email="",
                is_active=bool(row["is_active"]),
                primary_license_role=row["primary_license_role"],
                secondary_license_role=row["secondary_license_role"],
                date_of_birth=date.fromisoformat(row["date_of_birth"]) if row["date_of_birth"] else None,
            )
            member.save()
            created += 1
            index.register(member)
        else:
            member.club_id = target_club_id if target_club_id else member.club_id
            if row["first_name"]:
                member.first_name = row["first_name"]
            if row["last_name"]:
                member.last_name = row["last_name"]
            member.sex = row["sex"]
            member.is_active = bool(row["is_active"])
            member.primary_license_role = row["primary_license_role"]
            member.secondary_license_role = row["secondary_license_role"]
            if row["date_of_birth"]:
                member.date_of_birth = date.fromisoformat(row["date_of_birth"])
            if row["member_id"]:
                member.ltf_licenseid = row["member_id"]
            member.email = member.email or ""
            member.save()
            updated += 1
            index.reindex(member)
        if wants_staff and row["staff_function"]:
            _apply_function(
                member,
                function=row["staff_function"],
                started_on=None,
                ended_on=None,
                actor=actor,
            )
            staff_ids.add(member.id)
        if row["member_id"]:
            seen_ids.add(row["member_id"])
        row["disposition"] = "saved"
    return {
        "confirmed": True,
        "created": created,
        "updated": updated,
        "skipped": skipped,
        "ltf_staff": len(staff_ids),
        "blank_rows_ignored": planned["blank_rows_ignored"],
        "role_summary": planned["role_summary"],
        "gender_summary": planned["gender_summary"],
    }
