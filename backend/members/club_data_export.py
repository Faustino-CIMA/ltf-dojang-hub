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

EMAIL_KEYS = ("member_ref", "email", "use_for_invoice")
PHONE_KEYS = ("member_ref", "number", "label")
ADDRESS_KEYS = (
    "member_ref",
    "street",
    "house_number",
    "line2",
    "postal_code",
    "locality",
    "country",
    "use_for_invoice",
)
PEOPLE_KEYS = ("person_ref", "last_name", "first_name", "sex", "member_ref")
CONTACT_KEYS = ("member_ref", "person_ref", "relation", "is_emergency", "is_primary")
PERSON_EMAIL_KEYS = ("person_ref", "email", "use_for_invoice")
PERSON_PHONE_KEYS = ("person_ref", "number", "label")
PERSON_ADDRESS_KEYS = (
    "person_ref",
    "street",
    "house_number",
    "line2",
    "postal_code",
    "locality",
    "country",
    "use_for_invoice",
)
FAMILY_KEYS = ("family_ref", "name", "invoice_member_ref", "bill_to_person_ref", "delivery")
FAMILY_MEMBER_KEYS = ("family_ref", "member_ref", "sort_order")
REBATE_KEYS = ("member_rank", "percent_off", "amount_off", "applies_to_later")

_SHEET_ORDER = (
    "members",
    "licences",
    "grades",
    "emails",
    "phones",
    "addresses",
    "people",
    "contacts",
    "person_emails",
    "person_phones",
    "person_addresses",
    "families",
    "family_members",
    "rebate_rules",
)

