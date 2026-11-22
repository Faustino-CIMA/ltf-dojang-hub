"""Club-admin export of members and licences. No social security numbers."""

from __future__ import annotations

import csv
import io
import re
import zipfile
from datetime import date

from django.utils import timezone
from django.utils.text import slugify
from openpyxl import Workbook

from licenses.models import License
from members.models import Member

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


def export_tables(club_id: int, *, include_members: bool, include_licences: bool) -> dict[str, list[dict]]:
    built = member_rows(club_id)
    refs = {member_id: row["member_ref"] for member_id, row in built}
    tables = {}
    if include_members:
        tables["members"] = [row for _member_id, row in built]
    if include_licences:
        tables["licences"] = license_rows(club_id, refs)
    return tables


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
    if "members" in tables:
        _sheet(book, "members", MEMBER_KEYS, tables["members"], locale)
    if "licences" in tables:
        _sheet(book, "licences", LICENSE_KEYS, tables["licences"], locale)
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
        for key in ("members", "licences"):
            if key not in tables:
                continue
            filename = f"{key}.csv"
            keys = MEMBER_KEYS if key == "members" else LICENSE_KEYS
            archive.writestr(filename, _csv_bytes(keys, tables[key], locale))
            writer.writerow([filename, key, len(tables[key])])
        archive.writestr("manifest.csv", manifest.getvalue().encode("utf-8"))
    return buffer.getvalue()


def download_name(club_name: str, extension: str, today: date | None = None) -> str:
    today = today or timezone.localdate()
    slug = slugify(club_name) or "club"
    slug = re.sub(r"[^a-z0-9-]", "", slug)[:40] or "club"
    return f"{slug}-members-{today.isoformat()}.{extension}"
