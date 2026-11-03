"""Park an incomplete import row on the member record itself.

No second table. Sex may be blank only while parked. Parked people stay
inactive and out of the default member lists until an LTF admin resolves them.
"""

from __future__ import annotations

from members.ltf_staff import _apply_function
from members.models import Member
from ops.models import OpsAuditLog

NO_CLUB = "no_club"
CLUB_NOT_FOUND = "club_not_found"
NEAR_LTF = "near_ltf"
AMBIGUOUS_CLUB = "ambiguous_club"
DUPLICATE_CLUBS = "duplicate_clubs"
GENDER_BLANK = "gender_blank"
GENDER_VALUE = "gender_value"
END_DATE = "end_date"

PARK_REASONS = (
    NO_CLUB,
    CLUB_NOT_FOUND,
    NEAR_LTF,
    AMBIGUOUS_CLUB,
    DUPLICATE_CLUBS,
    GENDER_BLANK,
    GENDER_VALUE,
    END_DATE,
)

CLUB_REASONS = {NO_CLUB, CLUB_NOT_FOUND, NEAR_LTF, AMBIGUOUS_CLUB, DUPLICATE_CLUBS}


def encode_reasons(codes) -> str:
    unique = []
    for code in codes or []:
        if code in PARK_REASONS and code not in unique:
            unique.append(code)
    if not unique:
        return ""
    return "," + ",".join(unique) + ","


def decode_reasons(value: str) -> list[str]:
    return [part for part in str(value or "").split(",") if part in PARK_REASONS]


def is_parked(member) -> bool:
    return getattr(member, "import_status", Member.ImportStatus.ACTIVE) == Member.ImportStatus.PARKED


def merge_club_text(*values) -> str:
    parts = []
    for value in values:
        for bit in str(value or "").split(", "):
            text = bit.strip()
            if text and text not in parts:
                parts.append(text)
    return ", ".join(parts)[:255]


def _actor(actor):
    if actor is not None and getattr(actor, "is_authenticated", False):
        return actor
    return None


def record_park_audit(actor, member, *, source: str) -> None:
    reasons = decode_reasons(member.park_reason)
    OpsAuditLog.objects.create(
        actor=_actor(actor),
        action="member_parked",
        target_type="member",
        target_id=str(member.pk),
        message=(
            f"Parked {member.last_name} {member.first_name}. "
            f"Reason: {', '.join(reasons) or '—'}. Club text: {member.park_club_text or '—'}"
        ),
        metadata={"reasons": reasons, "club_text": member.park_club_text, "source": source},
    )


def record_resolve_audit(actor, member, *, source: str) -> None:
    OpsAuditLog.objects.create(
        actor=_actor(actor),
        action="member_park_resolved",
        target_type="member",
        target_id=str(member.pk),
        message=f"Resolved parked member {member.last_name} {member.first_name}.",
        metadata={"source": source, "club_id": member.club_id, "sex": member.sex, "is_active": member.is_active},
    )


def record_delete_audit(actor, member, *, source: str) -> None:
    OpsAuditLog.objects.create(
        actor=_actor(actor),
        action="member_park_deleted",
        target_type="member",
        target_id=str(member.pk),
        message=f"Deleted parked member {member.last_name} {member.first_name}.",
        metadata={
            "source": source,
            "reasons": decode_reasons(member.park_reason),
            "club_text": member.park_club_text,
            "ltf_licenseid": member.ltf_licenseid,
            "wt_licenseid": member.wt_licenseid,
        },
    )


def clear_parked_state(member) -> None:
    member.import_status = Member.ImportStatus.ACTIVE
    member.park_reason = ""
    member.park_club_text = ""
    member.park_detail = {}


def upsert_parked_member(
    *,
    existing,
    first_name: str,
    last_name: str,
    sex: str,
    ltf_licenseid: str,
    wt_licenseid: str,
    reasons,
    club_text: str,
    detail: dict | None,
    primary_role: str = "",
    secondary_role: str = "",
    date_of_birth=None,
    club_id=None,
    merge_reasons: bool = False,
) -> tuple[Member, bool]:
    """Create a parked member, or refresh one already parked. Returns (member, created).

    A later import replaces the reason with what this file says. Two rows of the
    same person in one file merge their reasons instead.
    """
    stored_sex = sex if sex in {Member.Sex.MALE, Member.Sex.FEMALE} else ""
    updating = existing is not None and getattr(existing, "pk", 0) > 0 and is_parked(existing)
    if updating:
        member = existing
        if merge_reasons:
            reasons = decode_reasons(member.park_reason) + list(reasons or [])
            club_text = merge_club_text(member.park_club_text, club_text)
            previous = member.park_detail if isinstance(member.park_detail, dict) else {}
            merged = dict(previous)
            for key, value in (detail or {}).items():
                if value:
                    merged[key] = value
            detail = merged
    else:
        member = Member(email="")
    member.first_name = first_name or member.first_name or "Unknown"
    member.last_name = last_name or member.last_name or "UNKNOWN"
    member.sex = stored_sex
    member.is_active = False
    member.import_status = Member.ImportStatus.PARKED
    member.club_id = club_id
    member.ltf_licenseid = (ltf_licenseid or member.ltf_licenseid or "").strip().upper()
    member.wt_licenseid = (wt_licenseid or member.wt_licenseid or "").strip().upper()
    member.park_reason = encode_reasons(reasons)
    member.park_club_text = (club_text or "")[:255]
    member.park_detail = detail or {}
    if primary_role:
        member.primary_license_role = primary_role
    if secondary_role:
        member.secondary_license_role = secondary_role
    if date_of_birth:
        member.date_of_birth = date_of_birth
    member.email = member.email or ""
    member.save()
    return member, not updating