_SHEET_KEYS = {
    "members": MEMBER_KEYS,
    "licences": LICENSE_KEYS,
    "grades": GRADE_KEYS,
    "emails": EMAIL_KEYS,
    "phones": PHONE_KEYS,
    "addresses": ADDRESS_KEYS,
    "people": PEOPLE_KEYS,
    "contacts": CONTACT_KEYS,
    "person_emails": PERSON_EMAIL_KEYS,
    "person_phones": PERSON_PHONE_KEYS,
    "person_addresses": PERSON_ADDRESS_KEYS,
    "families": FAMILY_KEYS,
    "family_members": FAMILY_MEMBER_KEYS,
    "rebate_rules": REBATE_KEYS,
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
        "social_security_number": "Social security number",
        "social_security_country": "Social security country",
        "person_ref": "Person reference",
        "family_ref": "Family reference",
        "name": "Name",
        "sort_order": "Order",
        "relation": "Relation",
        "is_emergency": "Emergency contact",
        "is_primary": "Primary contact",
        "use_for_invoice": "Use for invoice",
        "number": "Phone",
        "label": "Label",
        "street": "Street",
        "house_number": "House number",
        "line2": "Address line 2",
        "postal_code": "Postal code",
        "locality": "Locality",
        "country": "Country",
        "invoice_member_ref": "Invoice member",
        "bill_to_person_ref": "Bill-to person",
        "delivery": "Delivery",
        "member_rank": "Rank",
        "percent_off": "Percent off",
        "amount_off": "Amount off",
        "applies_to_later": "Also the following members",
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
        "social_security_number": "Numéro de sécurité sociale",
        "social_security_country": "Pays du numéro",
        "person_ref": "Référence de la personne",
        "family_ref": "Référence de la famille",
        "name": "Nom",
        "sort_order": "Ordre",
        "relation": "Lien",
        "is_emergency": "Contact d'urgence",
        "is_primary": "Contact principal",
        "use_for_invoice": "Pour la facture",
        "number": "Téléphone",
        "label": "Libellé",
        "street": "Rue",
        "house_number": "Numéro",
        "line2": "Complément",
        "postal_code": "Code postal",
        "locality": "Localité",
        "country": "Pays",
        "invoice_member_ref": "Membre facturé",
        "bill_to_person_ref": "Personne facturée",
        "delivery": "Envoi",
        "member_rank": "Rang",
        "percent_off": "Pourcentage",
        "amount_off": "Montant",
        "applies_to_later": "Aussi les suivants",
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
        "social_security_number": "Sozialversicherungsnummer",
        "social_security_country": "Land der Nummer",
        "person_ref": "Personenreferenz",
        "family_ref": "Familienreferenz",
        "name": "Name",
        "sort_order": "Reihenfolge",
        "relation": "Beziehung",
        "is_emergency": "Notfallkontakt",
        "is_primary": "Hauptkontakt",
        "use_for_invoice": "Für die Rechnung",
        "number": "Telefon",
        "label": "Bezeichnung",
        "street": "Straße",
        "house_number": "Hausnummer",
        "line2": "Adresszusatz",
        "postal_code": "Postleitzahl",
        "locality": "Ort",
        "country": "Land",
        "invoice_member_ref": "Rechnung an Mitglied",
        "bill_to_person_ref": "Rechnung an Person",
        "delivery": "Zustellung",
        "member_rank": "Rang",
        "percent_off": "Prozent",
        "amount_off": "Betrag",
        "applies_to_later": "Auch die Folgenden",
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
        "social_security_number": "Sozialversécherungsnummer",
        "social_security_country": "Land vun der Nummer",
        "person_ref": "Persounereferenz",
        "family_ref": "Familljereferenz",
        "name": "Numm",
        "sort_order": "Reiefolleg",
        "relation": "Bezéiung",
        "is_emergency": "Noutfallkontakt",
        "is_primary": "Haaptkontakt",
        "use_for_invoice": "Fir d'Rechnung",
        "number": "Telefon",
        "label": "Bezeechnung",
        "street": "Strooss",
        "house_number": "Hausnummer",
        "line2": "Ergänzung",
        "postal_code": "Postcode",
        "locality": "Uertschaft",
        "country": "Land",
        "invoice_member_ref": "Rechnung un de Member",
        "bill_to_person_ref": "Rechnung un d'Persoun",
        "delivery": "Zoustellung",
        "member_rank": "Rang",
        "percent_off": "Prozent",
        "amount_off": "Betrag",
        "applies_to_later": "Och déi Weider",
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
    include_emails: bool = False,
    include_contacts: bool = False,
    include_families: bool = False,
) -> dict[str, list[dict]]:
    from members.club_data_household import add_household_tables

    built = member_rows(club_id)
    refs = {member_id: row["member_ref"] for member_id, row in built}
    tables = {}
    if include_members:
        tables["members"] = [row for _member_id, row in built]
    if include_licences:
        tables["licences"] = license_rows(club_id, refs)
    if include_grades:
        tables["grades"] = grade_rows(club_id, refs)
    if include_emails or include_contacts or include_families:
        tables.update(
            add_household_tables(
                club_id,
                refs,
                include_emails=include_emails,
                include_contacts=include_contacts,
                include_families=include_families,
            )
        )
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
    for key in _SHEET_ORDER:
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
        for key in _SHEET_ORDER:
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
    for key in ("emails", "phones", "addresses"):
        for row in tables.get(key, []):
            parent = ensure(row["member_ref"])
            parent.setdefault(key, [])
            parent[key].append({field: value for field, value in row.items() if field != "member_ref"})
    for row in tables.get("contacts", []):
        parent = ensure(row["member_ref"])
        parent.setdefault("contacts", [])
        parent["contacts"].append(
            {
                "person_ref": row["person_ref"],
                "relation": row["relation"],
                "is_emergency": row["is_emergency"],
                "is_primary": row["is_primary"],
            }
        )
    payload = {
        "club": club_name,
        "exported_on": timezone.localdate().isoformat(),
        "members": list(by_ref.values()),
    }
    if "people" in tables:
        payload["people"] = _people_tree(tables)
    if "families" in tables:
        payload["families"] = _family_tree(tables, by_ref)
    if "rebate_rules" in tables:
        payload["rebate_rules"] = tables["rebate_rules"]
    return json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")


def _people_tree(tables: dict[str, list[dict]]) -> list[dict]:
    grouped: dict[str, dict[str, list[dict]]] = {"emails": {}, "phones": {}, "addresses": {}}
    for key, sheet in (("emails", "person_emails"), ("phones", "person_phones"), ("addresses", "person_addresses")):
        for row in tables.get(sheet, []):
            grouped[key].setdefault(row["person_ref"], []).append(
                {field: value for field, value in row.items() if field != "person_ref"}
            )
    people = []
    for row in tables.get("people", []):
        person = dict(row)
        for key in ("emails", "phones", "addresses"):
            if sheet_present(tables, key):
                person[key] = grouped[key].get(row["person_ref"], [])
        people.append(person)
    return people


def sheet_present(tables: dict[str, list[dict]], kind: str) -> bool:
    return {"emails": "person_emails", "phones": "person_phones", "addresses": "person_addresses"}[kind] in tables


