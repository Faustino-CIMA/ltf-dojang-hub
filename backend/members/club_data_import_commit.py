"""Save a checked club import, then undo it once within 72 hours.

Grade promotions are append-only. Undo never deletes them.
"""

from __future__ import annotations

import csv
import io
import json
from datetime import date, timedelta

from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.utils import timezone

from licenses.models import License, LicenseType
from members.models import GradePromotionHistory, Member
from members.services import add_grade_promotion

UNDO_HOURS = 72
_MEMBER_FIELDS = (
    "first_name",
    "last_name",
    "sex",
    "email",
    "ltf_licenseid",
    "wt_licenseid",
    "belt_rank",
    "date_of_birth",
    "is_active",
    "primary_license_role",
    "secondary_license_role",
)


def public_result(batch) -> dict:
    return {
        "id": batch.id,
        "status": batch.status,
        "rows_done": batch.rows_done,
        "rows_total": batch.rows_total,
        "counts": batch.counts or {},
        "late_errors": batch.late_errors or [],
        "grades_included": batch.grades_included,
        "grades_not_undone": batch.grades_included,
        "undone": batch.undone_at is not None,
        "undo_open": batch.undone_at is None and timezone.now() < batch.created_at + timedelta(hours=UNDO_HOURS),
    }


def result_csv(batch) -> bytes:
    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\n")
    writer.writerow(["batch_id", "created", "updated", "skipped", "errors"])
    counts = batch.counts or {}
    writer.writerow(
        [
            batch.id,
            counts.get("created", 0),
            counts.get("updated", 0),
            counts.get("skipped", 0),
            counts.get("errors", 0),
        ]
    )
    writer.writerow([])
    writer.writerow(["sheet", "line", "code"])
    for item in batch.late_errors or []:
        writer.writerow([item.get("sheet", ""), item.get("line", ""), item.get("code", "")])
    if batch.grades_included:
        writer.writerow([])
        writer.writerow(["note", "Grade promotions from this import are kept. Undo does not delete them."])
    return buffer.getvalue().encode("utf-8")


def result_json(batch) -> bytes:
    payload = public_result(batch)
    payload["note"] = (
        "Grade promotions from this import are kept. Undo does not delete them."
        if batch.grades_included
        else ""
    )
    return json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")


def apply_decisions(club_id: int, decisions: list, batch) -> None:
    from clubmgmt.models import MemberRecord
    from members.ssn_countries import SsnError, validate_ssn

    counts = {"created": 0, "updated": 0, "skipped": 0, "errors": 0}
    late = []
    snapshot = []
    refs: dict[str, Member] = {}
    accepted = [item for item in decisions if _status_ok(item) and item["action"] in {"create", "update"}]
    skipped = [item for item in decisions if item["action"] == "skip" or not _status_ok(item)]
    counts["skipped"] = len(skipped)
    ordered = [item for item in accepted if item["sheet"] == "members"]
    ordered += [item for item in accepted if item["sheet"] == "licences"]
    ordered += [item for item in accepted if item["sheet"] == "grades"]
    batch.rows_total = len(decisions)
    batch.rows_done = counts["skipped"]
    batch.status = batch.Status.RUNNING
    batch.save(update_fields=["rows_total", "rows_done", "status"])

    with transaction.atomic():
        for item in ordered:
            try:
                with transaction.atomic():
                    op = _apply_one(club_id, item, refs, validate_ssn, SsnError, MemberRecord)
                    if op:
                        snapshot.append(op)
                        if op["op"].startswith("create"):
                            counts["created"] += 1
                        else:
                            counts["updated"] += 1
            except (ValidationError, IntegrityError, SsnError):
                late.append({"sheet": item["sheet"], "line": item["line"], "code": "not_saved"})
                counts["errors"] += 1
            batch.rows_done += 1
            ClubDataImportBatch = batch.__class__
            ClubDataImportBatch.objects.filter(pk=batch.pk).update(rows_done=batch.rows_done)
    batch.counts = counts
    batch.late_errors = late
    batch.snapshot = snapshot
    batch.status = batch.Status.SUCCEEDED
    batch.finished_at = timezone.now()
    batch.save(update_fields=["counts", "late_errors", "snapshot", "status", "finished_at", "rows_done"])


