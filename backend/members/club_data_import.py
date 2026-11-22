"""Club-admin import check for members, licences, and grades.

This step reads a file, maps columns, and reports what a commit would do.
It does not write member rows. The commit and the undo come later.
"""

from __future__ import annotations

import csv
import io
import json
import re
import zipfile
from datetime import date, datetime, timedelta

from django.utils import timezone
from openpyxl import Workbook, load_workbook

from clubs.iso3166 import normalize_country_code
from licenses.models import License
from members.club_data_export import (
    GRADE_KEYS,
    LICENSE_KEYS,
    LOCALES,
    _TITLES,
    normalize_locale,
    safe_cell,
)
from members.grades import OFFICIAL_GRADE_SET
from members.models import GradePromotionHistory, Member
from members.ssn_mask import MASKED_SOCIAL_SECURITY_NUMBER, mask_social_security_number

MAX_BYTES = 5 * 1024 * 1024
MAX_ROWS = 5000
PREVIEW_LIMIT = 200
FILE_HOURS = 72
ALLOWED_SHEETS = ("members", "licences", "grades")
ZIP_NAMES = {"members.csv", "licences.csv", "grades.csv", "manifest.csv"}

IMPORT_MEMBER_KEYS = (
    "member_ref",
    "last_name",
    "first_name",
    "usual_name",
    "sex",
    "date_of_birth",
    "email",
    "ltf_licenseid",
    "wt_licenseid",
    "belt_rank",
    "nationality_1",
    "social_security_country",
    "social_security_number",
    "primary_license_role",
    "secondary_license_role",
    "is_active",
)

_SHEET_FIELDS = {
    "members": IMPORT_MEMBER_KEYS,
    "licences": LICENSE_KEYS,
    "grades": GRADE_KEYS,
}

_EXTRA_TITLES = {
    "en": {
        "nationality_1": "Nationality",
        "social_security_country": "Social security country",
        "social_security_number": "Social security number",
    },
    "fr": {
        "nationality_1": "Nationalité",
        "social_security_country": "Pays du numéro",
        "social_security_number": "Numéro de sécurité sociale",
    },
    "de": {
        "nationality_1": "Staatsangehörigkeit",
        "social_security_country": "Land der Nummer",
        "social_security_number": "Sozialversicherungsnummer",
    },
    "lb": {
        "nationality_1": "Nationalitéit",
        "social_security_country": "Land vun der Nummer",
        "social_security_number": "Sozialversécherungsnummer",
    },
}

_ALIASES = {
    "dob": "date_of_birth",
    "birth date": "date_of_birth",
    "birthdate": "date_of_birth",
    "nom": "last_name",
    "lastname": "last_name",
    "surname": "last_name",
    "prenom": "first_name",
    "prénom": "first_name",
    "firstname": "first_name",
    "téléphone": "ignore",
    "telephone": "ignore",
    "notfall": "ignore",
}


class ImportFileError(Exception):
    def __init__(self, code: str):
        self.code = code
        super().__init__(code)


def expire_uploads(club_id: int) -> None:
    from members.models import ClubDataImportUpload

    cutoff = timezone.now() - timedelta(hours=FILE_HOURS)
    old = ClubDataImportUpload.objects.filter(club_id=club_id, created_at__lt=cutoff)
    for row in old:
        row.stored.delete(save=False)
    old.delete()


def _titles(locale: str) -> dict[str, str]:
    words = dict(_TITLES[normalize_locale(locale)])
    words.update(_EXTRA_TITLES[normalize_locale(locale)])
    return words


def _sample_tables() -> dict[str, list[dict]]:
    member = {key: "" for key in IMPORT_MEMBER_KEYS}
    member.update(
        {
            "member_ref": "m-0001",
            "last_name": "EXAMPLE",
            "first_name": "Ada",
            "sex": "F",
            "date_of_birth": "1990-01-02",
            "email": "ada@example.test",
            "ltf_licenseid": "LTF-EX-0001",
            "belt_rank": "10th Kup",
        }
    )
    licence = {key: "" for key in LICENSE_KEYS}
    licence.update(
        {
            "member_ref": "m-0001",
            "license_type": "Athlete",
            "year": "2026",
            "start_date": "2026-01-01",
            "end_date": "2026-12-31",
            "status": "active",
        }
    )
    grade = {key: "" for key in GRADE_KEYS}
    grade.update(
        {
            "member_ref": "m-0001",
            "from_grade": "10th Kup",
            "to_grade": "9th Kup",
            "promotion_date": "2026-03-01",
        }
    )
    return {"members": [member], "licences": [licence], "grades": [grade]}