def _family_tree(tables: dict[str, list[dict]], members: dict[str, dict]) -> list[dict]:
    grouped: dict[str, list[dict]] = {}
    for row in tables.get("family_members", []):
        parent = members.get(row["member_ref"], {})
        grouped.setdefault(row["family_ref"], []).append(
            {
                "member_ref": row["member_ref"],
                "sort_order": row["sort_order"],
                "last_name": parent.get("last_name", ""),
                "first_name": parent.get("first_name", ""),
            }
        )
    families = []
    for row in tables.get("families", []):
        family = dict(row)
        family["members"] = grouped.get(row["family_ref"], [])
        families.append(family)
    return families


_PDF_COPY = {
    "en": {
        "title": "Club data",
        "exported": "Exported on",
        "licenses": "Licenses",
        "grades": "Grade history",
        "ssn": "Social security number",
        "none": "None",
        "emails": "Emails",
        "phones": "Phones",
        "addresses": "Addresses",
        "contacts": "Contacts",
        "emergency": "Emergency contact",
        "primary": "Primary contact",
        "order": "In this order",
        "invoice_member": "Invoice member",
        "billed": "Billed to",
        "rebates": "Family rebates",
        "rank": "Rank",
        "following": "also the following members",
        "email": "Email",
        "post": "Post",
        "hand": "In person",
    },
    "fr": {
        "title": "Données du club",
        "exported": "Exporté le",
        "licenses": "Licences",
        "grades": "Historique des grades",
        "ssn": "Numéro de sécurité sociale",
        "none": "Aucun",
        "emails": "E-mails",
        "phones": "Téléphones",
        "addresses": "Adresses",
        "contacts": "Contacts",
        "emergency": "Contact d'urgence",
        "primary": "Contact principal",
        "order": "Dans cet ordre",
        "invoice_member": "Membre facturé",
        "billed": "Facturé à",
        "rebates": "Remises familiales",
        "rank": "Rang",
        "following": "aussi les membres suivants",
        "email": "E-mail",
        "post": "Courrier",
        "hand": "En main propre",
    },
    "de": {
        "title": "Vereinsdaten",
        "exported": "Exportiert am",
        "licenses": "Lizenzen",
        "grades": "Graduierung",
        "ssn": "Sozialversicherungsnummer",
        "none": "Keine",
        "emails": "E-Mails",
        "phones": "Telefone",
        "addresses": "Adressen",
        "contacts": "Kontakte",
        "emergency": "Notfallkontakt",
        "primary": "Hauptkontakt",
        "order": "In dieser Reihenfolge",
        "invoice_member": "Rechnung an Mitglied",
        "billed": "Rechnung an",
        "rebates": "Familienrabatte",
        "rank": "Rang",
        "following": "auch die folgenden Mitglieder",
        "email": "E-Mail",
        "post": "Post",
        "hand": "Persönlich",
    },
    "lb": {
        "title": "Veräinsdaten",
        "exported": "Exportéiert den",
        "licenses": "Lizenzen",
        "grades": "Grad-Historique",
        "ssn": "Sozialversécherungsnummer",
        "none": "Keng",
        "emails": "E-Mailen",
        "phones": "Telefonen",
        "addresses": "Adressen",
        "contacts": "Kontakter",
        "emergency": "Noutfallkontakt",
        "primary": "Haaptkontakt",
        "order": "An dëser Reiefolleg",
        "invoice_member": "Rechnung un de Member",
        "billed": "Rechnung un",
        "rebates": "Familljerabatter",
        "rank": "Rang",
        "following": "och déi weider Memberen",
        "email": "E-Mail",
        "post": "Post",
        "hand": "Perséinlech",
    },
}

