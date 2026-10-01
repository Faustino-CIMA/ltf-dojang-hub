from .languages import DEFAULT_CLUB_LANGUAGE, normalize_club_language

INVOICE_COPY = {
    "en": {
        "subject": "Invoice {number}",
        "hello": "Hello,",
        "ready": "Your invoice {number} is ready.",
        "total": "Total due: {total} {currency}",
        "pdf": "The PDF is attached to this email.",
        "thanks": "Thank you.",
    },
    "lb": {
        "subject": "Rechnung {number}",
        "hello": "Moien,",
        "ready": "Är Rechnung {number} ass prett.",
        "total": "Total ze bezuelen: {total} {currency}",
        "pdf": "De PDF ass un dës E-Mail ugemaach.",
        "thanks": "Merci.",
    },
}


def invoice_copy_for_club(club) -> dict[str, str]:
    language = normalize_club_language(getattr(club, "communication_language", None))
    return INVOICE_COPY.get(language) or INVOICE_COPY[DEFAULT_CLUB_LANGUAGE]


REMINDER_COPY = {
    "en": {
        "subject": "Payment reminder: invoice {number}",
        "hello": "Hello,",
        "ready": "This is a reminder that invoice {number} is still unpaid.",
        "total": "Amount still due: {total} {currency}",
        "pdf": "The invoice PDF is attached.",
        "thanks": "Thank you.",
    },
    "lb": {
        "subject": "Erënnerung: Rechnung {number}",
        "hello": "Moien,",
        "ready": "Dëst ass eng Erënnerung, datt d'Rechnung {number} nach net bezuelt ass.",
        "total": "Nach ze bezuelen: {total} {currency}",
        "pdf": "De Rechnungs-PDF ass ugemaach.",
        "thanks": "Merci.",
    },
}


def reminder_copy_for_club(club) -> dict[str, str]:
    language = normalize_club_language(getattr(club, "communication_language", None))
    return REMINDER_COPY.get(language) or REMINDER_COPY[DEFAULT_CLUB_LANGUAGE]
