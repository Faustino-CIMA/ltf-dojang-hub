"""Text and metadata for a member card check, safe to store on the ops audit log."""

from __future__ import annotations


def _iso(value) -> str:
    if value is None or value == "":
        return ""
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value)


def _person(values: dict) -> str:
    last_name = str(values.get("last_name") or "").strip()
    first_name = str(values.get("first_name") or "").strip()
    return f"{last_name} {first_name}".strip()


def verification_audit_message(
    *,
    action: str,
    last_name: str,
    first_name: str,
    club_name: str,
    reason: str,
) -> str:
    name = f"{last_name} {first_name}".strip() or "member"
    if action == "unlock":
        text = f"Unlocked member {name}."
        cleaned = reason.strip()
        if cleaned:
            text = f"{text} {cleaned}"
    else:
        text = f"Verified member {name}."
    club = club_name.strip()
    if club:
        text = f"{text} Club: {club}."
    return text


def verification_audit_metadata(
    *,
    event_id: int,
    fields,
    ssn_changed: bool,
    club_id,
    club_name: str,
    old: dict,
    new: dict,
) -> dict:
    """Names and the fact that a number changed. Never the number itself."""

    return {
        "verification_event_id": event_id,
        "fields": list(fields or []),
        "ssn_changed": bool(ssn_changed),
        "club_id": club_id,
        "club_name": club_name or "",
        "old_name": _person(old),
        "new_name": _person(new),
        "old_date_of_birth": _iso(old.get("date_of_birth")),
        "new_date_of_birth": _iso(new.get("date_of_birth")),
        "old_sex": old.get("sex") or "",
        "new_sex": new.get("sex") or "",
    }
