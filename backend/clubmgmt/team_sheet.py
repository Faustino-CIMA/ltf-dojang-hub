"""Printable team sheet. Labels follow the roster columns in en, fr, de, and lb."""

from __future__ import annotations

import csv
from html import escape
from io import StringIO

from licenses.pdf_utils import HTML

_LABELS = {
    "en": {
        "team": "Team",
        "discipline": "Discipline",
        "kyorugi": "Kyorugi",
        "poomsae": "Poomsae",
        "competition": "Competition",
        "date": "Competition date",
        "name": "Name",
        "sex": "Sex",
        "male": "Male",
        "female": "Female",
        "birth": "Birth year",
        "age": "Age class",
        "grade": "Grade",
        "grade_poomsae": "Grade (dan/poom)",
        "weight": "Latest weight",
        "weighed": "Weighed on",
        "category": "WT category",
        "delta": "kg over/under",
        "height": "Latest height",
        "height_on": "Height on",
        "division": "WT Poomsae division",
        "licence": "Licence",
        "warning": "Warning",
        "active": "Active",
        "pending": "Pending",
        "expired": "Expired",
        "none": "None",
        "near": "Near limit",
        "over": "Over limit",
        "expires": "Licence expires before the competition",
        "missing": "No licence for the competition",
        "athletes": "Athletes",
        "coaches": "Coaches",
        "no_birth_date": "No birth date",
        "no_sex": "No sex",
        "no_weight": "No weight",
        "no_wt": "No WT category for {age}",
        "category_set": "Category set",
        "set_wt": "World Taekwondo",
        "set_be": "Belgium",
        "set_nl": "Netherlands",
        "set_de": "Germany",
        "set_fr": "France",
        "set_at": "Austria",
        "set_custom": "Custom",
        "no_set_age": "No category for age {age} in {set} set",
        "pupils_short": "Pupils",
        "minimes_short": "Minimes",
        "youth_short": "Youth",
        "pupils": "Pupils (7–8, not a WT category)",
        "minimes": "Minimes (9–11, not a WT category)",
        "cadet": "Cadet (12–14)",
        "junior": "Junior (15–17)",
        "senior": "Senior (17+)",
        "youth": "Youth (not a WT category)",
        "poomsae_cadet": "Cadet (12–14)",
        "poomsae_junior": "Junior (15–17)",
        "under_30": "Under 30 (18–30)",
        "under_40": "Under 40 (31–40)",
        "under_50": "Under 50 (41–50)",
        "under_60": "Under 60 (51–60)",
        "under_65": "Under 65 (61–65)",
        "over_65": "Over 65 (66+)",
    },
    "fr": {
        "team": "Équipe",
        "discipline": "Discipline",
        "kyorugi": "Kyorugi",
        "poomsae": "Poomsae",
        "competition": "Compétition",
        "date": "Date de compétition",
        "name": "Nom",
        "sex": "Sexe",
        "male": "Homme",
        "female": "Femme",
        "birth": "Année de naissance",
        "age": "Catégorie d'âge",
        "grade": "Grade",
        "grade_poomsae": "Grade (dan/poom)",
        "weight": "Dernier poids",
        "weighed": "Pesée le",
        "category": "Catégorie WT",
        "delta": "kg au-dessus/en dessous",
        "height": "Dernière taille",
        "height_on": "Taille le",
        "division": "Division Poomsae WT",
        "licence": "Licence",
        "warning": "Avertissement",
        "active": "Active",
        "pending": "En attente",
        "expired": "Expirée",
        "none": "Aucune",
        "near": "Proche de la limite",
        "over": "Au-dessus de la limite",
        "expires": "La licence expire avant la compétition",
        "missing": "Pas de licence pour la compétition",
        "athletes": "Athlètes",
        "coaches": "Entraîneurs",
        "no_birth_date": "Pas de date de naissance",
        "no_sex": "Pas de sexe",
        "no_weight": "Pas de poids",
        "no_wt": "Pas de catégorie WT pour {age}",
        "category_set": "Jeu de catégories",
        "set_wt": "World Taekwondo",
        "set_be": "Belgique",
        "set_nl": "Pays-Bas",
        "set_de": "Allemagne",
        "set_fr": "France",
        "set_at": "Autriche",
        "set_custom": "Personnalisé",
        "no_set_age": "Pas de catégorie pour l'âge {age} dans le jeu {set}",
        "pupils_short": "Pupilles",
        "minimes_short": "Minimes",
        "youth_short": "Jeune",
        "pupils": "Pupilles (7–8, pas une catégorie WT)",
        "minimes": "Minimes (9–11, pas une catégorie WT)",
        "cadet": "Cadet (12–14)",
        "junior": "Junior (15–17)",
        "senior": "Senior (17+)",
        "youth": "Jeune (pas une catégorie WT)",
        "poomsae_cadet": "Cadet (12–14)",
        "poomsae_junior": "Junior (15–17)",
        "under_30": "Moins de 30 ans (18–30)",
        "under_40": "Moins de 40 ans (31–40)",
        "under_50": "Moins de 50 ans (41–50)",
        "under_60": "Moins de 60 ans (51–60)",
        "under_65": "Moins de 65 ans (61–65)",
        "over_65": "Plus de 65 ans (66+)",
    },
    "de": {
        "team": "Mannschaft",
        "discipline": "Disziplin",
        "kyorugi": "Kyorugi",
        "poomsae": "Poomsae",
        "competition": "Wettkampf",
        "date": "Wettkampfdatum",
        "name": "Name",
        "sex": "Geschlecht",
        "male": "Männlich",
        "female": "Weiblich",
        "birth": "Geburtsjahr",
        "age": "Altersklasse",
        "grade": "Grad",
        "grade_poomsae": "Grad (Dan/Poom)",
        "weight": "Letztes Gewicht",
        "weighed": "Gewogen am",
        "category": "WT-Klasse",
        "delta": "kg darüber/darunter",
        "height": "Letzte Grösse",
        "height_on": "Grösse am",
        "division": "WT-Poomsae-Division",
        "licence": "Lizenz",
        "warning": "Hinweis",
        "active": "Aktiv",
        "pending": "Ausstehend",
        "expired": "Abgelaufen",
        "none": "Keine",
        "near": "Nahe am Limit",
        "over": "Über dem Limit",
        "expires": "Lizenz läuft vor dem Wettkampf ab",
        "missing": "Keine Lizenz für den Wettkampf",
        "athletes": "Athleten",
        "coaches": "Trainer",
        "no_birth_date": "Kein Geburtsdatum",
        "no_sex": "Kein Geschlecht",
        "no_weight": "Kein Gewicht",
        "no_wt": "Keine WT-Kategorie für {age}",
        "category_set": "Kategoriensatz",
        "set_wt": "World Taekwondo",
        "set_be": "Belgien",
        "set_nl": "Niederlande",
        "set_de": "Deutschland",
        "set_fr": "Frankreich",
        "set_at": "Österreich",
        "set_custom": "Benutzerdefiniert",
        "no_set_age": "Keine Kategorie für Alter {age} im Satz {set}",
        "pupils_short": "Pupillen",
        "minimes_short": "Minis",
        "youth_short": "Jugend",
        "pupils": "Schüler (7–8, keine WT-Klasse)",
        "minimes": "Minimen (9–11, keine WT-Klasse)",
        "cadet": "Kadett (12–14)",
        "junior": "Junior (15–17)",
        "senior": "Senior (17+)",
        "youth": "Jugend (keine WT-Klasse)",
        "poomsae_cadet": "Kadett (12–14)",
        "poomsae_junior": "Junior (15–17)",
        "under_30": "Unter 30 (18–30)",
        "under_40": "Unter 40 (31–40)",
        "under_50": "Unter 50 (41–50)",
        "under_60": "Unter 60 (51–60)",
        "under_65": "Unter 65 (61–65)",
        "over_65": "Über 65 (66+)",
    },
    "lb": {
        "team": "Ekipp",
        "discipline": "Disziplin",
        "kyorugi": "Kyorugi",
        "poomsae": "Poomsae",
        "competition": "Competitioun",
        "date": "Competitiounsdatum",
        "name": "Numm",
        "sex": "Geschlecht",
        "male": "Männlech",
        "female": "Weiblech",
        "birth": "Gebuertsjoer",
        "age": "Altersklass",
        "grade": "Grad",
        "grade_poomsae": "Grad (Dan/Poom)",
        "weight": "Leschte Gewiicht",
        "weighed": "Gewien den",
        "category": "WT-Klass",
        "delta": "kg driwwer/drënner",
        "height": "Leschte Gréisst",
        "height_on": "Gréisst den",
        "division": "WT-Poomsae-Divisioun",
        "licence": "Lizenz",
        "warning": "Warnung",
        "active": "Aktiv",
        "pending": "Am Gaang",
        "expired": "Ofgelaf",
        "none": "Keng",
        "near": "No un der Limit",
        "over": "Iwwer der Limit",
        "expires": "D'Lizenz leeft virun der Competitioun of",
        "missing": "Keng Lizenz fir d'Competitioun",
        "athletes": "Athleten",
        "coaches": "Traineren",
        "no_birth_date": "Kee Gebuertsdatum",
        "no_sex": "Kee Geschlecht",
        "no_weight": "Kee Gewiicht",
        "no_wt": "Keng WT-Kategorie fir {age}",
        "category_set": "Kategorie-Set",
        "set_wt": "World Taekwondo",
        "set_be": "Belsch",
        "set_nl": "Holland",
        "set_de": "Däitschland",
        "set_fr": "Frankräich",
        "set_at": "Éisträich",
        "set_custom": "Personaliséiert",
        "no_set_age": "Keng Kategorie fir den Alter {age} am Set {set}",
        "pupils_short": "Pupillen",
        "minimes_short": "Minimen",
        "youth_short": "Jugend",
        "pupils": "Pupillen (7–8, keng WT-Klass)",
        "minimes": "Minimen (9–11, keng WT-Klass)",
        "cadet": "Cadet (12–14)",
        "junior": "Junior (15–17)",
        "senior": "Senior (17+)",
        "youth": "Jugendlech (keng WT-Klass)",
        "poomsae_cadet": "Cadet (12–14)",
        "poomsae_junior": "Junior (15–17)",
        "under_30": "Ënner 30 (18–30)",
        "under_40": "Ënner 40 (31–40)",
        "under_50": "Ënner 50 (41–50)",
        "under_60": "Ënner 60 (51–60)",
        "under_65": "Ënner 65 (61–65)",
        "over_65": "Iwwer 65 (66+)",
    },
}


