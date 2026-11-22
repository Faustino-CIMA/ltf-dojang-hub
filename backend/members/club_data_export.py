"""Club-admin export of members and licences. No social security numbers."""

from __future__ import annotations

import csv
import html
import io
import json
import re
import zipfile
from datetime import date

from django.utils import timezone
from django.utils.text import slugify
from openpyxl import Workbook

from licenses.models import License
from members.models import GradePromotionHistory, Member

PREPARE_ROW_LIMIT = 500

LOCALES = ("en", "fr", "de", "lb")

MEMBER_KEYS = (
    "member_ref",
    "first_name",
    "last_name",
    "usual_name",
    "sex",
    "date_of_birth",
    "email",
    "ltf_licenseid",
    "wt_licenseid",
    "belt_rank",
    "primary_license_role",
    "secondary_license_role",
    "is_active",
)

LICENSE_KEYS = (
    "member_ref",
    "license_type",
    "year",
    "start_date",
    "end_date",
    "status",
    "issued_on",
    "expiry_locked",
)

GRADE_KEYS = (
    "member_ref",
    "from_grade",
    "to_grade",
    "promotion_date",
    "exam_date",
    "notes",
)

_SHEET_KEYS = {
    "members": MEMBER_KEYS,
    "licences": LICENSE_KEYS,
    "grades": GRADE_KEYS,
}

_TITLES = {
    "en": {
        "member_ref": "Member reference",
        "first_name": "First name",
        "last_name": "Last name",
        "usual_name": "Usual name",
        "sex": "Sex",
        "date_of_birth": "Date of birth",
        "email": "Email",
        "ltf_licenseid": "LTF license ID",
        "wt_licenseid": "WT license ID",
        "belt_rank": "Belt",
        "primary_license_role": "Primary license role",
        "secondary_license_role": "Secondary license role",
        "is_active": "Active",
        "license_type": "License type",
        "year": "Year",
        "start_date": "Start date",
        "end_date": "End date",
        "status": "Status",
        "issued_on": "Issued on",
        "expiry_locked": "Expiry locked",
        "from_grade": "From grade",
        "to_grade": "To grade",
        "promotion_date": "Promotion date",
        "exam_date": "Exam date",
        "notes": "Notes",
    },
    "fr": {
        "member_ref": "Référence du membre",
        "first_name": "Prénom",
        "last_name": "Nom",
        "usual_name": "Nom usuel",
        "sex": "Sexe",
        "date_of_birth": "Date de naissance",
        "email": "E-mail",
        "ltf_licenseid": "Numéro de licence LTF",
        "wt_licenseid": "Numéro de licence WT",
        "belt_rank": "Grade",
        "primary_license_role": "Rôle de licence principal",
        "secondary_license_role": "Rôle de licence secondaire",
        "is_active": "Actif",
        "license_type": "Type de licence",
        "year": "Année",
        "start_date": "Date de début",
        "end_date": "Date de fin",
        "status": "Statut",
        "issued_on": "Délivrée le",
        "expiry_locked": "Échéance verrouillée",
        "from_grade": "Grade de départ",
        "to_grade": "Grade atteint",
        "promotion_date": "Date de promotion",
        "exam_date": "Date d'examen",
        "notes": "Notes",
    },
    "de": {
        "member_ref": "Mitgliedsreferenz",
        "first_name": "Vorname",
        "last_name": "Nachname",
        "usual_name": "Rufname",
        "sex": "Geschlecht",
        "date_of_birth": "Geburtsdatum",
        "email": "E-Mail",
        "ltf_licenseid": "LTF-Lizenznummer",
        "wt_licenseid": "WT-Lizenznummer",
        "belt_rank": "Gürtel",
        "primary_license_role": "Primäre Lizenzrolle",
        "secondary_license_role": "Sekundäre Lizenzrolle",
        "is_active": "Aktiv",
        "license_type": "Lizenzart",
        "year": "Jahr",
        "start_date": "Beginn",
        "end_date": "Ende",
        "status": "Status",
        "issued_on": "Ausgestellt am",
        "expiry_locked": "Ablauf gesperrt",
        "from_grade": "Von Grad",
        "to_grade": "Auf Grad",
        "promotion_date": "Beförderungsdatum",
        "exam_date": "Prüfungsdatum",
        "notes": "Notizen",
    },
    "lb": {
        "member_ref": "Memberreferenz",
        "first_name": "Virnumm",
        "last_name": "Familljennumm",
        "usual_name": "Ruffnumm",
        "sex": "Geschlecht",
        "date_of_birth": "Gebuertsdatum",
        "email": "E-Mail",
        "ltf_licenseid": "LTF-Lizenznummer",
        "wt_licenseid": "WT-Lizenznummer",
        "belt_rank": "Ceinture",
        "primary_license_role": "Primär Lizenzroll",
        "secondary_license_role": "Sekundär Lizenzroll",
        "is_active": "Aktiv",
        "license_type": "Lizenztyp",
        "year": "Joer",
        "start_date": "Ufank",
        "end_date": "Enn",
        "status": "Status",
        "issued_on": "Ausgestallt den",
        "expiry_locked": "Oflaf gespaart",
        "from_grade": "Vum Grad",
        "to_grade": "Op de Grad",
        "promotion_date": "Promotiounsdatum",
        "exam_date": "Examendatum",
        "notes": "Notizen",
    },
}