def build_template_xlsx(locale: str) -> bytes:
    book = Workbook()
    default = book.active
    book.remove(default)
    tables = _sample_tables()
    words = _titles(locale)
    for key in ALLOWED_SHEETS:
        sheet = book.create_sheet(key)
        fields = _SHEET_FIELDS[key]
        sheet.append([words[field] for field in fields])
        sheet.append(list(fields))
        sheet.append([safe_cell(tables[key][0].get(field, "")) for field in fields])
    buffer = io.BytesIO()
    book.save(buffer)
    return buffer.getvalue()


def build_template_csv(locale: str) -> bytes:
    tables = _sample_tables()
    words = _titles(locale)
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        manifest = io.StringIO()
        writer = csv.writer(manifest, lineterminator="\n")
        writer.writerow(["file", "key", "rows"])
        for key in ALLOWED_SHEETS:
            fields = _SHEET_FIELDS[key]
            body = io.StringIO()
            body.write("# keys: " + ",".join(fields) + "\n")
            table = csv.writer(body, lineterminator="\n")
            table.writerow([words[field] for field in fields])
            table.writerow(list(fields))
            table.writerow([safe_cell(tables[key][0].get(field, "")) for field in fields])
            archive.writestr(f"{key}.csv", body.getvalue().encode("utf-8"))
            writer.writerow([f"{key}.csv", key, 1])
        archive.writestr("manifest.csv", manifest.getvalue().encode("utf-8"))
    return buffer.getvalue()


def _text_cell(value) -> str:
    if value is None:
        return ""
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    text = str(value).strip()
    if text[:1] in {"=", "+", "-", "@"}:
        return text
    if text.startswith("'") and text[1:2] in {"=", "+", "-", "@"}:
        return text[1:]
    return text


def _decode(raw: bytes) -> str:
    try:
        return raw.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise ImportFileError("bad_encoding") from exc


def _delimiter(header: str) -> str:
    counts = {",": header.count(","), ";": header.count(";"), "\t": header.count("\t")}
    choice = max(counts, key=counts.get)
    return choice if counts[choice] else ","


def _csv_rows(raw: bytes) -> tuple[list[str], list[str] | None, list[list[str]]]:
    text = _decode(raw)
    lines = text.splitlines()
    keys_line = ""
    body_lines = []
    for line in lines:
        if line.startswith("# keys:"):
            keys_line = line.split(":", 1)[1].strip()
            continue
        if line.startswith("#"):
            continue
        body_lines.append(line)
    if not body_lines:
        raise ImportFileError("empty_file")
    delimiter = _delimiter(body_lines[0])
    parsed = list(csv.reader(io.StringIO("\n".join(body_lines)), delimiter=delimiter))
    headers = [_text_cell(cell) for cell in parsed[0]]
    rest = parsed[1:]
    key_row = None
    if keys_line:
        key_row = [part.strip() for part in keys_line.split(",")]
    if rest and _looks_like_keys(rest[0]):
        if key_row is None:
            key_row = [_text_cell(cell) for cell in rest[0]]
        rest = rest[1:]
    data = [[_text_cell(cell) for cell in row] for row in rest if any(_text_cell(cell) for cell in row)]
    return headers, key_row, data


def _looks_like_keys(row) -> bool:
    known = set()
    for fields in _SHEET_FIELDS.values():
        known.update(fields)
    cells = [_text_cell(cell) for cell in row]
    filled = [cell for cell in cells if cell]
    return bool(filled) and all(cell in known or cell == "ignore" for cell in filled)


def _sheet_from_csv(name: str, raw: bytes) -> dict:
    headers, key_row, data = _csv_rows(raw)
    return {"key": name, "headers": headers, "key_row": key_row, "rows": data}


