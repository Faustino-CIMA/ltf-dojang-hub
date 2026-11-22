"""Layout for every workbook the Data page writes.

Templates and exports share this. A sheet is usable as soon as it opens:
titles, stable keys, widths, a frozen header, a filter, and real date,
number, and text cells. CSV cannot carry this layout.
"""

from __future__ import annotations

import re
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.workbook.workbook import Workbook

# Data sheets, then the lists a later step may add. Unknown sheets follow.
SHEET_ORDER = (
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
    "measurements",
    "gear",
    "clothing",
    "medical_checkups",
)

DATE_KEYS = {
    "date_of_birth",
    "start_date",
    "end_date",
    "issued_on",
    "promotion_date",
    "exam_date",
    "joined_at",
    "checked_on",
    "valid_until",
    "measured_on",
}
DECIMAL_KEYS = {"weight_kg", "percent_off", "amount_off", "amount"}
INTEGER_KEYS = {"year", "sort_order", "member_rank", "height_cm"}
TEXT_KEYS = {
    "member_ref",
    "person_ref",
    "family_ref",
    "ltf_licenseid",
    "wt_licenseid",
    "number",
    "postal_code",
    "house_number",
    "social_security_number",
}

_MIN_WIDTH = 12
_MAX_WIDTH = 42
_TITLE_FILL = PatternFill(fill_type="solid", fgColor="E8EAED")
_KEY_FILL = PatternFill(fill_type="solid", fgColor="F7F8F9")
_TITLE_FONT = Font(bold=True, color="1F2933", size=11)
_KEY_FONT = Font(italic=True, color="6B7280", size=9)
_THIN = Border(
    left=Side(style="thin", color="C5CAD3"),
    right=Side(style="thin", color="C5CAD3"),
    top=Side(style="thin", color="C5CAD3"),
    bottom=Side(style="thin", color="C5CAD3"),
)
_ISO_DATE = re.compile(r"\d{4}-\d{2}-\d{2}$")

INSTRUCTION_SHEET = {
    "en": "Instructions",
    "fr": "Mode d'emploi",
    "de": "Anleitung",
    "lb": "Uweisungen",
}

_INSTRUCTIONS = {
    "en": (
        "How to use this file",
        "Row 1 is the title in your language. Row 2 is the field name. Leave row 2 as it is.",
        "The last name comes before the first name.",
        "Dates are written as YYYY-MM-DD. A weight uses two decimals.",
        "License ids and phone numbers are text, so a leading zero stays.",
        "The sample row is EXAMPLE Ada. Delete it before you import.",
        "This sheet is not imported.",
    ),
    "fr": (
        "Comment utiliser ce fichier",
        "La ligne 1 est le titre dans votre langue. La ligne 2 est le nom du champ. Laissez la ligne 2 telle quelle.",
        "Le nom vient avant le prénom.",
        "Les dates s'écrivent AAAA-MM-JJ. Un poids a deux décimales.",
        "Les numéros de licence et les téléphones sont du texte, pour garder un zéro au début.",
        "La ligne d'exemple est EXAMPLE Ada. Effacez-la avant l'import.",
        "Cette feuille n'est pas importée.",
    ),
    "de": (
        "So verwenden Sie diese Datei",
        "Zeile 1 ist der Titel in Ihrer Sprache. Zeile 2 ist der Feldname. Lassen Sie Zeile 2 unverändert.",
        "Der Nachname steht vor dem Vornamen.",
        "Daten stehen als JJJJ-MM-TT. Ein Gewicht hat zwei Nachkommastellen.",
        "Lizenznummern und Telefonnummern sind Text, damit eine führende Null bleibt.",
        "Die Beispielzeile ist EXAMPLE Ada. Löschen Sie sie vor dem Import.",
        "Dieses Blatt wird nicht importiert.",
    ),
    "lb": (
        "Esou benotzt Dir dës Datei",
        "D'Zeil 1 ass den Titel an Ärer Sprooch. D'Zeil 2 ass den Feldnumm. Loosst d'Zeil 2 esou wéi se ass.",
        "De Familljennumm steet virum Virnumm.",
        "Datume stinn als JJJJ-MM-TT. E Gewiicht huet zwou Dezimalen.",
        "Lizenznummeren an Telefonnummeren si Text, fir datt eng Null vir bleift.",
        "D'Beispillzeil ass EXAMPLE Ada. Läscht se virum Import.",
        "Dëst Blat gëtt net importéiert.",
    ),
}


def ordered_sheet_names(present: set[str] | list[str]) -> list[str]:
    found = set(present)
    names = [key for key in SHEET_ORDER if key in found]
    names.extend(key for key in present if key not in SHEET_ORDER)
    return names


def instruction_sheet_names() -> set[str]:
    return set(INSTRUCTION_SHEET.values())


