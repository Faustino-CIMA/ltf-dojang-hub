import re
from datetime import date, datetime, timedelta

from imports.views import excel_serial_to_date

_ISO = re.compile(r"^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$")
_NUM = re.compile(r"^(\d{1,2})([./-])(\d{1,2})\2(\d{2}|\d{4})$")


def _from_parts(day: int, month: int, year: int) -> date | None:
    if year < 100:
        year += 2000 if year <= 68 else 1900
    try:
        return date(year, month, day)
    except ValueError:
        return None


def parse_with_format(value: str, date_format: str) -> date | None:
    raw = str(value or "").strip()
    if not raw or date_format in {"", "ambiguous"}:
        return None
    if date_format == "EXCEL":
        return excel_serial_to_date(raw)
    if date_format == "YYYY-MM-DD":
        match = _ISO.match(raw)
        if not match:
            return None
        return _from_parts(int(match.group(3)), int(match.group(2)), int(match.group(1)))
    match = _NUM.match(raw)
    if not match:
        return None
    first, sep, second, year = int(match.group(1)), match.group(2), int(match.group(3)), int(match.group(4))
    expected = {
        "DD/MM/YYYY": ("/", True),
        "MM/DD/YYYY": ("/", False),
        "DD.MM.YYYY": (".", True),
        "DD-MM-YYYY": ("-", True),
        "DD/MM/YY": ("/", True),
        "MM/DD/YY": ("/", False),
    }.get(date_format)
    if expected is None or sep != expected[0]:
        return None
    if len(str(match.group(4))) == 2 and not date_format.endswith("YY"):
        return None
    if len(str(match.group(4))) == 4 and date_format.endswith("YY") and not date_format.endswith("YYYY"):
        return None
    day, month = (first, second) if expected[1] else (second, first)
    return _from_parts(day, month, year)


def _candidates(value: str) -> set[str]:
    raw = str(value or "").strip()
    found = set()
    if not raw:
        return found
    if _ISO.match(raw):
        found.add("YYYY-MM-DD")
    match = _NUM.match(raw)
    if match:
        first, sep, second, year = int(match.group(1)), match.group(2), int(match.group(3)), match.group(4)
        day_first = first <= 31 and second <= 12
        month_first = second <= 31 and first <= 12
        long_year = len(year) == 4
        if sep == "/" and long_year:
            if day_first:
                found.add("DD/MM/YYYY")
            if month_first:
                found.add("MM/DD/YYYY")
        if sep == "." and long_year and day_first:
            found.add("DD.MM.YYYY")
        if sep == "-" and long_year and day_first:
            found.add("DD-MM-YYYY")
        if sep == "/" and len(year) == 2:
            if day_first:
                found.add("DD/MM/YY")
            if month_first:
                found.add("MM/DD/YY")
    if excel_serial_to_date(raw) and not _ISO.match(raw) and not _NUM.match(raw):
        found.add("EXCEL")
    return found


def detect_column_format(values: list[str]) -> dict:
    samples = [str(value or "").strip() for value in values if str(value or "").strip()]
    if not samples:
        return {"format": "YYYY-MM-DD", "ambiguous": False, "example": ""}
    scores: dict[str, int] = {}
    for value in samples:
        for fmt in _candidates(value):
            scores[fmt] = scores.get(fmt, 0) + 1
    if not scores:
        return {"format": "YYYY-MM-DD", "ambiguous": False, "example": samples[0]}
    best = max(scores.values())
    winners = {fmt for fmt, score in scores.items() if score == best}
    day_key = next((fmt for fmt in winners if fmt.startswith("DD/")), "")
    month_key = next((fmt for fmt in winners if fmt.startswith("MM/")), "")
    example = next((value for value in samples if len(_candidates(value) & {"DD/MM/YYYY", "MM/DD/YYYY", "DD/MM/YY", "MM/DD/YY"}) > 1), samples[0])
    if day_key and month_key:
        forced_day = False
        forced_month = False
        for value in samples:
            match = _NUM.match(value)
            if not match:
                continue
            first, second = int(match.group(1)), int(match.group(3))
            if first > 12:
                forced_day = True
            if second > 12:
                forced_month = True
        if forced_day and not forced_month:
            return {"format": day_key, "ambiguous": False, "example": example}
        if forced_month and not forced_day:
            return {"format": month_key, "ambiguous": False, "example": example}
        return {"format": day_key, "ambiguous": True, "example": example}
    chosen = sorted(winners)[0]
    return {"format": chosen, "ambiguous": False, "example": ""}


def plausible_birth_date(value: date | None, today: date) -> bool:
    if value is None:
        return True
    if value > today:
        return False
    if value < today.replace(year=today.year - 100):
        return False
    return True