def parse_upload(payload: bytes, file_format: str, *, max_rows: int = MAX_ROWS) -> dict:
    if len(payload) > MAX_BYTES:
        raise ImportFileError("too_large")
    warnings = []
    sheets = []
    if file_format == "xlsx":
        if payload[:2] != b"PK":
            raise ImportFileError("bad_workbook")
        book = load_workbook(io.BytesIO(payload), data_only=False, read_only=True)
        for name in book.sheetnames:
            if name not in ALLOWED_SHEETS:
                warnings.append({"code": "sheet_skipped", "sheet": name})
                continue
            matrix = []
            for row in book[name].iter_rows(values_only=True):
                matrix.append([_text_cell(cell) for cell in row])
                if len(matrix) > max_rows + 5:
                    raise ImportFileError("too_many_rows")
            if not matrix:
                continue
            headers = matrix[0]
            rest = matrix[1:]
            key_row = None
            if rest and _looks_like_keys(rest[0]):
                key_row = rest[0]
                rest = rest[1:]
            data = [row for row in rest if any(cell for cell in row)]
            sheets.append({"key": name, "headers": headers, "key_row": key_row, "rows": data})
        book.close()
    elif file_format == "csv":
        sheets.append(_sheet_from_csv("members", payload))
    elif file_format == "zip":
        try:
            archive = zipfile.ZipFile(io.BytesIO(payload))
        except zipfile.BadZipFile as exc:
            raise ImportFileError("bad_zip") from exc
        names = [info.filename for info in archive.infolist() if not info.is_dir()]
        if any("/" in name or name.startswith("\\") or name.endswith(".zip") for name in names):
            raise ImportFileError("bad_zip")
        if any(name not in ZIP_NAMES for name in names):
            unknown = [name for name in names if name not in ZIP_NAMES]
            for name in unknown:
                warnings.append({"code": "sheet_skipped", "sheet": name})
        uncompressed = sum(info.file_size for info in archive.infolist())
        if uncompressed > MAX_BYTES:
            raise ImportFileError("too_large")
        for key in ALLOWED_SHEETS:
            filename = f"{key}.csv"
            if filename not in names:
                continue
            sheets.append(_sheet_from_csv(key, archive.read(filename)))
    elif file_format == "json":
        try:
            body = json.loads(_decode(payload))
        except json.JSONDecodeError as exc:
            raise ImportFileError("bad_json") from exc
        sheets = _sheets_from_json(body)
    else:
        raise ImportFileError("bad_type")
    total = sum(len(sheet["rows"]) for sheet in sheets)
    if total > max_rows:
        raise ImportFileError("too_many_rows")
    if not sheets:
        raise ImportFileError("empty_file")
    return {"sheets": sheets, "warnings": warnings, "numbers_included": _numbers_included(sheets)}


def _sheets_from_json(body: dict) -> list[dict]:
    members = body.get("members") if isinstance(body, dict) else None
    if not isinstance(members, list):
        raise ImportFileError("bad_json")
    member_rows = []
    licence_rows = []
    grade_rows = []
    for person in members:
        if not isinstance(person, dict):
            continue
        member_rows.append({key: _text_cell(person.get(key, "")) for key in IMPORT_MEMBER_KEYS})
        ref = _text_cell(person.get("member_ref", ""))
        for child in person.get("licences") or []:
            if isinstance(child, dict):
                row = {key: _text_cell(child.get(key, "")) for key in LICENSE_KEYS}
                row["member_ref"] = ref
                licence_rows.append(row)
        for child in person.get("grades") or []:
            if isinstance(child, dict):
                row = {key: _text_cell(child.get(key, "")) for key in GRADE_KEYS}
                row["member_ref"] = ref
                grade_rows.append(row)
    sheets = []
    for key, rows, fields in (
        ("members", member_rows, IMPORT_MEMBER_KEYS),
        ("licences", licence_rows, LICENSE_KEYS),
        ("grades", grade_rows, GRADE_KEYS),
    ):
        if not rows:
            continue
        sheets.append(
            {
                "key": key,
                "headers": list(fields),
                "key_row": list(fields),
                "rows": [[row.get(field, "") for field in fields] for row in rows],
            }
        )
    return sheets


def _numbers_included(sheets: list[dict]) -> bool:
    for sheet in sheets:
        if sheet["key"] != "members":
            continue
        headers = sheet["headers"]
        index = None
        if sheet.get("key_row"):
            for position, key in enumerate(sheet["key_row"]):
                if key == "social_security_number":
                    index = position
        if index is None:
            for position, header in enumerate(headers):
                if suggest_field("members", header) == "social_security_number":
                    index = position
        if index is None:
            continue
        for row in sheet["rows"]:
            if index < len(row) and row[index].strip():
                return True
    return False


def _title_index() -> dict[str, str]:
    found = {}
    for locale in LOCALES:
        for key, label in _titles(locale).items():
            found.setdefault(label.casefold(), key)
    return found