def normalize_locale(value: str | None) -> str:
    raw = (value or "en").strip().lower().replace("_", "-")
    code = raw.split("-", 1)[0]
    return code if code in LOCALES else "en"


def safe_cell(value) -> str:
    text = "" if value is None else str(value)
    if text[:1] in {"=", "+", "-", "@"}:
        return f"'{text}"
    return text


def _iso(value) -> str:
    if value is None:
        return ""
    if hasattr(value, "date") and not isinstance(value, date):
        value = timezone.localtime(value).date()
    return value.isoformat()


def member_rows(club_id: int) -> list[tuple[int, dict]]:
    people = Member.objects.filter(club_id=club_id).order_by("last_name", "first_name", "id")
    rows = []
    sequence = 0
    for person in people:
        sequence += 1
        license_id = (person.ltf_licenseid or "").strip()
        rows.append(
            (
                person.id,
                {
                    "member_ref": license_id or f"m-{sequence:04d}",
                    "first_name": person.first_name,
                    "last_name": person.last_name,
                    "usual_name": person.usual_name,
                    "sex": person.sex,
                    "date_of_birth": _iso(person.date_of_birth),
                    "email": person.email,
                    "ltf_licenseid": person.ltf_licenseid,
                    "wt_licenseid": person.wt_licenseid,
                    "belt_rank": person.belt_rank,
                    "primary_license_role": person.primary_license_role,
                    "secondary_license_role": person.secondary_license_role,
                    "is_active": "true" if person.is_active else "false",
                },
            )
        )
    return rows


def license_rows(club_id: int, refs: dict[int, str]) -> list[dict]:
    licences = (
        License.objects.filter(club_id=club_id, member__club_id=club_id)
        .select_related("license_type", "member")
        .order_by("member__last_name", "member__first_name", "year", "id")
    )
    rows = []
    for licence in licences:
        rows.append(
            {
                "member_ref": refs.get(licence.member_id, ""),
                "license_type": licence.license_type.name,
                "year": str(licence.year),
                "start_date": _iso(licence.start_date),
                "end_date": _iso(licence.end_date),
                "status": licence.status,
                "issued_on": _iso(licence.issued_at),
                "expiry_locked": "true" if licence.expiry_locked else "false",
            }
        )
    return rows


def grade_rows(club_id: int, refs: dict[int, str]) -> list[dict]:
    history = (
        GradePromotionHistory.objects.filter(club_id=club_id, member__club_id=club_id)
        .order_by("promotion_date", "id")
    )
    rows = []
    for row in history:
        rows.append(
            {
                "member_ref": refs.get(row.member_id, ""),
                "from_grade": row.from_grade,
                "to_grade": row.to_grade,
                "promotion_date": _iso(row.promotion_date),
                "exam_date": _iso(row.exam_date),
                "notes": row.notes,
            }
        )
    return rows


