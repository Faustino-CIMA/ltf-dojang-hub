"""Translated club-admin setup and reset mails. English is the fallback."""

from django.template.loader import render_to_string

from accounts.email_utils import send_resend_email

LOCALES = ("en", "fr", "de", "lb")

SETUP_SUBJECTS = {
    "en": "Set your LTF Dojang Hub password",
    "fr": "Choisissez votre mot de passe LTF Dojang Hub",
    "de": "Legen Sie Ihr LTF-Dojang-Hub-Passwort fest",
    "lb": "Setzt Äert LTF Dojang Hub Passwuert",
}

RESET_SUBJECTS = {
    "en": "Reset your LTF Dojang Hub password",
    "fr": "Réinitialisez votre mot de passe LTF Dojang Hub",
    "de": "Setzen Sie Ihr LTF-Dojang-Hub-Passwort zurück",
    "lb": "Setzt Äert LTF Dojang Hub Passwuert zréck",
}


def normalize_locale(value: str | None) -> str:
    code = str(value or "en").strip().lower().replace("_", "-").split("-", 1)[0]
    return code if code in LOCALES else "en"


def _render(kind: str, locale: str, context: dict) -> tuple[str, str, str]:
    locale = normalize_locale(locale)
    subjects = SETUP_SUBJECTS if kind == "setup" else RESET_SUBJECTS
    subject = subjects[locale]
    try:
        html = render_to_string(f"account/email/access_{kind}_{locale}.html", context)
        text = render_to_string(f"account/email/access_{kind}_{locale}.txt", context)
    except Exception:
        html = render_to_string(f"account/email/access_{kind}_en.html", context)
        text = render_to_string(f"account/email/access_{kind}_en.txt", context)
        subject = subjects["en"]
    return subject, html, text


def send_access_email(user, *, kind: str, url: str, locale: str, clubs: str, expires: str):
    name = f"{user.first_name} {user.last_name}".strip() or user.username
    context = {
        "name": name,
        "username": user.username or "",
        "clubs": clubs or "—",
        "url": url,
        "expires": expires,
    }
    subject, html, text = _render(kind, locale, context)
    return send_resend_email(user.email, subject, html, text)