def labels(lang: str) -> dict[str, str]:
    return _LABELS.get(lang if lang in _LABELS else "en", _LABELS["en"])


def _full_name(row: dict) -> str:
    last = str(row.get("last_name") or "").upper()
    first = str(row.get("first_name") or "")
    return f"{last} {first}".strip()


def _warnings(row: dict, text: dict[str, str]) -> str:
    notes = []
    delta = row.get("weight_delta_kg")
    if row.get("weight_warning"):
        try:
            over = delta is not None and float(delta) > 0
        except (TypeError, ValueError):
            over = False
        notes.append(text["over"] if over else text["near"])
    warning = row.get("licence_warning") or ""
    if warning == "expires":
        notes.append(text["expires"])
    elif warning == "missing":
        notes.append(text["missing"])
    return "; ".join(notes)


def _sex_label(row: dict, text: dict[str, str]) -> str:
    if row.get("sex") == "F":
        return text["female"]
    if row.get("sex") == "M":
        return text["male"]
    return ""


def _category_cell(row: dict, text: dict[str, str], set_label: str) -> str:
    category = row.get("weight_category") or ""
    if category:
        return category
    reason = row.get("weight_category_reason") or ""
    if reason in {"pupils", "minimes", "youth"}:
        return text["no_wt"].format(age=text.get(f"{reason}_short", reason))
    if reason == "no_set_age":
        age = row.get("category_age")
        return text["no_set_age"].format(age="" if age is None else age, set=set_label)
    return text.get(reason, "")