_RELATIONS = {
    "en": {
        "father": "Father",
        "mother": "Mother",
        "grandfather": "Grandfather",
        "grandmother": "Grandmother",
        "uncle": "Uncle",
        "aunt": "Aunt",
        "brother": "Brother",
        "sister": "Sister",
        "guardian": "Guardian",
        "partner": "Partner",
        "spouse": "Spouse",
        "other": "Other",
    },
    "fr": {
        "father": "Père",
        "mother": "Mère",
        "grandfather": "Grand-père",
        "grandmother": "Grand-mère",
        "uncle": "Oncle",
        "aunt": "Tante",
        "brother": "Frère",
        "sister": "Sœur",
        "guardian": "Tuteur",
        "partner": "Partenaire",
        "spouse": "Conjoint",
        "other": "Autre",
    },
    "de": {
        "father": "Vater",
        "mother": "Mutter",
        "grandfather": "Großvater",
        "grandmother": "Großmutter",
        "uncle": "Onkel",
        "aunt": "Tante",
        "brother": "Bruder",
        "sister": "Schwester",
        "guardian": "Vormund",
        "partner": "Partner",
        "spouse": "Ehepartner",
        "other": "Andere",
    },
    "lb": {
        "father": "Papp",
        "mother": "Mamm",
        "grandfather": "Grousspapp",
        "grandmother": "Groussmamm",
        "uncle": "Monni",
        "aunt": "Tatta",
        "brother": "Brudder",
        "sister": "Schwester",
        "guardian": "Tuteur",
        "partner": "Partner",
        "spouse": "Bestuet",
        "other": "Aner",
    },
}


def _last_first(row: dict, fallback: str = "") -> str:
    name = " ".join(part for part in (row.get("last_name", ""), row.get("first_name", "")) if part).strip()
    return name or fallback


def _member_heading(person: dict, names: dict[str, str] | None) -> str:
    ref = person.get("member_ref", "")
    return (names or {}).get(ref, "") or _last_first(person, ref)


def build_pdf(
    tables: dict[str, list[dict]],
    club_name: str,
    locale: str,
    masked: dict[str, str],
    names: dict[str, str] | None = None,
) -> bytes | None:
    from licenses.weasyprint_adapter import write_pdf

    code = normalize_locale(locale)
    words = _PDF_COPY[code]
    grouped = json.loads(build_json(tables, club_name).decode("utf-8"))
    parts = [
        "<!DOCTYPE html><html><head><meta charset='utf-8'><style>",
        "body{font-family:sans-serif;color:#111;margin:24px}",
        "h1{font-size:18px} h2{font-size:14px;margin-top:18px} h3{font-size:12px} h4{font-size:11px} p,li{font-size:11px}",
        "</style></head><body>",
        f"<h1>{html.escape(words['title'])} — {html.escape(club_name)}</h1>",
        f"<p>{html.escape(words['exported'])} {html.escape(grouped['exported_on'])}</p>",
    ]
    people = {row["person_ref"]: row for row in grouped.get("people", [])}
    members = grouped["members"] or []
    if "families" in tables:
        covered = _pdf_families(parts, grouped, tables, words, code, masked, names, people)
        rest = [person for person in members if person.get("member_ref") not in covered]
        if rest:
            _pdf_members(parts, rest, tables, words, code, masked, names, people, "h2")
        elif not grouped.get("families"):
            parts.append(f"<p>{html.escape(words['none'])}</p>")
        _pdf_rebates(parts, tables, words)
    else:
        if not members:
            parts.append(f"<p>{html.escape(words['none'])}</p>")
        _pdf_members(parts, members, tables, words, code, masked, names, people, "h2")
    parts.append("</body></html>")
    return write_pdf("".join(parts))


def _pdf_families(parts, grouped, tables, words, locale, masked, names, people) -> set[str]:
    covered: set[str] = set()
    for family in grouped.get("families", []):
        parts.append(f"<h2>{html.escape(family.get('name') or family.get('family_ref', ''))}</h2>")
        ordered = family.get("members") or []
        labels = []
        for child in ordered:
            ref = child.get("member_ref", "")
            covered.add(ref)
            labels.append((names or {}).get(ref, "") or _last_first(child, ref))
        line = ", ".join(labels) if labels else words["none"]
        parts.append(f"<p>{html.escape(words['order'])}: {html.escape(line)}</p>")
        invoice_ref = family.get("invoice_member_ref") or ""
        if invoice_ref:
            invoice_name = (names or {}).get(invoice_ref, invoice_ref)
            parts.append(f"<p>{html.escape(words['invoice_member'])}: {html.escape(invoice_name)}</p>")
        person_ref = family.get("bill_to_person_ref") or ""
        if person_ref:
            person = people.get(person_ref, {})
            billed = _last_first(person, person_ref)
            delivery = words.get(family.get("delivery") or "", family.get("delivery") or "")
            suffix = f", {delivery}" if delivery else ""
            parts.append(f"<p>{html.escape(words['billed'])}: {html.escape(billed)}{html.escape(suffix)}</p>")
        by_ref = {row.get("member_ref"): row for row in grouped.get("members", [])}
        chosen = []
        for child in ordered:
            ref = child.get("member_ref", "")
            chosen.append(by_ref.get(ref) or child)
        _pdf_members(parts, chosen, tables, words, locale, masked, names, people, "h3")
    return covered


