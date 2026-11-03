"""Match member-import rows and decide which mapped fields may change."""

from __future__ import annotations

from members.models import Member

CREATE_ONLY = "create_only"
CREATE_AND_UPDATE = "create_and_update"

_ROLE_PAIR_ERRORS = {
    "secondary_license_role requires primary_license_role",
    "secondary_license_role must differ from primary_license_role",
}

_UPDATABLE_FIELDS = (
    "first_name",
    "last_name",
    "date_of_birth",
    "belt_rank",
    "email",
    "wt_licenseid",
    "ltf_licenseid",
    "sex",
    "is_active",
    "primary_license_role",
    "secondary_license_role",
)


def parse_update_mode(raw) -> str:
    value = str(raw or "").strip().lower().replace("-", "_")
    if value in {CREATE_AND_UPDATE, "update", "upsert"}:
        return CREATE_AND_UPDATE
    return CREATE_ONLY


def mapping_header(mapping, field: str) -> str:
    if not mapping:
        return ""
    return str(mapping.get(field) or "").strip()


def field_is_mapped(mapping, field: str) -> bool:
    return bool(mapping_header(mapping, field))


_MISSING_CLUB = object()


class MemberMatchIndex:
    """In-memory index for one import pass. Created rows can be registered too.

    Name and date-of-birth matching uses the import's club unless a row passes
    its own club id (None for someone with no club).
    """

    def __init__(self, club_id: int | None):
        self.club_id = club_id
        self.by_ltf: dict[str, object] = {}
        self.by_wt: dict[str, object] = {}
        self.by_name_dob: dict[tuple, object] = {}
        self._name_key_by_pk: dict[int, tuple] = {}
        self._next_shadow_pk = -1
        self._load()

    def _load(self):
        queryset = Member.all_objects.all().only(
            "id",
            "club_id",
            "first_name",
            "last_name",
            "date_of_birth",
            "belt_rank",
            "email",
            "wt_licenseid",
            "ltf_licenseid",
            "sex",
            "is_active",
            "import_status",
            "primary_license_role",
            "secondary_license_role",
        )
        for member in queryset.iterator():
            self.register(member)

    def allocate_shadow_pk(self) -> int:
        pk = self._next_shadow_pk
        self._next_shadow_pk -= 1
        return pk

    def register(self, member):
        ltf = str(getattr(member, "ltf_licenseid", "") or "").strip().upper()
        wt = str(getattr(member, "wt_licenseid", "") or "").strip().upper()
        if ltf:
            self.by_ltf[ltf] = member
        if wt:
            self.by_wt[wt] = member
        dob = getattr(member, "date_of_birth", None)
        first = str(getattr(member, "first_name", "") or "")
        last = str(getattr(member, "last_name", "") or "")
        if dob and first and last and getattr(member, "pk", None) is not None:
            key = _name_dob_key(member.club_id, first, last, dob)
            self.by_name_dob[key] = member
            self._name_key_by_pk[member.pk] = key

    def reindex(self, member):
        pk = getattr(member, "pk", None)
        old_key = self._name_key_by_pk.pop(pk, None) if pk is not None else None
        if old_key is not None and self.by_name_dob.get(old_key) is member:
            del self.by_name_dob[old_key]
        self.by_ltf = {key: owner for key, owner in self.by_ltf.items() if owner is not member}
        self.by_wt = {key: owner for key, owner in self.by_wt.items() if owner is not member}
        self.register(member)

    def match(
        self,
        *,
        ltf_licenseid: str,
        wt_licenseid: str,
        first_name: str,
        last_name: str,
        date_of_birth,
        club_id=_MISSING_CLUB,
    ):
        ltf = str(ltf_licenseid or "").strip().upper()
        wt = str(wt_licenseid or "").strip().upper()
        if ltf and ltf in self.by_ltf:
            return self.by_ltf[ltf], "ltf_licenseid"
        if wt and wt in self.by_wt:
            return self.by_wt[wt], "wt_licenseid"
        resolved_club_id = self.club_id if club_id is _MISSING_CLUB else club_id
        if first_name and last_name and date_of_birth:
            key = _name_dob_key(resolved_club_id, first_name, last_name, date_of_birth)
            member = self.by_name_dob.get(key)
            if member is not None:
                return member, "name_dob"
        return None, None

    def foreign_id_errors(self, member, ltf_licenseid: str, wt_licenseid: str) -> list[str]:
        errors = []
        ltf = str(ltf_licenseid or "").strip().upper()
        wt = str(wt_licenseid or "").strip().upper()
        if ltf:
            owner = self.by_ltf.get(ltf)
            if owner is not None and owner is not member and getattr(owner, "pk", None) != getattr(member, "pk", None):
                errors.append("ltf_licenseid must be unique")
        if wt:
            owner = self.by_wt.get(wt)
            if owner is not None and owner is not member and getattr(owner, "pk", None) != getattr(member, "pk", None):
                errors.append("wt_licenseid must be unique")
        return errors