def mask_number(value: str) -> str:
    """Fixed mask. A Luxembourg number is the birth date plus five digits, so the last digits stay hidden."""
    text = str(value or "").strip()
    if not text:
        return ""
    return "•" * 13


def masked_numbers(club_id: int, refs: dict[int, str]) -> dict[str, str]:
    from clubmgmt.models import MemberRecord

    masked = {}
    for record in MemberRecord.objects.filter(member__club_id=club_id).only("member_id", "social_security_number"):
        ref = refs.get(record.member_id)
        if not ref:
            continue
        shown = mask_number(record.social_security_number)
        if shown:
            masked[ref] = shown
    return masked


def export_tables(
    club_id: int,
    *,
    include_members: bool,
    include_licences: bool,
    include_grades: bool,
) -> dict[str, list[dict]]:
    built = member_rows(club_id)
    refs = {member_id: row["member_ref"] for member_id, row in built}
    tables = {}
    if include_members:
        tables["members"] = [row for _member_id, row in built]
    if include_licences:
        tables["licences"] = license_rows(club_id, refs)
    if include_grades:
        tables["grades"] = grade_rows(club_id, refs)
    return tables


def member_refs(club_id: int) -> dict[int, str]:
    return {member_id: row["member_ref"] for member_id, row in member_rows(club_id)}


def _titles(locale: str, keys: tuple[str, ...]) -> list[str]:
    words = _TITLES[normalize_locale(locale)]
    return [words[key] for key in keys]


def _csv_bytes(keys: tuple[str, ...], rows: list[dict], locale: str) -> bytes:
    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\n")
    writer.writerow(_titles(locale, keys))
    writer.writerow(list(keys))
    for row in rows:
        writer.writerow([safe_cell(row.get(key, "")) for key in keys])
    return buffer.getvalue().encode("utf-8")


def _sheet(book: Workbook, name: str, keys: tuple[str, ...], rows: list[dict], locale: str) -> None:
    sheet = book.create_sheet(name)
    sheet.append(_titles(locale, keys))
    sheet.append(list(keys))
    for row in rows:
        sheet.append([safe_cell(row.get(key, "")) for key in keys])


def build_xlsx(tables: dict[str, list[dict]], locale: str) -> bytes:
    book = Workbook()
    default = book.active
    book.remove(default)
    for key in ("members", "licences", "grades"):
        if key in tables:
            _sheet(book, key, _SHEET_KEYS[key], tables[key], locale)
    if not book.sheetnames:
        book.create_sheet("members")
    buffer = io.BytesIO()
    book.save(buffer)
    return buffer.getvalue()


def build_csv_zip(tables: dict[str, list[dict]], locale: str) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        manifest = io.StringIO()
        writer = csv.writer(manifest, lineterminator="\n")
        writer.writerow(["file", "key", "rows"])
        for key in ("members", "licences", "grades"):
            if key not in tables:
                continue
            filename = f"{key}.csv"
            archive.writestr(filename, _csv_bytes(_SHEET_KEYS[key], tables[key], locale))
            writer.writerow([filename, key, len(tables[key])])
        archive.writestr("manifest.csv", manifest.getvalue().encode("utf-8"))
    return buffer.getvalue()


def build_json(tables: dict[str, list[dict]], club_name: str) -> bytes:
    by_ref: dict[str, dict] = {}

    def ensure(ref: str) -> dict:
        row = by_ref.get(ref)
        if row is None:
            row = {"member_ref": ref}
            by_ref[ref] = row
        return row

    for person in tables.get("members", []):
        ensure(person["member_ref"]).update(person)
    for key, child_key in (("licences", "licences"), ("grades", "grades")):
        for row in tables.get(key, []):
            parent = ensure(row["member_ref"])
            parent.setdefault(child_key, [])
            parent[child_key].append({field: value for field, value in row.items() if field != "member_ref"})
    payload = {
        "club": club_name,
        "exported_on": timezone.localdate().isoformat(),
        "members": list(by_ref.values()),
    }
    return json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")


