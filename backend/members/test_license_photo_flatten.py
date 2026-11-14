"""A transparent upload is flattened onto the federation colour, not onto white."""

from io import BytesIO

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from PIL import Image

from clubs.models import FederationProfile

from .services import _render_processed_outputs


def _png(image: Image.Image) -> SimpleUploadedFile:
    payload = BytesIO()
    image.save(payload, format="PNG")
    payload.seek(0)
    return SimpleUploadedFile("cutout.png", payload.getvalue(), content_type="image/png")


class LicensePhotoFlattenTests(TestCase):
    def test_transparent_pixels_use_the_federation_colour(self):
        FederationProfile.objects.create(pk=1, license_photo_background_color="#112233")
        image = Image.new("RGBA", (945, 1181), (0, 0, 0, 0))
        for x in range(200, 400):
            for y in range(200, 400):
                image.putpixel((x, y), (200, 10, 10, 255))
        processed, _thumbnail, _details = _render_processed_outputs(_png(image))
        opened = Image.open(BytesIO(processed.read()))
        self.assertEqual(opened.mode, "RGB")
        self.assert_near(opened.getpixel((0, 0)), (17, 34, 51))
        self.assert_near(opened.getpixel((300, 300)), (200, 10, 10))
        self.assertGreater(sum(abs(channel - 255) for channel in opened.getpixel((0, 0))), 100)

    def test_missing_profile_uses_the_light_grey_default(self):
        image = Image.new("RGBA", (945, 1181), (0, 0, 0, 0))
        processed, _thumbnail, _details = _render_processed_outputs(_png(image))
        opened = Image.open(BytesIO(processed.read()))
        self.assert_near(opened.getpixel((0, 0)), (217, 217, 217))

    def test_opaque_jpeg_keeps_its_own_colour(self):
        FederationProfile.objects.create(pk=1, license_photo_background_color="#112233")
        image = Image.new("RGB", (945, 1181), (240, 20, 20))
        payload = BytesIO()
        image.save(payload, format="JPEG", quality=92)
        payload.seek(0)
        uploaded = SimpleUploadedFile("plain.jpg", payload.getvalue(), content_type="image/jpeg")
        processed, _thumbnail, _details = _render_processed_outputs(uploaded)
        opened = Image.open(BytesIO(processed.read()))
        pixel = opened.getpixel((10, 10))
        self.assert_near(pixel, (240, 20, 20))
        self.assertGreater(abs(pixel[0] - 17) + abs(pixel[1] - 34) + abs(pixel[2] - 51), 100)

    def assert_near(self, pixel, expected, delta: int = 2) -> None:
        self.assertEqual(len(pixel), 3)
        for got, want in zip(pixel, expected, strict=True):
            self.assertLessEqual(abs(int(got) - want), delta, pixel)