def _name_dob_key(club_id, first_name, last_name, date_of_birth):
    dob = date_of_birth.isoformat() if hasattr(date_of_birth, "isoformat") else str(date_of_birth)
    return (
        club_id,
        Member.normalize_first_name(first_name),
        Member.normalize_last_name(last_name),
        dob,
    )


def _stored(member, field):
    value = getattr(member, field, None)
    if value is None:
        return ""
    return value


def member_field_changes(member, parsed: dict, mapping) -> dict:
    """Return mapped, non-empty values that differ from the member.

    Club is never included. Role and active status change only when that
    column is explicitly mapped and the incoming value is non-empty.
    """
    changes = {}

    if field_is_mapped(mapping, "first_name"):
        new_value = Member.normalize_first_name(parsed.get("first_name"))
        if new_value and new_value != _stored(member, "first_name"):
            changes["first_name"] = new_value
    if field_is_mapped(mapping, "last_name"):
        new_value = Member.normalize_last_name(parsed.get("last_name"))
        if new_value and new_value != _stored(member, "last_name"):
            changes["last_name"] = new_value

    for field in ("belt_rank", "email"):
        if not field_is_mapped(mapping, field):
            continue
        new_value = str(parsed.get(field) or "").strip()
        if new_value and new_value != str(_stored(member, field) or ""):
            changes[field] = new_value

    for field in ("wt_licenseid", "ltf_licenseid"):
        if not field_is_mapped(mapping, field):
            continue
        new_value = str(parsed.get(field) or "").strip().upper()
        if new_value and new_value != str(_stored(member, field) or "").strip().upper():
            changes[field] = new_value

    if field_is_mapped(mapping, "date_of_birth") and parsed.get("date_of_birth"):
        if parsed["date_of_birth"] != getattr(member, "date_of_birth", None):
            changes["date_of_birth"] = parsed["date_of_birth"]

    if field_is_mapped(mapping, "sex") and parsed.get("sex"):
        if parsed["sex"] != getattr(member, "sex", None):
            changes["sex"] = parsed["sex"]

    for field in ("primary_license_role", "secondary_license_role"):
        if not field_is_mapped(mapping, field):
            continue
        new_value = str(parsed.get(field) or "").strip()
        if new_value and new_value != str(_stored(member, field) or ""):
            changes[field] = new_value

    if parsed.get("is_active_mapped") and isinstance(parsed.get("is_active"), bool):
        if parsed["is_active"] != bool(getattr(member, "is_active", True)):
            changes["is_active"] = parsed["is_active"]

    return {field: changes[field] for field in _UPDATABLE_FIELDS if field in changes}


def _merged_role_errors(member, changes: dict) -> list[str]:
    primary = changes.get("primary_license_role", str(_stored(member, "primary_license_role") or ""))
    secondary = changes.get("secondary_license_role", str(_stored(member, "secondary_license_role") or ""))
    errors = []
    if secondary and not primary:
        errors.append("secondary_license_role requires primary_license_role")
    if primary and secondary and primary == secondary:
        errors.append("secondary_license_role must differ from primary_license_role")
    return errors


def _without_role_pair_errors(errors: list[str]) -> list[str]:
    return [error for error in errors if error not in _ROLE_PAIR_ERRORS]


def json_safe(value):
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return value


