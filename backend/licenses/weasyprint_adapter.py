"""The only module that imports WeasyPrint.

Callers pass HTML and get PDF bytes. They do not construct WeasyPrint's HTML
class, so a change in that constructor is fixed here.
"""

from __future__ import annotations

_MISSING = object()
_html = _MISSING


def clear_engine_cache() -> None:
    global _html
    _html = _MISSING


def load_html():
    """Return WeasyPrint's HTML class, or None when it cannot be imported."""
    global _html
    if _html is not _MISSING:
        return _html
    try:
        from weasyprint import HTML
    except Exception:
        HTML = None
    _html = HTML
    return _html


def write_pdf(html: str, *, base_url: str | None = _MISSING) -> bytes | None:
    """Render HTML. None means WeasyPrint is not available.

    Omit base_url to match a call that does not pass one. Pass base_url=None
    when the caller used to pass that explicitly.
    """
    engine = load_html()
    if engine is None:
        return None
    if base_url is _MISSING:
        return engine(string=html).write_pdf()
    return engine(string=html, base_url=base_url).write_pdf()