def _athlete_row(row: dict, text: dict[str, str], *, poomsae: bool, set_label: str) -> list[str]:
    licence = text.get(row.get("licence_status") or "none", text["none"])
    shared = [
        _full_name(row),
        _sex_label(row, text),
        "" if row.get("birth_year") is None else str(row.get("birth_year")),
    ]
    if poomsae:
        division_code = row.get("poomsae_division") or ""
        division_key = f"poomsae_{division_code}" if division_code in {"cadet", "junior"} else division_code
        return [
            *shared,
            text.get(division_key, ""),
            row.get("belt_rank") or "",
            "" if row.get("latest_height_cm") is None else str(row.get("latest_height_cm")),
            row.get("latest_height_on") or "",
            licence,
            _warnings(row, text),
        ]
    return [
        *shared,
        text.get(row.get("age_class") or "", ""),
        row.get("belt_rank") or "",
        row.get("latest_weight_kg") or "",
        row.get("latest_weight_on") or "",
        _category_cell(row, text, set_label),
        row.get("weight_delta_kg") or "",
        "" if row.get("latest_height_cm") is None else str(row.get("latest_height_cm")),
        row.get("latest_height_on") or "",
        licence,
        _warnings(row, text),
    ]


def _coach_row(row: dict, text: dict[str, str]) -> list[str]:
    licence = text.get(row.get("licence_status") or "none", text["none"])
    warning = row.get("licence_warning") or ""
    note = text["expires"] if warning == "expires" else text["missing"] if warning == "missing" else ""
    return [
        _full_name(row),
        _sex_label(row, text),
        "" if row.get("birth_year") is None else str(row.get("birth_year")),
        licence,
        note,
    ]


