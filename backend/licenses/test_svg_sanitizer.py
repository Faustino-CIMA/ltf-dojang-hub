"""Fake SVG assets, the cleaned result, and the card PDF those assets produce.

The cleaned files and the drawing PDFs were recorded on Bleach 5.0.1 and
checked again on Bleach 6.4.0. They match. A card that contains the word OK
keeps the same picture, but its PDF bytes are not stable, because WeasyPrint's
font subset changes between runs on either Bleach version.
"""

from __future__ import annotations

import base64
from pathlib import Path
from typing import Any

from django.test import SimpleTestCase
from django.utils import translation

from licenses.card_rendering import render_card_fragment_html, render_card_pdf_bytes
from licenses.svg_sanitizer import SvgSanitizationError, sanitize_svg_bytes

FIXTURE_DIR = Path(__file__).resolve().parent / "fixtures" / "svg_sanitizer"
DRAWING_ASSETS = ("plain_rect", "structured_badge", "logo_mask", "soft_shadow")
SANITIZED_ASSETS = DRAWING_ASSETS + ("styled_mark", "hostile")


def _card_preview(data_uri: str) -> dict[str, Any]:
    return {
        "card_format": {"width_mm": "85.60", "height_mm": "53.98"},
        "guides": {
            "include_bleed_guide": False,
            "include_safe_area_guide": False,
            "bleed_mm": "0.00",
            "safe_area_mm": "0.00",
        },
        "background": {"color": "#ffffff"},
        "paper_profile": {"card_corner_radius_mm": "0.00"},
        "elements": [
            {
                "type": "image",
                "x_mm": "4.00",
                "y_mm": "4.00",
                "width_mm": "30.00",
                "height_mm": "20.00",
                "opacity": "1.00",
                "rotation_deg": "0.00",
                "z_index": 1,
                "visible": True,
                "resolved_source": data_uri,
                "style": {},
            }
        ],
    }


def _svg_data_uri(payload: bytes) -> str:
    encoded = base64.b64encode(payload).decode("ascii")
    return f"data:image/svg+xml;base64,{encoded}"


class SvgSanitizerAssetTests(SimpleTestCase):
    def test_each_fake_svg_cleans_to_the_recorded_result(self) -> None:
        for name in SANITIZED_ASSETS:
            before = (FIXTURE_DIR / f"{name}.before.svg").read_bytes()
            after = (FIXTURE_DIR / f"{name}.after.svg").read_bytes()
            with self.subTest(name=name):
                self.assertNotEqual(before, after)
                self.assertEqual(sanitize_svg_bytes(before), after)
                self.assertEqual(sanitize_svg_bytes(after), after)

    def test_drawing_card_pdf_matches_the_recorded_bytes(self) -> None:
        with translation.override("en"):
            for name in DRAWING_ASSETS:
                cleaned = (FIXTURE_DIR / f"{name}.after.svg").read_bytes()
                preview = _card_preview(_svg_data_uri(cleaned))
                with self.subTest(name=name):
                    pdf = render_card_pdf_bytes(preview)
                    self.assertEqual(pdf, (FIXTURE_DIR / f"{name}.pdf").read_bytes())

    def test_card_html_embeds_the_cleaned_svg(self) -> None:
        for name in SANITIZED_ASSETS:
            cleaned = (FIXTURE_DIR / f"{name}.after.svg").read_bytes()
            fragment = render_card_fragment_html(_card_preview(_svg_data_uri(cleaned)))
            with self.subTest(name=name):
                self.assertIn(_svg_data_uri(cleaned), fragment)

    def test_hostile_svg_drops_scripts_handlers_and_javascript_links(self) -> None:
        cleaned = (FIXTURE_DIR / "hostile.after.svg").read_text(encoding="utf-8").lower()
        self.assertNotIn("<script", cleaned)
        self.assertNotIn("onload", cleaned)
        self.assertNotIn("javascript:", cleaned)
        self.assertNotIn("foreignobject", cleaned)
        self.assertNotIn("formaction", cleaned)
        self.assertIn("<rect", cleaned)

    def test_disguised_javascript_link_is_removed(self) -> None:
        source = (
            "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 10'>"
            "<image href='javascript\u200b:alert(1)' x='0' y='0' width='10' height='10'/>"
            "</svg>"
        )
        cleaned = sanitize_svg_bytes(source.encode("utf-8")).decode("utf-8")
        lowered = cleaned.lower()
        self.assertNotIn("javascript", lowered)
        self.assertNotIn("alert", lowered)
        self.assertNotIn("\u200b", cleaned)
        self.assertIn("<image", lowered)

    def test_style_cannot_point_at_an_external_address(self) -> None:
        source = (
            "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 10'>"
            "<rect width='10' height='10' style='fill:url(javascript:alert(1))'/>"
            "</svg>"
        )
        with self.assertRaises(SvgSanitizationError):
            sanitize_svg_bytes(source.encode("utf-8"))
