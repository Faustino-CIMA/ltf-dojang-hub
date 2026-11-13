from django.test import SimpleTestCase

from licenses.pdf_raster import rasterize_pdf_page
from licenses.weasyprint_adapter import write_pdf


class PdfRasterTests(SimpleTestCase):
    def test_first_page_becomes_a_png_of_the_requested_width(self):
        pdf = write_pdf(
            "<style>@page{size:85mm 55mm;margin:0}body{margin:0}</style><p>Card</p>"
        )
        self.assertIsNotNone(pdf)
        png = rasterize_pdf_page(pdf, target_width_px=1260)
        self.assertTrue(png.startswith(b"\x89PNG"))
        from io import BytesIO

        from PIL import Image

        image = Image.open(BytesIO(png))
        self.assertAlmostEqual(image.size[0], 1260, delta=2)
        self.assertAlmostEqual(image.size[0] / image.size[1], 85 / 55, delta=0.02)