_TITLE_INDEX = None


def suggest_field(sheet: str, header: str) -> str:
    global _TITLE_INDEX
    text = (header or "").strip()
    if not text:
        return "ignore"
    if text in _SHEET_FIELDS.get(sheet, ()):
        return text
    if _TITLE_INDEX is None:
        _TITLE_INDEX = _title_index()
    titled = _TITLE_INDEX.get(text.casefold())
    if titled in _SHEET_FIELDS.get(sheet, ()):
        return titled
    alias = _ALIASES.get(text.casefold())
    if alias == "ignore":
        return "ignore"
    if sheet == "members" and text.casefold() in {"grade", "ceinture", "gürtel", "gurt"}:
        return "belt_rank"
    if sheet == "grades" and text.casefold() in {"grade", "ceinture", "gürtel"}:
        return "to_grade"
    if alias in _SHEET_FIELDS.get(sheet, ()):
        return alias
    return "ignore"


def header_shape(headers: list[str]) -> list[str]:
    return sorted(header for header in headers if header)


def saved_mapping_for(club_id: int, sheet: str, headers: list[str]):
    from members.models import ClubDataSavedMapping

    shape = header_shape(headers)
    for row in ClubDataSavedMapping.objects.filter(club_id=club_id, sheet_key=sheet).order_by("-id"):
        if sorted(row.headers or []) == shape:
            return row
    return None


def describe_upload(parsed: dict, club_id: int) -> dict:
    sheets = []
    for sheet in parsed["sheets"]:
        suggested = {}
        if sheet.get("key_row"):
            for header, key in zip(sheet["headers"], sheet["key_row"]):
                if header and key in _SHEET_FIELDS[sheet["key"]]:
                    suggested[header] = key
        for header in sheet["headers"]:
            suggested.setdefault(header, suggest_field(sheet["key"], header))
        saved = saved_mapping_for(club_id, sheet["key"], sheet["headers"])
        if saved is not None:
            suggested = {**suggested, **(saved.mapping or {})}
        sheets.append(
            {
                "key": sheet["key"],
                "headers": [header for header in sheet["headers"] if header],
                "fields": list(_SHEET_FIELDS[sheet["key"]]),
                "suggested": suggested,
                "saved": None
                if saved is None
                else {"id": saved.id, "name": saved.name, "mapping": saved.mapping},
            }
        )
    return {
        "warnings": parsed["warnings"],
        "numbers_included": parsed["numbers_included"],
        "sheets": sheets,
        "mapping_skipped": False,
    }


def _parse_date(text: str) -> tuple[str, str | None]:
    raw = (text or "").strip()
    if not raw:
        return "", None
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", raw):
        try:
            date.fromisoformat(raw)
        except ValueError:
            return "", "bad_date"
        return raw, None
    match = re.fullmatch(r"(\d{1,2})[./](\d{1,2})[./](\d{4})", raw)
    if not match:
        return "", "bad_date"
    day, month, year = int(match.group(1)), int(match.group(2)), int(match.group(3))
    ambiguous = day <= 12 and month <= 12 and day != month
    try:
        parsed = date(year, month, day)
    except ValueError:
        return "", "bad_date"
    return parsed.isoformat(), "ambiguous_date" if ambiguous else None


def _mapped_rows(sheet: dict, mapping: dict[str, str]) -> list[dict]:
    fields = []
    for header in sheet["headers"]:
        target = (mapping or {}).get(header) or "ignore"
        if target not in _SHEET_FIELDS[sheet["key"]]:
            target = "ignore"
        fields.append(target)
    rows = []
    for line, raw in enumerate(sheet["rows"], start=3 if sheet.get("key_row") else 2):
        item = {key: "" for key in _SHEET_FIELDS[sheet["key"]]}
        for target, value in zip(fields, raw):
            if target != "ignore" and value and not item[target]:
                item[target] = value
        item["_line"] = line
        rows.append(item)
    return rows


