"""Wizard step 2: members and LTF staff from a SimplyCompete export."""

from __future__ import annotations

from datetime import date

from django.utils import timezone

from imports.csv_utils import to_row_dict
from imports.gender import parse_import_gender as parse_gender
from imports.mapping import detect_membership_end_date_header, normalize_header, suggest_member_mapping
from imports.member_match import MemberMatchIndex
from imports.views import resolve_import_license_ids
from members.ltf_staff import _apply_function
from members.models import Member
from members.parking import (
    AMBIGUOUS_CLUB,
    CLUB_NOT_FOUND,
    DUPLICATE_CLUBS,
    END_DATE,
    GENDER_BLANK,
    GENDER_VALUE,
    NEAR_LTF,
    NO_CLUB,
    clear_parked_state,
    is_parked,
    record_park_audit,
    record_resolve_audit,
    upsert_parked_member,
)
from members.services import (
    LTF_LICENSE_IMPORT_SOURCE_PREFIX,
    LTF_LICENSE_IMPORT_TARGET_PREFIX,
)

from .dates import detect_column_format, parse_with_format, plausible_birth_date
from .names import is_ltf_name, is_near_ltf_name, loose_club_key, normalize_club_name


def _blank(row) -> bool:
    return all(not str(cell or "").strip() for cell in row)