def undo_batch(batch) -> dict:
    from clubmgmt.models import MemberRecord

    if batch.undone_at is not None:
        raise ValidationError("already_undone")
    if timezone.now() >= batch.created_at + timedelta(hours=UNDO_HOURS):
        raise ValidationError("undo_closed")
    kept_grades = 0
    kept_members = 0
    with transaction.atomic():
        for entry in reversed(batch.snapshot or []):
            op = entry.get("op")
            if op == "create_grade":
                kept_grades += 1
                continue
            if op == "create_license":
                License.objects.filter(pk=entry.get("id"), club_id=batch.club_id).delete()
                continue
            if op == "create_member":
                member = Member.objects.filter(pk=entry.get("id"), club_id=batch.club_id).first()
                if member is None:
                    continue
                if GradePromotionHistory.objects.filter(member_id=member.id).exists():
                    kept_members += 1
                    continue
                member.delete()
                continue
            if op == "update_member":
                _restore_member(batch.club_id, entry, MemberRecord)
        batch.undone_at = timezone.now()
        batch.save(update_fields=["undone_at"])
    return {"grades_kept": kept_grades, "members_kept": kept_members}


def _status_ok(item: dict) -> bool:
    errors = {
        "missing_last_name",
        "unknown_grade",
        "bad_date",
        "unknown_nationality",
        "other_club",
        "promotion_too_early",
        "duplicate_in_file",
        "bad_status",
        "bad_sex",
    }
    return not any(code in errors for code in item.get("codes") or [])


def _apply_one(club_id, item, refs, validate_ssn, SsnError, MemberRecord):
    row = item["row"]
    if item["sheet"] == "members":
        return _apply_member(club_id, item, row, refs, validate_ssn, SsnError, MemberRecord)
    if item["sheet"] == "licences":
        return _apply_licence(club_id, item, row, refs)
    return _apply_grade(item, row, refs)


def _apply_member(club_id, item, row, refs, validate_ssn, SsnError, MemberRecord):
    number = row["social_security_number"].strip()
    country = (row["social_security_country"] or "LU").strip().upper()
    clean_number = ""
    if number:
        try:
            clean_number = validate_ssn(country or "LU", number)
        except SsnError as exc:
            raise ValidationError("bad_number") from exc
    stored = item.get("stored_date") or ""
    born = date.fromisoformat(stored) if stored else None
    sex = row["sex"].strip().upper() or Member.Sex.MALE
    if item["action"] == "create" or not item.get("member_id"):
        person = Member(
            club_id=club_id,
            first_name=row["first_name"].strip(),
            last_name=row["last_name"].strip(),
            sex=sex,
            email=row["email"].strip(),
            ltf_licenseid=row["ltf_licenseid"].strip(),
            wt_licenseid=row["wt_licenseid"].strip(),
            belt_rank=row["belt_rank"].strip(),
            date_of_birth=born,
            is_active=_as_bool(row["is_active"], default=True),
            primary_license_role=Member.canonicalize_license_role(row["primary_license_role"]),
            secondary_license_role=Member.canonicalize_license_role(row["secondary_license_role"]),
        )
        person.full_clean()
        person.save()
        if clean_number or row["nationality_1"].strip():
            _write_record(person, clean_number, country, row, MemberRecord)
        _remember(refs, row, person)
        return {"op": "create_member", "id": person.id}
    person = Member.objects.filter(pk=item["member_id"], club_id=club_id).first()
    if person is None:
        raise ValidationError("missing_member")
    record = MemberRecord.objects.filter(member_id=person.id).first()
    previous = {field: _plain(getattr(person, field)) for field in _MEMBER_FIELDS}
    previous["social_security_number"] = record.social_security_number if record else ""
    previous["social_security_country"] = record.social_security_country if record else ""
    previous["nationality_1"] = record.nationality_1 if record else ""
    if row["first_name"].strip():
        person.first_name = row["first_name"].strip()
    if row["last_name"].strip():
        person.last_name = row["last_name"].strip()
    if row["email"].strip():
        person.email = row["email"].strip()
    if row["sex"].strip():
        person.sex = sex
    if born:
        person.date_of_birth = born
    if row["belt_rank"].strip():
        person.belt_rank = row["belt_rank"].strip()
    if row["ltf_licenseid"].strip():
        person.ltf_licenseid = row["ltf_licenseid"].strip()
    if row["wt_licenseid"].strip():
        person.wt_licenseid = row["wt_licenseid"].strip()
    if row["is_active"].strip():
        person.is_active = _as_bool(row["is_active"], default=person.is_active)
    if row["primary_license_role"].strip():
        person.primary_license_role = Member.canonicalize_license_role(row["primary_license_role"])
    if row["secondary_license_role"].strip():
        person.secondary_license_role = Member.canonicalize_license_role(row["secondary_license_role"])
    person.full_clean()
    person.save()
    if clean_number or row["nationality_1"].strip():
        _write_record(person, clean_number, country, row, MemberRecord)
    _remember(refs, row, person)
    return {"op": "update_member", "id": person.id, "previous": previous}


