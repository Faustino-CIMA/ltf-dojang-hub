"""The on-screen license card: a PNG of the print PDF.

Printing still calls render_card_pdf_bytes and keeps the PDF. This module
only rasters that PDF for the preview.
"""

from __future__ import annotations

import hashlib
import json

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


def preview_cache_key(*, preview_data: dict, template_updated_at=None) -> str:
    """Change the key when anything the PDF prints from the render context changes.

    The context is the one ``build_preview_data`` already resolved, so a new
    grade, name, date, club, or photo URL refreshes the picture without a
    separate field list.
    """
    context = preview_data.get("context") or {}
    digest = hashlib.sha256(
        json.dumps(context, sort_keys=True, separators=(",", ":"), default=str).encode()
    ).hexdigest()
    return "|".join(
        [
            "license-card-png-v2",
            str(preview_data.get("template_version_id") or ""),
            _stamp(template_updated_at),
            str(preview_data.get("active_side") or "front"),
            digest,
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