def _cell(data, mapping, field) -> str:
    header = str(mapping.get(field) or "").strip()
    if not header:
        return ""
    return str(data.get(header) or "").strip()


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
    column stays cleared. Email is never mapped. The app-generated member id
    (id, member_id) is never a target. With no map, detection matches the
    previous setup import and also copies a Member ID column onto both licence ids.
    """
    supplied = options.get("mapping")
    header_set = {str(header) for header in headers}
    if isinstance(supplied, dict):
        mapping = {}
        for key, header in supplied.items():
            if str(key) in {"email", "id", "member_id"}:
                continue
            header = str(header or "").strip()
            if header in header_set:
                mapping[str(key)] = header
        return mapping
    mapping = suggest_member_mapping(headers)
    mapping.pop("email", None)
    mapping.pop("id", None)
    mapping.pop("member_id", None)
    if "membership_end_date" not in mapping:
        end_header = detect_membership_end_date_header(headers, mapping)
        if end_header:
            mapping["membership_end_date"] = end_header
    _share_member_id_column(mapping)
    return mapping


def _share_member_id_column(mapping: dict) -> None:
    """SimplyCompete's Member ID column is both the WT id and the LTF id.

    Auto-detect fills both targets from that one column, matching a manual
    mapping in the regular member import. A caller-supplied map is left as-is,
    so clearing one of the two fields stays cleared. A dedicated WT column is
    not overwritten.
    """
    if mapping.get("wt_licenseid") or not mapping.get("ltf_licenseid"):
        return
    compact = normalize_header(mapping["ltf_licenseid"]).replace(" ", "")
    if compact == "memberid":
        mapping["wt_licenseid"] = mapping["ltf_licenseid"]


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
    parked_rows = set()
    for item in options.get("parked_rows") or []:
        try:
            parked_rows.add(int(item))
        except (TypeError, ValueError):
            continue

    from clubs.models import Club

    exact_clubs: dict[str, list] = {}
    loose_clubs: dict[str, list] = {}
    for club in Club.objects.filter(is_demo=False):
        exact_clubs.setdefault(normalize_club_name(club.name), []).append(club)
        loose_clubs.setdefault(loose_club_key(club.name), []).append(club)

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
        wt_license_id, member_id, ltf_rewritten = resolve_import_license_ids(data, mapping, rewrite_enabled)
        sex = parse_gender(sex_raw)
        sex_override = str(sex_overrides.get(str(index)) or "")
        skipped = sex_override == "skip" or not _cell(data, mapping, "first_name") or not _cell(data, mapping, "last_name")
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
        resolution = _resolve_club(club_raw, exact_clubs, loose_clubs, club_overrides)
        function = staff_function_for(primary_raw, secondary_raw)
        if str(index) in function_overrides:
            function = str(function_overrides[str(index)] or function)
        parsed_rows.append(
            {
                "row_index": index,
                "member_id": member_id,
                "wt_license_id": wt_license_id,
                "ltf_license_id": member_id,
                "ltf_rewritten": ltf_rewritten,
                "first_name": _cell(data, mapping, "first_name"),
                "last_name": _cell(data, mapping, "last_name"),
                "club_name": club_raw,
                "resolution": resolution,
                "club_matches": ", ".join(resolution.get("matches") or []),
                "conflict_clubs": "",
                "dob_raw": dob_raw,
                "end_raw": end_raw,
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
    _annotate_parking(parsed_rows, parked_rows)
    unknown = {}
    for row in parsed_rows:
        if row.get("parked"):
            continue
        if row["resolution"]["kind"] in {"unknown", "near_ltf", "ambiguous", "no_club"} and not row["skipped"]:
            label = row["club_name"]
            bucket = unknown.setdefault(label, {"name": label, "count": 0, "row_indexes": []})
            bucket["count"] += 1
            bucket["row_indexes"].append(row["row_index"])
    blocking = any(_row_blocking(row) for row in parsed_rows)
    rewritten_count = sum(1 for row in parsed_rows if row["ltf_rewritten"])
    return {
        "mapping": {key: value for key, value in mapping.items() if key != "email"},
        "email_ignored": True,
        "ltf_license_prefix_rewrite": {
            "enabled": bool(rewrite_enabled),
            "source_prefix": LTF_LICENSE_IMPORT_SOURCE_PREFIX,
            "target_prefix": LTF_LICENSE_IMPORT_TARGET_PREFIX,
            "rewritten_count": rewritten_count,
        },
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


def _club_resolution(club_raw: str, matches: list) -> dict:
    if len(matches) == 1:
        club = matches[0]
        return {"kind": "club", "club_id": club.id, "club_name": club.name, "matches": []}
    labels = [f"{club.name} ({club.federation})" for club in matches]
    return {"kind": "ambiguous", "club_id": None, "club_name": club_raw, "matches": labels}


def _resolve_club(club_raw: str, exact_clubs: dict, loose_clubs: dict, overrides: dict) -> dict:
    key = normalize_club_name(club_raw)
    override = overrides.get(key) or overrides.get(club_raw) or overrides.get(club_raw.casefold())
    if isinstance(override, dict):
        if override.get("skip"):
            return {"kind": "skip", "club_id": None, "club_name": "", "matches": []}
        if override.get("staff"):
            return {"kind": "staff", "club_id": None, "club_name": "LTF", "matches": []}
        club_id = override.get("club_id")
        if club_id:
            return {"kind": "club", "club_id": int(club_id), "club_name": club_raw, "matches": []}
    if not str(club_raw or "").strip():
        return {"kind": "no_club", "club_id": None, "club_name": "", "matches": []}
    if is_ltf_name(club_raw):
        return {"kind": "staff", "club_id": None, "club_name": "LTF", "matches": []}
    # A real club wins, even when the name also contains "Luxembourg" and "Taekwondo".
    exact = exact_clubs.get(key) or []
    if exact:
        return _club_resolution(club_raw, exact)
    loose = loose_clubs.get(loose_club_key(club_raw)) or []
    if loose:
        return _club_resolution(club_raw, loose)
    if is_near_ltf_name(club_raw):
        return {"kind": "near_ltf", "club_id": None, "club_name": club_raw, "matches": []}
    return {"kind": "unknown", "club_id": None, "club_name": club_raw, "matches": []}


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
            names = []
            for row in group:
                label = row["resolution"].get("club_name") or row["club_name"]
                if label and label not in names:
                    names.append(label)
            joined = ", ".join(names)
            for row in group:
                row["group_conflict"] = True
                row["conflict_clubs"] = joined
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


def _park_reasons_for(row: dict) -> list[str]:
    if row["skipped"] or row["resolution"]["kind"] in {"skip", "staff"} or row.get("also_staff"):
        return []
    reasons = []
    if row.get("group_conflict"):
        reasons.append(DUPLICATE_CLUBS)
    else:
        kind = row["resolution"]["kind"]
        if kind == "no_club":
            reasons.append(NO_CLUB)
        elif kind == "unknown":
            reasons.append(CLUB_NOT_FOUND)
        elif kind == "near_ltf":
            reasons.append(NEAR_LTF)
        elif kind == "ambiguous":
            reasons.append(AMBIGUOUS_CLUB)
    if row["sex_blocking"]:
        reasons.append(GENDER_VALUE if str(row.get("sex_raw") or "").strip() else GENDER_BLANK)
    if row["end_unparseable"]:
        reasons.append(END_DATE)
    return reasons


def _licence_owners():
    by_ltf = {}
    by_wt = {}
    for member in Member.all_objects.all().only("id", "ltf_licenseid", "wt_licenseid", "import_status"):
        ltf = str(member.ltf_licenseid or "").strip().upper()
        wt = str(member.wt_licenseid or "").strip().upper()
        if ltf:
            by_ltf[ltf] = member
        if wt and wt not in by_wt:
            by_wt[wt] = member
    return by_ltf, by_wt


def _annotate_parking(rows: list[dict], requested: set[int]) -> None:
    by_ltf, by_wt = _licence_owners()
    for row in rows:
        reasons = _park_reasons_for(row)
        ident = str(row.get("member_id") or "").strip().upper()
        wt = str(row.get("wt_license_id") or "").strip().upper()
        existing = by_ltf.get(ident) or (by_wt.get(wt) if wt else None)
        existing_active = existing is not None and not is_parked(existing)
        row["park_reasons"] = reasons
        row["parkable"] = bool(
            reasons and row.get("first_name") and row.get("last_name") and row.get("member_id") and not existing_active and not row["skipped"]
        )
        row["parked"] = False
    requested_ids = {row["member_id"] for row in rows if row["row_index"] in requested and row["parkable"]}
    for row in rows:
        if row["parkable"] and (row["row_index"] in requested or (row.get("group_conflict") and row["member_id"] in requested_ids)):
            row["parked"] = True


def _row_blocking(row: dict) -> bool:
    if row["skipped"] or row.get("parked"):
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
    if kind in {"unknown", "near_ltf", "ambiguous", "no_club"}:
        return True
    return False


def _save_parked_row(row: dict, index: MemberMatchIndex, actor, audited: set[int]) -> str:
    member, _match_by = index.match(
        ltf_licenseid=row["member_id"],
        wt_licenseid=row.get("wt_license_id") or "",
        first_name=row["first_name"],
        last_name=row["last_name"],
        date_of_birth=date.fromisoformat(row["date_of_birth"]) if row["date_of_birth"] else None,
        club_id=None,
    )
    if member is not None and getattr(member, "pk", 0) > 0 and not is_parked(member):
        return "skipped"
    club_id = None
    if row["resolution"]["kind"] == "club" and not row.get("group_conflict"):
        club_id = row["resolution"]["club_id"]
    existing_member = member if member is not None and getattr(member, "pk", 0) > 0 else None
    saved, _created = upsert_parked_member(
        existing=existing_member,
        merge_reasons=bool(existing_member is not None and existing_member.pk in audited),
        first_name=row["first_name"],
        last_name=row["last_name"],
        sex=row["sex"] if row["sex"] in {"M", "F"} else "",
        ltf_licenseid=row["member_id"],
        wt_licenseid=row.get("wt_license_id") or "",
        reasons=row.get("park_reasons") or [],
        club_text=row.get("conflict_clubs") or row.get("club_name") or "",
        detail={
            "gender_value": row.get("sex_raw") or "",
            "end_value": row.get("end_raw") or "",
            "matches": row.get("club_matches") or "",
            "clubs": row.get("conflict_clubs") or "",
        },
        primary_role=row["primary_license_role"],
        secondary_role=row["secondary_license_role"],
        date_of_birth=date.fromisoformat(row["date_of_birth"]) if row["date_of_birth"] else None,
        club_id=club_id,
    )
    index.register(saved)
    if saved.pk in audited:
        return "merged"
    record_park_audit(actor, saved, source="setup")
    audited.add(saved.pk)
    row["disposition"] = "parked"
    return "parked"


def apply_members(headers, rows, options: dict, *, rewrite_enabled: bool, actor) -> dict:
    planned = preview_members(headers, rows, options, rewrite_enabled=rewrite_enabled)
    blocking_rows = [row for row in planned["rows"] if _row_blocking(row)]
    if blocking_rows:
        error = "sex_required" if any(row["sex_blocking"] for row in blocking_rows) else "unresolved_rows"
        return planned | {"confirmed": False, "error": error}
    index = MemberMatchIndex(None)
    created = 0
    updated = 0
    skipped = 0
    parked = 0
    audited_parks: set[int] = set()
    staff_ids: set[int] = set()
    seen_ids = set()
    for row in planned["rows"]:
        if row["skipped"] or row["resolution"]["kind"] == "skip":
            skipped += 1
            continue
        if row.get("parked"):
            outcome = _save_parked_row(row, index, actor, audited_parks)
            if outcome == "parked":
                parked += 1
            else:
                skipped += 1
            continue
        if row["member_id"] and row["member_id"] in seen_ids and row["resolution"]["kind"] == "staff" and not row.get("also_staff"):
            member = Member.all_objects.filter(ltf_licenseid=row["member_id"]).first()
            if member is not None and row["staff_function"]:
                _apply_function(member, function=row["staff_function"], started_on=None, ended_on=None, actor=actor)
                staff_ids.add(member.id)
            skipped += 1
            continue
        target_club_id = row["resolution"]["club_id"]
        wants_staff = row["resolution"]["kind"] == "staff" or row.get("also_staff")
        member, match_by = index.match(
            ltf_licenseid=row["member_id"],
            wt_licenseid=row.get("wt_license_id") or "",
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
                wt_licenseid=row.get("wt_license_id") or "",
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
            if row.get("wt_license_id"):
                member.wt_licenseid = row["wt_license_id"]
            member.email = member.email or ""
            was_parked = is_parked(member)
            if was_parked and row["sex"] in {"M", "F"} and row["resolution"]["kind"] in {"club", "staff"}:
                clear_parked_state(member)
                if row["resolution"]["kind"] == "staff":
                    member.club_id = None
            member.save()
            if was_parked and not is_parked(member):
                record_resolve_audit(actor, member, source="setup")
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
        "parked": parked,
        "ltf_staff": len(staff_ids),
        "blank_rows_ignored": planned["blank_rows_ignored"],
        "role_summary": planned["role_summary"],
        "gender_summary": planned["gender_summary"],
    }