def _member_indexes(club_id: int):
    by_license = {}
    by_name = {}
    by_number = {}
    people = Member.objects.filter(club_id=club_id).only(
        "id", "first_name", "last_name", "date_of_birth", "ltf_licenseid", "email"
    )
    for person in people:
        license_id = (person.ltf_licenseid or "").strip().upper()
        if license_id:
            by_license[license_id] = person
        if person.date_of_birth and person.last_name and person.first_name:
            key = (
                person.last_name.casefold(),
                person.first_name.casefold(),
                person.date_of_birth.isoformat(),
            )
            by_name.setdefault(key, person)
    from clubmgmt.models import MemberRecord

    records = MemberRecord.objects.filter(member__club_id=club_id).only(
        "member_id", "social_security_number", "social_security_country"
    )
    for record in records:
        number = (record.social_security_number or "").strip()
        country = (record.social_security_country or "").strip().upper()
        if number and country:
            by_number[(number, country)] = record.member_id
    other = {
        (person.ltf_licenseid or "").strip().upper(): person.club_id
        for person in Member.objects.exclude(club_id=club_id).exclude(ltf_licenseid="").only(
            "ltf_licenseid", "club_id"
        )
        if (person.ltf_licenseid or "").strip()
    }
    latest = {}
    history = GradePromotionHistory.objects.filter(club_id=club_id).order_by("member_id", "-promotion_date", "-id")
    for row in history:
        latest.setdefault(row.member_id, row.promotion_date)
    return by_license, by_name, by_number, other, latest


def check_upload(parsed: dict, club_id: int, mapping: dict, actions: dict | None = None) -> dict:
    actions = actions or {}
    by_license, by_name, by_number, other_clubs, latest = _member_indexes(club_id)
    prepared = []
    for sheet in parsed["sheets"]:
        sheet_mapping = (mapping or {}).get(sheet["key"]) or {}
        if not sheet_mapping:
            sheet_mapping = {}
            if sheet.get("key_row"):
                for header, key in zip(sheet["headers"], sheet["key_row"]):
                    if header:
                        sheet_mapping[header] = key
            else:
                for header in sheet["headers"]:
                    sheet_mapping[header] = suggest_field(sheet["key"], header)
        for row in _mapped_rows(sheet, sheet_mapping):
            prepared.append((sheet["key"], row))

    signatures: dict[str, list[int]] = {}
    decisions = []
    for index, (sheet, row) in enumerate(prepared):
        decision = _decide_row(
            sheet,
            row,
            by_license=by_license,
            by_name=by_name,
            by_number=by_number,
            other_clubs=other_clubs,
            latest=latest,
        )
        choice = actions.get(f"{sheet}:{row['_line']}")
        if choice in {"create", "update", "skip"}:
            decision["action"] = choice
        decisions.append(decision)
        if decision["action"] != "skip" and decision["signature"]:
            signatures.setdefault(decision["signature"], []).append(index)

    for indexes in signatures.values():
        if len(indexes) < 2:
            continue
        for index in indexes:
            decisions[index]["codes"].append("duplicate_in_file")
            decisions[index]["action"] = "skip"

    rows = []
    counts = {"ok": 0, "warning": 0, "error": 0, "create": 0, "update": 0, "skip": 0}
    for decision in decisions:
        status = _status(decision["codes"])
        counts[status] += 1
        if status != "error":
            counts[decision["action"]] += 1
        if len(rows) < PREVIEW_LIMIT:
            rows.append(
                {
                    "sheet": decision["sheet"],
                    "line": decision["line"],
                    "status": status,
                    "action": decision["action"],
                    "codes": [code for code in decision["codes"] if code != "ambiguous_date" or True],
                    "stored_date": decision["stored_date"],
                    "preview": decision["preview"],
                }
            )
    return {
        "counts": counts,
        "rows": rows,
        "truncated": len(decisions) > PREVIEW_LIMIT,
        "saved": False,
        "numbers_included": parsed["numbers_included"],
    }


def _status(codes: list[str]) -> str:
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
    warnings = {"ambiguous_date", "nationality_named", "empty_email", "possible_duplicate"}
    if any(code in errors for code in codes):
        return "error"
    if any(code in warnings for code in codes):
        return "warning"
    return "ok"


