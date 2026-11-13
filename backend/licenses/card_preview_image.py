"""The on-screen license card: a PNG of the print PDF.

Printing still calls render_card_pdf_bytes and keeps the PDF. This module
only rasters that PDF for the preview.
"""

from __future__ import annotations

from django.core.cache import cache

from .card_rendering import render_card_pdf_bytes
from .pdf_raster import rasterize_pdf_page

# The preview slot is at most 420 CSS pixels wide. Three times that stays
# sharp on a phone (pixel density 3) and on a 4K display.
PREVIEW_MAX_CSS_PX = 420
PREVIEW_SUPERSAMPLE = 3
PREVIEW_TARGET_WIDTH_PX = PREVIEW_MAX_CSS_PX * PREVIEW_SUPERSAMPLE
CACHE_SECONDS = 60 * 60 * 24


def _stamp(value) -> str:
    if value is None:
        return ""
    isoformat = getattr(value, "isoformat", None)
    if callable(isoformat):
        return isoformat()
    return str(value)


def preview_cache_key(*, member, license_record, template_version, side: str) -> str:
    """Change the key when the license, the template, or the approved photo changes."""
    photo = getattr(member, "profile_picture_processed", None)
    photo_name = getattr(photo, "name", "") or ""
    license_id = getattr(license_record, "id", None) or 0
    return "|".join(
        [
            "license-card-png-v1",
            str(member.id),
            str(license_id),
            str(template_version.id),
            side or "front",
            _stamp(getattr(member, "updated_at", None)),
            _stamp(getattr(license_record, "updated_at", None)),
            _stamp(getattr(template_version, "updated_at", None)),
            photo_name,
            str(PREVIEW_TARGET_WIDTH_PX),
        ]
    )


def render_cached_card_png(preview_data: dict, *, cache_key: str) -> bytes:
    cached = cache.get(cache_key)
    if isinstance(cached, bytes) and cached.startswith(b"\x89PNG"):
        return cached
    pdf = render_card_pdf_bytes(preview_data)
    png = rasterize_pdf_page(pdf, target_width_px=PREVIEW_TARGET_WIDTH_PX)
    cache.set(cache_key, png, CACHE_SECONDS)
    return png