def _apply_licence(club_id, item, row, refs):
    person = _find_member(club_id, row, refs, item.get("member_id"))
    if person is None:
        raise ValidationError("missing_member")
    kind_name = row["license_type"].strip()
    kind = LicenseType.objects.filter(name__iexact=kind_name).first() if kind_name else None
    if kind is None:
        raise ValidationError("unknown_type")
    year_text = row["year"].strip()
    if not year_text.isdigit():
        raise ValidationError("bad_year")
    year = int(year_text)
    start = _date_or(row["start_date"], date(year, 1, 1))
    end = _date_or(row["end_date"], date(year, 12, 31))
    status = row["status"].strip().lower() or License.Status.PENDING
    licence = License(
        member=person,
        club_id=club_id,
        license_type=kind,
        year=year,
        start_date=start,
        end_date=end,
        status=status,
    )
    licence.full_clean()
    licence.save()
    return {"op": "create_license", "id": licence.id}


def _apply_grade(item, row, refs):
    person = _find_member(None, row, refs, item.get("member_id"))
    if person is None:
        raise ValidationError("missing_member")
    stored = item.get("stored_date") or ""
    promotion = date.fromisoformat(stored) if stored else timezone.localdate()
    history = add_grade_promotion(
        person,
        to_grade=row["to_grade"].strip(),
        from_grade=row["from_grade"].strip(),
        promotion_date=promotion,
        notes=row["notes"].strip(),
        sync_member=True,
    )
    return {"op": "create_grade", "id": history.id}


def _find_member(club_id, row, refs, member_id):
    ref = row.get("member_ref", "").strip()
    person = refs.get(ref) or refs.get(ref.upper())
    if person is not None:
        return person
    if member_id:
        found = Member.objects.filter(pk=member_id).first()
        if found is not None and (club_id is None or found.club_id == club_id):
            return found
    license_id = (row.get("ltf_licenseid") or ref).strip()
    if license_id:
        query = Member.objects.filter(ltf_licenseid__iexact=license_id)
        if club_id is not None:
            query = query.filter(club_id=club_id)
        return query.first()
    return None


def _remember(refs, row, person):
    ref = row["member_ref"].strip()
    if ref:
        refs[ref] = person
        refs[ref.upper()] = person
    license_id = row["ltf_licenseid"].strip()
    if license_id:
        refs[license_id] = person
        refs[license_id.upper()] = person


def _write_record(person, number, country, row, MemberRecord):
    from clubs.iso3166 import normalize_country_code

    record, _created = MemberRecord.objects.get_or_create(member=person)
    fields = ["updated_at"]
    if number:
        record.social_security_number = number
        record.social_security_country = country or "LU"
        fields.extend(["social_security_number", "social_security_country"])
    nationality = row["nationality_1"].strip()
    if nationality:
        record.nationality_1 = normalize_country_code(nationality)[:64]
        fields.append("nationality_1")
    record.save(update_fields=fields)


def _restore_member(club_id, entry, MemberRecord):
    person = Member.objects.filter(pk=entry.get("id"), club_id=club_id).first()
    if person is None:
        return
    previous = entry.get("previous") or {}
    for field in _MEMBER_FIELDS:
        if field in previous:
            setattr(person, field, previous[field] or "")
    if previous.get("date_of_birth"):
        person.date_of_birth = date.fromisoformat(previous["date_of_birth"])
    else:
        person.date_of_birth = None
    person.is_active = bool(previous.get("is_active", True))
    person.save()
    record, _created = MemberRecord.objects.get_or_create(member=person)
    record.social_security_number = previous.get("social_security_number") or ""
    record.social_security_country = previous.get("social_security_country") or ""
    record.nationality_1 = previous.get("nationality_1") or ""
    record.save(update_fields=["social_security_number", "social_security_country", "nationality_1", "updated_at"])


def _plain(value):
    if isinstance(value, date):
        return value.isoformat()
    if value is None:
        return ""
    return value


def _as_bool(value, *, default: bool) -> bool:
    text = str(value or "").strip().lower()
    if not text:
        return default
    if text in {"1", "true", "yes", "oui", "ja", "jo"}:
        return True
    if text in {"0", "false", "no", "non", "nee", "neen"}:
        return False
    return default


def _date_or(text, fallback):
    raw = (text or "").strip()
    if len(raw) == 10 and raw[4] == "-":
        return date.fromisoformat(raw)
    return fallback