def _decide_row(sheet, row, *, by_license, by_name, by_number, other_clubs, latest) -> dict:
    codes = []
    stored_date = ""
    preview = {}
    signature = ""
    action = "create"
    if sheet == "members":
        last_name = row["last_name"].strip()
        first_name = row["first_name"].strip()
        if not last_name:
            codes.append("missing_last_name")
        email = row["email"].strip()
        if not email:
            codes.append("empty_email")
        stored_date, date_code = _parse_date(row["date_of_birth"])
        if date_code:
            codes.append(date_code)
        sex = row["sex"].strip().upper()
        if sex and sex not in {"M", "F"}:
            codes.append("bad_sex")
        grade = row["belt_rank"].strip()
        if grade and grade not in OFFICIAL_GRADE_SET:
            codes.append("unknown_grade")
        nationality = row["nationality_1"].strip()
        if nationality:
            code = normalize_country_code(nationality)
            if len(code) == 2 and code.isalpha() and code.isupper():
                if nationality.upper() != code:
                    codes.append("nationality_named")
            else:
                codes.append("unknown_nationality")
        license_id = row["ltf_licenseid"].strip().upper()
        number = row["social_security_number"].strip()
        country = (row["social_security_country"] or "LU").strip().upper()
        matched = None
        if license_id and license_id in other_clubs:
            codes.append("other_club")
        elif license_id and license_id in by_license:
            matched = by_license[license_id].id
            codes.append("possible_duplicate")
            action = "update"
            signature = f"ltf:{license_id}"
        elif number and (number, country) in by_number:
            matched = by_number[(number, country)]
            codes.append("possible_duplicate")
            action = "update"
            signature = f"num:{country}:{number}"
        elif last_name and first_name and stored_date:
            key = (last_name.casefold(), first_name.casefold(), stored_date)
            if key in by_name:
                matched = by_name[key].id
                codes.append("possible_duplicate")
                action = "update"
            signature = f"name:{key[0]}|{key[1]}|{stored_date}"
        elif license_id:
            signature = f"ltf:{license_id}"
        preview = {
            "last_name": last_name,
            "first_name": first_name,
            "date_of_birth": stored_date,
            "ltf_licenseid": row["ltf_licenseid"].strip(),
            "social_security_number": mask_social_security_number(number),
        }
        if matched and "possible_duplicate" in codes and license_id:
            pass
    elif sheet == "licences":
        license_id = row["member_ref"].strip().upper()
        if license_id and license_id in other_clubs:
            codes.append("other_club")
        status = row["status"].strip().lower()
        if status and status not in {item.value for item in License.Status}:
            codes.append("bad_status")
        for field in ("start_date", "end_date"):
            stored, date_code = _parse_date(row[field])
            if date_code == "bad_date":
                codes.append("bad_date")
            elif date_code:
                codes.append(date_code)
                stored_date = stored
        preview = {
            "member_ref": row["member_ref"].strip(),
            "license_type": row["license_type"].strip(),
            "year": row["year"].strip(),
        }
        signature = f"licence:{row['member_ref'].strip()}|{row['year'].strip()}|{row['license_type'].strip()}"
        action = "create"
    else:
        to_grade = row["to_grade"].strip()
        from_grade = row["from_grade"].strip()
        if to_grade and to_grade not in OFFICIAL_GRADE_SET:
            codes.append("unknown_grade")
        if from_grade and from_grade not in OFFICIAL_GRADE_SET:
            codes.append("unknown_grade")
        stored_date, date_code = _parse_date(row["promotion_date"])
        if date_code == "bad_date" or not stored_date:
            codes.append("bad_date")
        elif date_code:
            codes.append(date_code)
        license_id = row["member_ref"].strip().upper()
        member = by_license.get(license_id)
        if member and stored_date:
            latest_date = latest.get(member.id)
            if latest_date and date.fromisoformat(stored_date) < latest_date:
                codes.append("promotion_too_early")
        if license_id and license_id in other_clubs:
            codes.append("other_club")
        preview = {
            "member_ref": row["member_ref"].strip(),
            "from_grade": from_grade,
            "to_grade": to_grade,
            "promotion_date": stored_date,
        }
        signature = f"grade:{row['member_ref'].strip()}|{stored_date}|{to_grade}"
        action = "create"
    if "other_club" in codes or "missing_last_name" in codes:
        action = "skip"
    preview = _mask_preview(preview)
    return {
        "sheet": sheet,
        "line": row["_line"],
        "codes": codes,
        "action": action,
        "signature": signature,
        "stored_date": stored_date,
        "preview": preview,
    }


def _mask_preview(preview: dict) -> dict:
    cleaned = {}
    for key, value in preview.items():
        if key == "social_security_number":
            cleaned[key] = mask_social_security_number(value) if value else ""
            if cleaned[key]:
                cleaned[key] = MASKED_SOCIAL_SECURITY_NUMBER
        else:
            cleaned[key] = value
    return cleaned