def _pdf_members(parts, members, tables, words, locale, masked, names, people, heading: str) -> None:
    section = "h3" if heading == "h2" else "h4"
    for person in members:
        parts.append(f"<{heading}>{html.escape(_member_heading(person, names))}</{heading}>")
        shown = masked.get(person.get("member_ref", ""))
        if shown:
            parts.append(f"<p>{html.escape(words['ssn'])} {html.escape(shown)}</p>")
        _pdf_list(parts, words["licenses"], person.get("licences"), "licences", tables, words, section, _licence_line)
        _pdf_list(parts, words["grades"], person.get("grades"), "grades", tables, words, section, _grade_line)
        _pdf_list(parts, words["emails"], person.get("emails"), "emails", tables, words, section, _email_line)
        _pdf_list(parts, words["phones"], person.get("phones"), "phones", tables, words, section, _phone_line)
        _pdf_list(parts, words["addresses"], person.get("addresses"), "addresses", tables, words, section, _address_line)
        if "contacts" in tables:
            parts.append(f"<{section}>{html.escape(words['contacts'])}</{section}>")
            contacts = person.get("contacts") or []
            if not contacts:
                parts.append(f"<p>{html.escape(words['none'])}</p>")
            for row in contacts:
                parts.append(f"<p>{html.escape(_contact_line(row, people, words, locale))}</p>")


def _pdf_list(parts, title, rows, table, tables, words, heading, line_for) -> None:
    if table not in tables:
        return
    parts.append(f"<{heading}>{html.escape(title)}</{heading}><ul>")
    items = rows or []
    if not items:
        parts.append(f"<li>{html.escape(words['none'])}</li>")
    for row in items:
        parts.append(f"<li>{html.escape(line_for(row))}</li>")
    parts.append("</ul>")


def _licence_line(row: dict) -> str:
    return f"{row.get('year', '')} {row.get('license_type', '')} {row.get('status', '')}".strip()


def _grade_line(row: dict) -> str:
    return f"{row.get('promotion_date', '')} {row.get('from_grade', '')} → {row.get('to_grade', '')}".strip()


def _email_line(row: dict) -> str:
    return str(row.get("email") or "")


def _phone_line(row: dict) -> str:
    label = str(row.get("label") or "").strip()
    number = str(row.get("number") or "").strip()
    return f"{label} {number}".strip()


def _address_line(row: dict) -> str:
    street = " ".join(part for part in (row.get("street", ""), row.get("house_number", "")) if part).strip()
    place = " ".join(part for part in (row.get("postal_code", ""), row.get("locality", "")) if part).strip()
    return ", ".join(part for part in (street, row.get("line2", ""), place, row.get("country", "")) if part)


def _contact_line(row: dict, people: dict, words: dict, locale: str) -> str:
    person = people.get(row.get("person_ref", ""), {})
    relation = _RELATIONS[locale].get(row.get("relation", ""), row.get("relation", ""))
    bits = [_last_first(person, row.get("person_ref", "")), relation]
    if row.get("is_emergency") == "true":
        bits.append(words["emergency"])
    if row.get("is_primary") == "true":
        bits.append(words["primary"])
    for phone in person.get("phones") or []:
        number = _phone_line(phone)
        if number:
            bits.append(number)
    for email in person.get("emails") or []:
        if email.get("email"):
            bits.append(email["email"])
    for address in person.get("addresses") or []:
        line = _address_line(address)
        if line:
            bits.append(line)
    return ", ".join(bit for bit in bits if bit)


def _pdf_rebates(parts, tables, words) -> None:
    if "rebate_rules" not in tables:
        return
    parts.append(f"<h2>{html.escape(words['rebates'])}</h2><ul>")
    rules = tables.get("rebate_rules") or []
    if not rules:
        parts.append(f"<li>{html.escape(words['none'])}</li>")
    for row in rules:
        bits = [f"{words['rank']} {row.get('member_rank', '')}"]
        if row.get("percent_off") and row.get("percent_off") != "0.00":
            bits.append(f"{row['percent_off']}%")
        if row.get("amount_off"):
            bits.append(f"{row['amount_off']} EUR")
        if row.get("applies_to_later") == "true":
            bits.append(words["following"])
        parts.append(f"<li>{html.escape(' · '.join(bits))}</li>")
    parts.append("</ul>")