def finish_parked_member(member, *, sex: str, is_active: bool, club, ltf_staff: bool, actor, source: str) -> Member:
    if sex not in {Member.Sex.MALE, Member.Sex.FEMALE}:
        raise ValueError("sex")
    if ltf_staff:
        member.club = None
    elif club is None:
        raise ValueError("club")
    else:
        member.club = club
    member.sex = sex
    member.is_active = bool(is_active)
    clear_parked_state(member)
    member.save()
    if ltf_staff:
        _apply_function(member, function="other", started_on=None, ended_on=None, actor=actor)
    record_resolve_audit(actor, member, source=source)
    return member


def assign_club_to_parked(member, club, *, actor) -> str:
    """Set the club. Resolve when sex is already male or female and no other reason remains.

    Gender is never guessed. Returns 'resolved' or 'updated'.
    """
    member.club = club
    remaining = [code for code in decode_reasons(member.park_reason) if code not in CLUB_REASONS]
    if member.sex in {Member.Sex.MALE, Member.Sex.FEMALE} and not remaining:
        member.is_active = True
        clear_parked_state(member)
        member.club = club
        member.save()
        record_resolve_audit(actor, member, source="bulk_assign")
        return "resolved"
    if member.sex not in {Member.Sex.MALE, Member.Sex.FEMALE} and GENDER_BLANK not in remaining and GENDER_VALUE not in remaining:
        detail = member.park_detail if isinstance(member.park_detail, dict) else {}
        remaining.append(GENDER_VALUE if str(detail.get("gender_value") or "").strip() else GENDER_BLANK)
    member.park_reason = encode_reasons(remaining)
    member.is_active = False
    member.import_status = Member.ImportStatus.PARKED
    member.save()
    OpsAuditLog.objects.create(
        actor=_actor(actor),
        action="member_park_updated",
        target_type="member",
        target_id=str(member.pk),
        message=f"Assigned a club to parked member {member.last_name} {member.first_name}.",
        metadata={"source": "bulk_assign", "club_id": club.id, "reasons": remaining},
    )
    return "updated"


def extend_regular_import_row(parsed: dict, *, club_mapped: bool, club_text: str, end_unparseable: bool, end_raw: str) -> list[str]:
    """Add park reasons, and block a normal save when the club cell or end date cannot be used."""
    reasons = []
    issues = list(parsed.get("issues") or [])
    errors = list(parsed.get("errors") or [])
    if club_mapped and not str(club_text or "").strip():
        reasons.append(NO_CLUB)
        if "club is empty" not in errors:
            errors.append("club is empty")
        if not any(item.get("code") == "no_club" for item in issues):
            issues.append({"code": "no_club"})
    sex_raw = str(parsed.get("sex_raw") or "")
    if not parsed.get("sex") and (sex_raw or any(item.get("code") == "gender" for item in issues) or parsed.get("sex_mapped")):
        reasons.append(GENDER_VALUE if sex_raw.strip() else GENDER_BLANK)
    if end_unparseable:
        reasons.append(END_DATE)
        if "membership end date could not be read" not in errors:
            errors.append("membership end date could not be read")
        if not any(item.get("code") == "end_date" for item in issues):
            issues.append({"code": "end_date", "value": end_raw})
    parsed["issues"] = issues
    parsed["errors"] = errors
    parsed["park_reasons"] = reasons
    parsed["club_text"] = club_text if club_mapped else ""
    parsed["end_raw"] = end_raw
    return reasons


def regular_row_parkable(parsed: dict, member, match_by) -> bool:
    reasons = parsed.get("park_reasons") or []
    licence = str(parsed.get("ltf_licenseid") or "").strip() or str(parsed.get("wt_licenseid") or "").strip()
    if not reasons or not licence or not parsed.get("first_name") or not parsed.get("last_name"):
        return False
    if (
        member is not None
        and getattr(member, "pk", 0) > 0
        and match_by in {"ltf_licenseid", "wt_licenseid"}
        and not is_parked(member)
    ):
        return False
    return True
