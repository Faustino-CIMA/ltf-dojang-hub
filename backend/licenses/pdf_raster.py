"""Rasterize a PDF page. The only module that imports pypdfium2.

The input is the PDF the print path already produces. This does not change
that PDF.
"""

from __future__ import annotations

import io


def rasterize_pdf_page(pdf_bytes: bytes, *, target_width_px: int) -> bytes:
    """Return a PNG of the first page, about target_width_px pixels wide."""
    if not pdf_bytes.startswith(b"%PDF"):
        raise ValueError("rasterize_pdf_page expected a PDF.")
    if target_width_px < 1:
        raise ValueError("target_width_px must be at least 1.")

    import pypdfium2 as pdfium

    document = pdfium.PdfDocument(pdf_bytes)
    try:
        page = document[0]
        try:
            width = float(page.get_width() or 0)
            scale = (target_width_px / width) if width else 1.0
            bitmap = page.render(scale=scale)
            try:
                image = bitmap.to_pil()
            finally:
                bitmap.close()
        finally:
            page.close()
    finally:
        document.close()

    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()