def _text(value) -> str:
    if value is None:
        return ""
    text = str(value)
    if text[:1] in {"=", "+", "-", "@"}:
        return f"'{text}"
    return text


def _cell_value(key: str, value):
    if value is None or value == "":
        return None
    if key in DATE_KEYS:
        if isinstance(value, datetime):
            return value.date()
        if isinstance(value, date):
            return value
        text = str(value).strip()
        if _ISO_DATE.fullmatch(text):
            try:
                return date.fromisoformat(text)
            except ValueError:
                return text
        return text
    if key in DECIMAL_KEYS:
        try:
            return Decimal(str(value)).quantize(Decimal("0.01"))
        except (InvalidOperation, ValueError):
            return _text(value)
    if key in INTEGER_KEYS:
        text = str(value).strip()
        if text.isdigit():
            return int(text)
        return _text(value)
    if key in TEXT_KEYS:
        text = "" if value is None else str(value)
        if text[:1] == "=":
            return f"'{text}"
        return text
    return _text(value)


def _number_format(key: str, value) -> str | None:
    if value is None:
        return None
    if key in DATE_KEYS and isinstance(value, date):
        return "YYYY-MM-DD"
    if key in DECIMAL_KEYS and isinstance(value, Decimal):
        return "0.00"
    if key in INTEGER_KEYS and isinstance(value, int):
        return "0"
    if key in TEXT_KEYS:
        return "@"
    return None


def write_sheet(book: Workbook, name: str, keys: tuple[str, ...] | list[str], titles: list[str], rows: list[dict]) -> None:
    sheet = book.create_sheet(name[:31])
    sheet.append(list(titles))
    sheet.append(list(keys))
    widths = [len(str(title)) for title in titles]
    for index, key in enumerate(keys):
        widths[index] = max(widths[index], len(key))
    for row in rows:
        written = [_cell_value(key, row.get(key, "")) for key in keys]
        sheet.append(written)
        for index, value in enumerate(written):
            shown = "" if value is None else str(value)
            widths[index] = max(widths[index], min(len(shown), _MAX_WIDTH))
    for column, key in enumerate(keys, start=1):
        title_cell = sheet.cell(1, column)
        title_cell.font = _TITLE_FONT
        title_cell.fill = _TITLE_FILL
        title_cell.border = _THIN
        title_cell.alignment = Alignment(wrap_text=True, vertical="center")
        key_cell = sheet.cell(2, column)
        key_cell.font = _KEY_FONT
        key_cell.fill = _KEY_FILL
        key_cell.border = _THIN
        key_cell.alignment = Alignment(vertical="center")
        letter = get_column_letter(column)
        sheet.column_dimensions[letter].width = max(_MIN_WIDTH, min(_MAX_WIDTH, widths[column - 1] + 2))
    for row_number in range(3, sheet.max_row + 1):
        for column, key in enumerate(keys, start=1):
            cell = sheet.cell(row_number, column)
            number_format = _number_format(key, cell.value)
            if number_format:
                cell.number_format = number_format
    sheet.row_dimensions[1].height = 32
    sheet.row_dimensions[2].height = 18
    sheet.freeze_panes = "A3"
    if keys:
        last = get_column_letter(len(keys))
        sheet.auto_filter.ref = f"A2:{last}{max(sheet.max_row, 2)}"
    sheet.page_setup.orientation = "landscape"
    sheet.page_setup.paperSize = sheet.PAPERSIZE_A4
    sheet.page_setup.fitToWidth = 1
    sheet.page_setup.fitToHeight = 0
    sheet.sheet_properties.pageSetUpPr.fitToPage = True
    sheet.print_title_rows = "1:2"
    sheet.page_setup.horizontalCentered = True
    sheet.sheet_view.zoomScale = 120


def write_instructions(book: Workbook, locale: str) -> None:
    code = locale if locale in _INSTRUCTIONS else "en"
    sheet = book.create_sheet(INSTRUCTION_SHEET[code][:31], 0)
    for index, line in enumerate(_INSTRUCTIONS[code], start=1):
        cell = sheet.cell(index, 1, line)
        cell.alignment = Alignment(wrap_text=True, vertical="center")
        if index == 1:
            cell.font = _TITLE_FONT
            cell.fill = _TITLE_FILL
        else:
            cell.font = Font(color="1F2933", size=11)
        sheet.row_dimensions[index].height = 22 if index == 1 else 36
    sheet.column_dimensions["A"].width = 88
    sheet.page_setup.orientation = "landscape"
    sheet.page_setup.paperSize = sheet.PAPERSIZE_A4
    sheet.page_setup.fitToWidth = 1
    sheet.page_setup.fitToHeight = 1
    sheet.sheet_properties.pageSetUpPr.fitToPage = True
    sheet.sheet_view.zoomScale = 120