_PDF_COPY = {
    "en": {
        "title": "Club data",
        "exported": "Exported on",
        "licenses": "Licenses",
        "grades": "Grade history",
        "ssn": "Social security number",
        "none": "None",
    },
    "fr": {
        "title": "Données du club",
        "exported": "Exporté le",
        "licenses": "Licences",
        "grades": "Historique des grades",
        "ssn": "Numéro de sécurité sociale",
        "none": "Aucun",
    },
    "de": {
        "title": "Vereinsdaten",
        "exported": "Exportiert am",
        "licenses": "Lizenzen",
        "grades": "Graduierung",
        "ssn": "Sozialversicherungsnummer",
        "none": "Keine",
    },
    "lb": {
        "title": "Veräinsdaten",
        "exported": "Exportéiert den",
        "licenses": "Lizenzen",
        "grades": "Grad-Historique",
        "ssn": "Sozialversécherungsnummer",
        "none": "Keng",
    },
}


def build_pdf(
    tables: dict[str, list[dict]],
    club_name: str,
    locale: str,
    masked: dict[str, str],
    names: dict[str, str] | None = None,
) -> bytes | None:
    from licenses.weasyprint_adapter import write_pdf

    words = _PDF_COPY[normalize_locale(locale)]
    grouped = json.loads(build_json(tables, club_name).decode("utf-8"))
    parts = [
        "<!DOCTYPE html><html><head><meta charset='utf-8'><style>",
        "body{font-family:sans-serif;color:#111;margin:24px}",
        "h1{font-size:18px} h2{font-size:14px;margin-top:18px} h3{font-size:12px} p,li{font-size:11px}",
        "</style></head><body>",
        f"<h1>{html.escape(words['title'])} — {html.escape(club_name)}</h1>",
        f"<p>{html.escape(words['exported'])} {html.escape(grouped['exported_on'])}</p>",
    ]
    members = grouped["members"] or []
    if not members:
        parts.append(f"<p>{html.escape(words['none'])}</p>")
    for person in members:
        ref = person.get("member_ref", "")
        stored = (names or {}).get(ref, "")
        name = stored or " ".join(
            part for part in (person.get("first_name", ""), person.get("last_name", "")) if part
        ).strip() or ref
        parts.append(f"<h2>{html.escape(name)}</h2>")
        shown = masked.get(person.get("member_ref", ""))
        if shown:
            parts.append(f"<p>{html.escape(words['ssn'])} {html.escape(shown)}</p>")
        if "licences" in tables:
            parts.append(f"<h3>{html.escape(words['licenses'])}</h3><ul>")
            licences = person.get("licences") or []
            if not licences:
                parts.append(f"<li>{html.escape(words['none'])}</li>")
            for row in licences:
                line = f"{row.get('year', '')} {row.get('license_type', '')} {row.get('status', '')}".strip()
                parts.append(f"<li>{html.escape(line)}</li>")
            parts.append("</ul>")
        if "grades" in tables:
            parts.append(f"<h3>{html.escape(words['grades'])}</h3><ul>")
            grades = person.get("grades") or []
            if not grades:
                parts.append(f"<li>{html.escape(words['none'])}</li>")
            for row in grades:
                line = f"{row.get('promotion_date', '')} {row.get('from_grade', '')} → {row.get('to_grade', '')}".strip()
                parts.append(f"<li>{html.escape(line)}</li>")
            parts.append("</ul>")
    parts.append("</body></html>")
    return write_pdf("".join(parts))


def download_name(club_name: str, extension: str, today: date | None = None) -> str:
    today = today or timezone.localdate()
    slug = slugify(club_name) or "club"
    slug = re.sub(r"[^a-z0-9-]", "", slug)[:40] or "club"
    return f"{slug}-members-{today.isoformat()}.{extension}"