def plan_member_row(*, user, club_id: int, update_mode: str, mapping, match_index: MemberMatchIndex, parsed: dict) -> dict:
    """Decide create, update, or skip without writing."""
    errors = list(parsed.get("errors") or [])
    member, match_by = match_index.match(
        ltf_licenseid=parsed.get("ltf_licenseid") or "",
        wt_licenseid=parsed.get("wt_licenseid") or "",
        first_name=parsed.get("first_name") or "",
        last_name=parsed.get("last_name") or "",
        date_of_birth=parsed.get("date_of_birth"),
    )
    real_existing_id = member.pk if member is not None and getattr(member, "pk", 0) and member.pk > 0 else None
    parked_licence = (
        member is not None
        and match_by in {"ltf_licenseid", "wt_licenseid"}
        and getattr(member, "pk", 0) > 0
        and getattr(member, "import_status", Member.ImportStatus.ACTIVE) == Member.ImportStatus.PARKED
    )

    if member is not None and update_mode != CREATE_AND_UPDATE and not parked_licence:
        return {
            "disposition": "skip",
            "changed_fields": [],
            "changes": {},
            "existing_id": real_existing_id,
            "match_by": match_by,
            "duplicate": True,
            "errors": [],
            "member": member,
        }

    if member is not None and getattr(user, "role", "") == "club_admin" and member.club_id != club_id:
        return {
            "disposition": "skip",
            "changed_fields": [],
            "changes": {},
            "existing_id": real_existing_id,
            "match_by": match_by,
            "duplicate": True,
            "errors": ["You are not allowed to update members from another club."],
            "member": member,
        }

    if member is not None:
        id_errors = match_index.foreign_id_errors(
            member,
            parsed.get("ltf_licenseid") or "",
            parsed.get("wt_licenseid") or "",
        )
        merged_errors = _without_role_pair_errors(errors) + id_errors
        changes = {}
        if not merged_errors:
            changes = member_field_changes(member, parsed, mapping)
            merged_errors.extend(_merged_role_errors(member, changes))
        if merged_errors:
            return {
                "disposition": "skip",
                "changed_fields": [],
                "changes": {},
                "existing_id": real_existing_id,
                "match_by": match_by,
                "duplicate": True,
                "errors": merged_errors,
                "member": member,
            }
        if not changes and not parked_licence:
            return {
                "disposition": "skip",
                "changed_fields": [],
                "changes": {},
                "existing_id": real_existing_id,
                "match_by": match_by,
                "duplicate": True,
                "errors": [],
                "member": member,
            }
        if not changes and parked_licence:
            return {
                "disposition": "update",
                "changed_fields": [],
                "changes": {},
                "existing_id": real_existing_id,
                "match_by": match_by,
                "duplicate": False,
                "errors": [],
                "member": member,
                "clear_park": True,
            }
        return {
            "disposition": "update",
            "changed_fields": list(changes.keys()),
            "changes": changes,
            "existing_id": real_existing_id,
            "match_by": match_by,
            "duplicate": False,
            "errors": [],
            "member": member,
            "clear_park": parked_licence,
        }

    create_errors = list(errors)
    create_errors.extend(
        match_index.foreign_id_errors(
            _Unmatched(),
            parsed.get("ltf_licenseid") or "",
            parsed.get("wt_licenseid") or "",
        )
    )
    if create_errors:
        return {
            "disposition": "skip",
            "changed_fields": [],
            "changes": {},
            "existing_id": None,
            "match_by": None,
            "duplicate": False,
            "errors": create_errors,
            "member": None,
        }
    return {
        "disposition": "create",
        "changed_fields": [],
        "changes": {},
        "existing_id": None,
        "match_by": None,
        "duplicate": False,
        "errors": [],
        "member": None,
    }


class _Unmatched:
    pk = None


def remember_planned_member(match_index: MemberMatchIndex, *, club_id: int, parsed: dict, plan: dict):
    """Track a create or update so later rows in the same file match it."""
    member = plan.get("member")
    if plan["disposition"] == "create":
        sex = parsed.get("sex") or Member.Sex.MALE
        is_active = parsed.get("is_active")
        snapshot = _ShadowMember(
            pk=match_index.allocate_shadow_pk(),
            club_id=club_id,
            first_name=Member.normalize_first_name(parsed.get("first_name")),
            last_name=Member.normalize_last_name(parsed.get("last_name")),
            date_of_birth=parsed.get("date_of_birth"),
            belt_rank=str(parsed.get("belt_rank") or "").strip(),
            email=str(parsed.get("email") or "").strip(),
            wt_licenseid=str(parsed.get("wt_licenseid") or "").strip().upper(),
            ltf_licenseid=str(parsed.get("ltf_licenseid") or "").strip().upper(),
            sex=sex,
            is_active=True if is_active is None else is_active,
            import_status=Member.ImportStatus.ACTIVE,
            primary_license_role=str(parsed.get("primary_license_role") or ""),
            secondary_license_role=str(parsed.get("secondary_license_role") or ""),
        )
        match_index.register(snapshot)
        plan["member"] = snapshot
        return
    if plan["disposition"] == "update" and member is not None:
        for field, value in plan["changes"].items():
            setattr(member, field, value)
        match_index.reindex(member)


class _ShadowMember:
    def __init__(self, **kwargs):
        for key, value in kwargs.items():
            setattr(self, key, value)
