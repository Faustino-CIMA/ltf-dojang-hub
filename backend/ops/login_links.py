"""One file of first-login or password-reset links. Nothing is emailed."""

from __future__ import annotations

import base64
import csv
import io
from datetime import timedelta

from django.conf import settings
from django.utils import timezone

from accounts.email_utils import build_password_reset_url
from accounts.setup_invites import issue_setup_invite, setup_link

COLUMNS = ("username", "name", "link_type", "link", "expiry", "skipped")

WARNINGS = {
    "en": (
        "This file contains live links. Anyone who has the file can set these passwords "
        "until the links expire. It will not be emailed. Delete it when you are finished."
    ),
    "fr": (
        "Ce fichier contient des liens actifs. Quiconque l'a peut définir ces mots de passe "
        "jusqu'à l'expiration. Il ne sera pas envoyé par e-mail. Supprimez-le quand vous avez fini."
    ),
    "de": (
        "Diese Datei enthält aktive Links. Wer sie hat, kann diese Passwörter setzen, bis die "
        "Links ablaufen. Sie wird nicht per E-Mail gesendet. Löschen Sie sie, wenn Sie fertig sind."
    ),
    "lb": (
        "Dëse Fichier huet aktiv Linken. Wien e huet, kann dës Passwierder setzen, bis d'Linken "
        "oflafen. E gëtt net per E-Mail geschéckt. Läscht en, wann s du fäerdeg bass."
    ),
}


def display_name(user) -> str:
    last = str(user.last_name or "").strip()
    first = str(user.first_name or "").strip()
    if last:
        last = last.upper()
    if first:
        first = first[:1].upper() + first[1:]
    return " ".join(part for part in (last, first) if part)


def expiry_stamp(moment) -> str:
    return timezone.localtime(moment).isoformat(timespec="seconds")


def reset_expiry():
    seconds = int(getattr(settings, "PASSWORD_RESET_TIMEOUT", 60 * 60 * 24 * 3))
    return timezone.now() + timedelta(seconds=seconds)


def render_csv(rows: list[dict]) -> str:
    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=list(COLUMNS), lineterminator="\n")
    writer.writeheader()
    for row in rows:
        writer.writerow({key: row.get(key, "") for key in COLUMNS})
    return buffer.getvalue()


def _wrap(text: str, width: int = 90) -> list[str]:
    words = text.split()
    lines: list[str] = []
    current = ""
    for word in words:
        trial = word if not current else f"{current} {word}"
        if len(trial) > width and current:
            lines.append(current)
            current = word
        else:
            current = trial
    if current:
        lines.append(current)
    return lines or [""]


def render_pdf(rows: list[dict], warning: str) -> bytes:
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas

    buffer = io.BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=A4)
    _width, height = A4
    left = 36
    bottom = 36

    def new_page():
        pdf.showPage()
        pdf.setFont("Helvetica", 9)
        return height - 48

    y = height - 48
    pdf.setFont("Helvetica-Bold", 10)
    for line in _wrap(warning):
        if y < bottom:
            y = new_page()
            pdf.setFont("Helvetica-Bold", 10)
        pdf.drawString(left, y, line[:110])
        y -= 14
    y -= 10

    for row in rows:
        block = [
            f"{row['username']}    {row['name']}".strip(),
            f"{row['link_type']}    {row['expiry']}    {row['skipped']}".strip(),
            row["link"] or "—",
        ]
        pdf.setFont("Helvetica", 9)
        for line in block:
            chunks = _wrap(line, 100) if line else [""]
            for chunk in chunks:
                if y < bottom:
                    y = new_page()
                pdf.drawString(left, y, chunk[:120])
                y -= 12
        y -= 8
    pdf.save()
    return buffer.getvalue()


def build_login_link_file(*, users, link_type: str, locale: str, actor) -> dict:
    """Create the links once. Inactive accounts are rows with an empty link."""
    locale_code = locale if locale in WARNINGS else "en"
    rows = []
    created_ids: list[int] = []
    skipped: list[dict] = []
    batch_expiry = ""
    for user in users:
        if not user.is_active:
            rows.append(
                {
                    "username": user.username,
                    "name": display_name(user),
                    "link_type": link_type,
                    "link": "",
                    "expiry": "",
                    "skipped": "inactive",
                }
            )
            skipped.append({"id": user.id, "reason": "inactive"})
            continue
        if link_type == "first_login":
            invite, raw = issue_setup_invite(user, actor)
            link = setup_link(raw, locale_code)
            expires = invite.expires_at
        else:
            link = build_password_reset_url(user, locale_code)
            expires = reset_expiry()
        stamp = expiry_stamp(expires)
        if not batch_expiry:
            batch_expiry = stamp
        rows.append(
            {
                "username": user.username,
                "name": display_name(user),
                "link_type": link_type,
                "link": link,
                "expiry": stamp,
                "skipped": "",
            }
        )
        created_ids.append(user.id)
    kind = "first-login" if link_type == "first_login" else "password-reset"
    csv_text = render_csv(rows)
    pdf_bytes = render_pdf(rows, WARNINGS[locale_code])
    return {
        "created_count": len(created_ids),
        "skipped_count": len(skipped),
        "created_user_ids": created_ids,
        "skipped": skipped,
        "expiry": batch_expiry,
        "message": f"Created {len(created_ids)} {kind} links. Skipped {len(skipped)} inactive.",
        "csv": csv_text,
        "pdf_base64": base64.b64encode(pdf_bytes).decode("ascii"),
    }