def sheet_rows(payload: dict, lang: str):
    text = labels(lang)
    poomsae = payload.get("discipline") == "poomsae"
    set_code = payload.get("category_set") or "wt"
    set_label = text.get(f"set_{set_code}", set_code)
    meta = [
        (text["team"], payload.get("name") or ""),
        (text["discipline"], text["poomsae"] if poomsae else text["kyorugi"]),
        (text["competition"], payload.get("competition_name") or ""),
        (text["date"], payload.get("competition_on") or ""),
    ]
    if not poomsae:
        meta.append((text["category_set"], set_label))
    if poomsae:
        headers = [
            text["name"],
            text["sex"],
            text["birth"],
            text["division"],
            text["grade_poomsae"],
            text["height"],
            text["height_on"],
            text["licence"],
            text["warning"],
        ]
    else:
        headers = [
            text["name"],
            text["sex"],
            text["birth"],
            text["age"],
            text["grade"],
            text["weight"],
            text["weighed"],
            text["category"],
            text["delta"],
            text["height"],
            text["height_on"],
            text["licence"],
            text["warning"],
        ]
    coach_headers = [text["name"], text["sex"], text["birth"], text["licence"], text["warning"]]
    athletes = []
    coaches = []
    for row in payload.get("members") or []:
        if row.get("role") == "coach":
            coaches.append(_coach_row(row, text))
        else:
            athletes.append(_athlete_row(row, text, poomsae=poomsae, set_label=set_label))
    return {
        "meta": meta,
        "athlete_title": text["athletes"],
        "coach_title": text["coaches"],
        "headers": headers,
        "athletes": athletes,
        "coach_headers": coach_headers,
        "coaches": coaches,
    }


def sheet_csv(payload: dict, lang: str) -> bytes:
    sheet = sheet_rows(payload, lang)
    buffer = StringIO()
    writer = csv.writer(buffer)
    for label, value in sheet["meta"]:
        writer.writerow([label, value])
    writer.writerow([])
    writer.writerow([sheet["athlete_title"]])
    writer.writerow(sheet["headers"])
    writer.writerows(sheet["athletes"])
    writer.writerow([])
    writer.writerow([sheet["coach_title"]])
    writer.writerow(sheet["coach_headers"])
    writer.writerows(sheet["coaches"])
    return buffer.getvalue().encode("utf-8-sig")


def _table(headers: list[str], body: list[list[str]]) -> str:
    head = "".join(f"<th>{escape(cell)}</th>" for cell in headers)
    rows = []
    for row in body:
        rows.append("<tr>" + "".join(f"<td>{escape(cell)}</td>" for cell in row) + "</tr>")
    return f"<table><thead><tr>{head}</tr></thead><tbody>{''.join(rows)}</tbody></table>"


def sheet_pdf(payload: dict, lang: str) -> bytes | None:
    if HTML is None:
        return None
    sheet = sheet_rows(payload, lang)
    meta_html = "".join(f"<p><strong>{escape(label)}.</strong> {escape(value)}</p>" for label, value in sheet["meta"])
    html = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
@page {{ size: A4 landscape; margin: 12mm; }}
body {{ font-family: sans-serif; font-size: 9px; color: #1a1a1a; }}
h1 {{ font-size: 16px; margin: 0 0 8px; }}
h2 {{ font-size: 12px; margin: 12px 0 0; }}
p {{ margin: 0 0 2px; }}
table {{ width: 100%; border-collapse: collapse; margin-top: 6px; }}
th, td {{ border: 1px solid #cccccc; padding: 3px 5px; text-align: left; vertical-align: top; }}
th {{ background: #f2f4f7; }}
</style></head><body>
<h1>{escape(payload.get("name") or "")}</h1>
{meta_html}
<h2>{escape(sheet["athlete_title"])}</h2>
{_table(sheet["headers"], sheet["athletes"])}
<h2>{escape(sheet["coach_title"])}</h2>
{_table(sheet["coach_headers"], sheet["coaches"])}
</body></html>"""
    return HTML(string=html).write_pdf()
