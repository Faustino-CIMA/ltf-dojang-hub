"""The card slot colour sits behind an opaque member photo and does not change the print."""

import base64
from io import BytesIO

from django.test import TestCase
from PIL import Image, ImageChops

from clubs.models import LICENSE_PHOTO_BACKGROUND_DEFAULT, FederationProfile
from licenses.card_rendering import _render_element_html
from licenses.pdf_raster import rasterize_pdf_page
from licenses.weasyprint_adapter import write_pdf


def _drawn_png_data_uri() -> str:
    image = Image.new("RGB", (240, 300), (180, 40, 40))
    for x in range(40, 200):
        for y in range(30, 70):
            image.putpixel((x, y), (20, 20, 120))
    payload = BytesIO()
    image.save(payload, format="PNG")
    encoded = base64.b64encode(payload.getvalue()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


def _image_element(source: str, *, via: str) -> dict:
    return {
        "type": "image",
        "x_mm": "0.00",
        "y_mm": "0.00",
        "width_mm": "24.00",
        "height_mm": "30.00",
        "opacity": "1.00",
        "rotation_deg": "0.00",
        "z_index": 1,
        "visible": True,
        "style": {"object_fit": "contain"},
        "resolved_source": source,
        "resolved_source_meta": {"resolved_via": via},
    }


def _document(fragment: str) -> str:
    return (
        "<!doctype html><html><head><meta charset='utf-8'>"
        "<style>@page{size:24mm 30mm;margin:0}html,body{margin:0;padding:0}</style>"
        "</head><body>"
        f'<div style="position:relative;width:24mm;height:30mm;overflow:hidden;">{fragment}</div>'
        "</body></html>"
    )


class CardPhotoSlotTests(TestCase):
    def test_opaque_member_photo_pdf_matches_the_same_card_without_the_slot_fill(self):
        FederationProfile.objects.create(
            pk=1,
            license_photo_background_color=LICENSE_PHOTO_BACKGROUND_DEFAULT,
        )
        fragment = _render_element_html(
            _image_element(_drawn_png_data_uri(), via="member.profile_picture_processed")
        )
        self.assertIn(f"background:{LICENSE_PHOTO_BACKGROUND_DEFAULT}", fragment)
        filled = write_pdf(_document(fragment))
        plain = write_pdf(_document(fragment.replace(f"background:{LICENSE_PHOTO_BACKGROUND_DEFAULT};", "")))
        self.assertIsNotNone(filled)
        self.assertIsNotNone(plain)
        filled_image = Image.open(BytesIO(rasterize_pdf_page(filled, target_width_px=240))).convert("RGB")
        plain_image = Image.open(BytesIO(rasterize_pdf_page(plain, target_width_px=240))).convert("RGB")
        self.assertEqual(filled_image.size, plain_image.size)
        difference = ImageChops.difference(filled_image, plain_image)
        self.assertIsNone(difference.getbbox())

    def test_other_images_do_not_receive_the_member_photo_colour(self):
        fragment = _render_element_html(
            _image_element(_drawn_png_data_uri(), via="style.image_asset_id")
        )
        self.assertNotIn(f"background:{LICENSE_PHOTO_BACKGROUND_DEFAULT}", fragment)
