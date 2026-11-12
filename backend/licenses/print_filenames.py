from __future__ import annotations

import re
import unicodedata
from datetime import datetime
from urllib.parse import quote

from django.utils import timezone

_NON_SLUG = re.compile(r"[^a-z0-9]+")
_LTF_SCOPE = "LTF"


def print_scope_slug(club_name: str | None) -> str:
    """Filesystem-safe club name, or ``LTF`` when the club name is blank."""
    normalized = unicodedata.normalize("NFKD", club_name or "")
    ascii_name = normalized.encode("ascii", "ignore").decode("ascii")
    slug = _NON_SLUG.sub("-", ascii_name.lower()).strip("-")
    return slug or _LTF_SCOPE


def print_job_pdf_filename(*, club_name: str | None, job_id: int, created_at: datetime | None) -> str:
    """``license-cards_<club-or-LTF>_<job id>_<YYYY-MM-DD>.pdf`` in Europe/Luxembourg."""
    scope = print_scope_slug(club_name)
    if created_at is None:
        date_part = "unknown"
    else:
        aware = created_at if timezone.is_aware(created_at) else timezone.make_aware(created_at, timezone.utc)
        date_part = timezone.localtime(aware).date().isoformat()
    return f"license-cards_{scope}_{job_id}_{date_part}.pdf"


_FILENAME_UNSAFE = re.compile(r"[^A-Za-z0-9-]+")


def _filename_token(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value or "")
    ascii_text = normalized.encode("ascii", "ignore").decode("ascii")
    cleaned = _FILENAME_UNSAFE.sub("_", ascii_text)
    cleaned = re.sub(r"_+", "_", cleaned).strip("._")
    return cleaned


def license_card_download_filename(
    *,
    license_number: str,
    last_name: str,
    first_name: str,
    year: int,
    license_id: int,
) -> str:
    """``LTF-2026-00123_Lastname_Firstname.pdf``. Last name, then first name."""
    number = _filename_token(license_number)
    if not number:
        number = f"LTF-{int(year)}-{int(license_id):05d}"
    last = _filename_token(last_name) or "Unknown"
    first = _filename_token(first_name) or "Unknown"
    return f"{number}_{last}_{first}.pdf"


def content_disposition_attachment(filename: str) -> str:
    ascii_name = filename.encode("ascii", "ignore").decode("ascii") or "license-cards.pdf"
    quoted = ascii_name.replace("\\", "\\\\").replace('"', '\\"')
    encoded = quote(filename, safe="")
    return f"attachment; filename=\"{quoted}\"; filename*=UTF-8''{encoded}"
