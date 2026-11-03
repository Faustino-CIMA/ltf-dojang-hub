"""Public Luxembourg address register (CACLR) published on data.public.lu.

The files are the official fixed-width ASCII extract (CC0). ``TR.DICACOLO.RUCP``
lists every current street with its postcode and locality. ``IMMEUBLE`` lists
buildings; rows with an end date are historical and are left out. House numbers
come from the building number plus the letter or other suffix in CODE_MULTIPLE.
"""

from __future__ import annotations

import io
import logging
import urllib.request
import zipfile
from collections.abc import Iterable

from django.db import connection, transaction

logger = logging.getLogger(__name__)

# Stable permalink. data.public.lu redirects it to the latest monthly file.
CACLR_URL = "https://data.public.lu/fr/datasets/r/af76a119-2bd1-462c-a5bf-23e11ccfd3ee"
CACLR_MAX_BYTES = 20 * 1024 * 1024
_REQUIRED = ("TR.DICACOLO.RUCP", "RUE", "LOCALITE", "IMMEUBLE")


def field(line: str, start: int, length: int) -> str:
    """1-indexed fixed-width column, as in the CACLR ASCII specification."""
    return line[start - 1 : start - 1 + length]


def _ended(raw: str) -> bool:
    text = raw.strip()
    return bool(text) and text != "?"


def house_number(numero: str, code: str) -> str:
    """``017`` + ``B`` becomes ``17B``. A bare ``000`` is an unnumbered building."""
    digits = numero.strip()
    suffix = "".join(code.split())
    if digits.isdigit():
        number = str(int(digits))
    else:
        number = digits.lstrip("0")
    if number in {"", "0"} and not suffix:
        return ""
    return f"{number}{suffix}"


def _lines(payload: bytes) -> list[str]:
    return payload.decode("latin-1").splitlines()


def _zip_files(raw: bytes) -> dict[str, bytes]:
    try:
        archive = zipfile.ZipFile(io.BytesIO(raw))
    except zipfile.BadZipFile as exc:
        raise ValueError("CACLR download is not a zip archive") from exc
    found: dict[str, bytes] = {}
    for info in archive.infolist():
        base = info.filename.rsplit("/", 1)[-1].upper()
        if base in _REQUIRED and base not in found:
            found[base] = archive.read(info)
    missing = [name for name in _REQUIRED if name not in found]
    if missing:
        raise ValueError("CACLR archive is missing " + ", ".join(missing))
    return found


def parse_caclr_zip(raw: bytes) -> dict[str, list[tuple[str, ...]]]:
    files = _zip_files(raw)
    localities: dict[str, str] = {}
    for line in _lines(files["LOCALITE"]):
        number = field(line, 1, 5).strip()
        name = field(line, 6, 40).strip()
        if number and name:
            localities[number] = name

    streets_by_id: dict[str, tuple[str, str, bool]] = {}
    for line in _lines(files["RUE"]):
        number = field(line, 1, 5).strip()
        name = field(line, 6, 40).strip()
        locality_id = field(line, 132, 5).strip()
        if number and name:
            streets_by_id[number] = (name, localities.get(locality_id, ""), _ended(field(line, 103, 10)))

    streets: set[tuple[str, str, str]] = set()
    for line in _lines(files["TR.DICACOLO.RUCP"]):
        postal = field(line, 201, 4).strip()
        locality = field(line, 121, 40).strip()
        street = field(line, 161, 40).strip()
        if len(postal) == 4 and postal.isdigit() and locality and street:
            streets.add((postal, locality, street))
    if not streets:
        raise ValueError("CACLR archive did not contain any streets")

    official = set(streets)
    houses: set[tuple[str, str, str, str]] = set()
    for line in _lines(files["IMMEUBLE"]):
        if _ended(field(line, 18, 10)):
            continue
        postal = field(line, 39, 4).strip()
        if len(postal) != 4 or not postal.isdigit():
            continue
        number = house_number(field(line, 9, 3), field(line, 12, 6))
        if not number:
            continue
        street_id = field(line, 50, 5).strip()
        street_name, locality, street_ended = streets_by_id.get(street_id, ("", "", True))
        if not street_name or not locality:
            continue
        key = (postal, locality, street_name)
        if key not in official:
            if street_ended:
                continue
            streets.add(key)
        houses.add((postal, locality, street_name, number))

    return {
        "streets": sorted(streets),
        "houses": sorted(houses),
    }


def _download_register() -> bytes:
    request = urllib.request.Request(CACLR_URL, headers={"User-Agent": "LTF-License-Manager/0.10"})
    chunks: list[bytes] = []
    total = 0
    with urllib.request.urlopen(request, timeout=60) as response:
        while True:
            chunk = response.read(64 * 1024)
            if not chunk:
                break
            total += len(chunk)
            if total > CACLR_MAX_BYTES:
                raise ValueError("CACLR archive is larger than the size cap")
            chunks.append(chunk)
    if not chunks:
        raise ValueError("CACLR download was empty")
    return b"".join(chunks)


def _batched(rows: Iterable[tuple], size: int):
    batch: list[tuple] = []
    for row in rows:
        batch.append(row)
        if len(batch) >= size:
            yield batch
            batch = []
    if batch:
        yield batch


def refresh_luxembourg_register(source: bytes | None = None) -> dict[str, int]:
    """Replace the cached register. A failed download or parse keeps the previous rows."""
    from clubmgmt.models import LuxembourgRegisteredHouse, LuxembourgRegisteredStreet

    raw = _download_register() if source is None else source
    parsed = parse_caclr_zip(raw)
    street_rows = parsed["streets"]
    house_rows = parsed["houses"]
    with transaction.atomic():
        if connection.vendor == "postgresql":
            with connection.cursor() as cursor:
                cursor.execute("SET LOCAL statement_timeout = '120s'")
        LuxembourgRegisteredHouse.objects.all().delete()
        LuxembourgRegisteredStreet.objects.all().delete()
        for batch in _batched(street_rows, 2000):
            LuxembourgRegisteredStreet.objects.bulk_create(
                [
                    LuxembourgRegisteredStreet(postal_code=postal, locality=locality, street=street)
                    for postal, locality, street in batch
                ]
            )
        for batch in _batched(house_rows, 2000):
            LuxembourgRegisteredHouse.objects.bulk_create(
                [
                    LuxembourgRegisteredHouse(
                        postal_code=postal,
                        locality=locality,
                        street=street,
                        house_number=number,
                    )
                    for postal, locality, street, number in batch
                ]
            )
    logger.info(
        "Luxembourg address register refreshed: %s streets, %s house numbers",
        len(street_rows),
        len(house_rows),
    )
    return {"streets": len(street_rows), "houses": len(house_rows)}