_OWN_NUMBER_KEYS = ("social_security_number", "social_security_country")


def tables_for_member(member) -> tuple[dict[str, list[dict]], str, str]:
    """One person's members, licences, and grades. The number is returned separately."""
    from clubmgmt.models import MemberRecord

    built = member_rows(member.club_id) if member.club_id else []
    match = next((row for member_id, row in built if member_id == member.id), None)
    if match is None:
        license_id = (member.ltf_licenseid or "").strip()
        match = {
            "member_ref": license_id or "m-0001",
            "first_name": member.first_name,
            "last_name": member.last_name,
            "usual_name": member.usual_name,
            "sex": member.sex,
            "date_of_birth": _iso(member.date_of_birth),
            "email": member.email,
            "ltf_licenseid": member.ltf_licenseid,
            "wt_licenseid": member.wt_licenseid,
            "belt_rank": member.belt_rank,
            "primary_license_role": member.primary_license_role,
            "secondary_license_role": member.secondary_license_role,
            "is_active": "true" if member.is_active else "false",
        }
    ref = match["member_ref"]
    refs = {member.id: ref}
    licences = [row for row in license_rows(member.club_id or 0, refs) if row["member_ref"] == ref]
    grades = [row for row in grade_rows(member.club_id or 0, refs) if row["member_ref"] == ref]
    record = MemberRecord.objects.filter(member_id=member.id).only(
        "social_security_number", "social_security_country"
    ).first()
    number = (record.social_security_number if record else "") or ""
    country = (record.social_security_country if record else "") or ""
    return {"members": [dict(match)], "licences": licences, "grades": grades}, number, country


def build_own_file(member, file_format: str, locale: str) -> tuple[bytes | None, str, str]:
    from members.ssn_mask import MASKED_SOCIAL_SECURITY_NUMBER, mask_social_security_number

    tables, number, country = tables_for_member(member)
    ref = tables["members"][0]["member_ref"]
    locale = normalize_locale(locale)
    if file_format == "pdf":
        names = {ref: f"{member.first_name} {member.last_name}".strip()}
        masked = {ref: MASKED_SOCIAL_SECURITY_NUMBER} if mask_social_security_number(number) else {}
        payload = build_pdf(tables, member.club.name if member.club_id else "", locale, masked, names)
        return payload, "application/pdf", "pdf"
    row = tables["members"][0]
    if number:
        row["social_security_number"] = number
        row["social_security_country"] = country
    keys = MEMBER_KEYS + (_OWN_NUMBER_KEYS if number else ())
    if file_format == "json":
        return build_json(tables, member.club.name if member.club_id else ""), "application/json", "json"
    if file_format == "csv":
        return _own_csv(tables, keys, locale), "application/zip", "zip"
    return _own_xlsx(tables, keys, locale), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx"


def _own_csv(tables, member_keys, locale: str) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        manifest = io.StringIO()
        writer = csv.writer(manifest, lineterminator="\n")
        writer.writerow(["file", "key", "rows"])
        pairs = (("members", member_keys), ("licences", LICENSE_KEYS), ("grades", GRADE_KEYS))
        for key, fields in pairs:
            filename = f"{key}.csv"
            archive.writestr(filename, _csv_bytes(fields, tables[key], locale))
            writer.writerow([filename, key, len(tables[key])])
        archive.writestr("manifest.csv", manifest.getvalue().encode("utf-8"))
    return buffer.getvalue()


def _own_xlsx(tables, member_keys, locale: str) -> bytes:
    book = Workbook()
    default = book.active
    book.remove(default)
    _sheet(book, "members", member_keys, tables["members"], locale)
    _sheet(book, "licences", LICENSE_KEYS, tables["licences"], locale)
    _sheet(book, "grades", GRADE_KEYS, tables["grades"], locale)
    buffer = io.BytesIO()
    book.save(buffer)
    return buffer.getvalue()


def download_name(club_name: str, extension: str, today: date | None = None) -> str:
    today = today or timezone.localdate()
    slug = slugify(club_name) or "club"
    slug = re.sub(r"[^a-z0-9-]", "", slug)[:40] or "club"
    return f"{slug}-members-{today.isoformat()}.{extension}"
