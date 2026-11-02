from .languages import DEFAULT_CLUB_LANGUAGE, normalize_club_language

INVOICE_COPY = {
    "en": {
        "subject": "Invoice {number}",
        "hello": "Hello,",
        "ready": "Your invoice {number} is ready.",
        "due": "Amount due: {total}",
        "paid": "Amount paid: {total}",
        "due_label": "Amount due",
        "paid_label": "Amount paid",
        "pdf": "The PDF is attached to this email.",
        "thanks": "Thank you.",
    },
    "fr": {
        "subject": "Facture {number}",
        "hello": "Bonjour,",
        "ready": "Votre facture {number} est prête.",
        "due": "Montant dû : {total}",
        "paid": "Montant payé : {total}",
        "due_label": "Montant dû",
        "paid_label": "Montant payé",
        "pdf": "Le PDF est joint à cet e-mail.",
        "thanks": "Merci.",
    },
    "de": {
        "subject": "Rechnung {number}",
        "hello": "Guten Tag,",
        "ready": "Ihre Rechnung {number} ist bereit.",
        "due": "Fälliger Betrag: {total}",
        "paid": "Bezahlter Betrag: {total}",
        "due_label": "Fälliger Betrag",
        "paid_label": "Bezahlter Betrag",
        "pdf": "Das PDF ist dieser E-Mail beigefügt.",
        "thanks": "Danke.",
    },
    "lb": {
        "subject": "Rechnung {number}",
        "hello": "Moien,",
        "ready": "Är Rechnung {number} ass prett.",
        "due": "Total ze bezuelen: {total}",
        "paid": "Bezuelt: {total}",
        "due_label": "Ze bezuelen",
        "paid_label": "Bezuelt",
        "pdf": "De PDF ass un dës E-Mail ugemaach.",
        "thanks": "Merci.",
    },
}


def _copy_for(table: dict[str, dict[str, str]], club) -> dict[str, str]:
    raw = str(getattr(club, "communication_language", "") or "").strip().lower()
    if raw in table:
        return table[raw]
    language = normalize_club_language(raw)
    return table.get(language) or table[DEFAULT_CLUB_LANGUAGE]


def invoice_copy_for_club(club) -> dict[str, str]:
    return _copy_for(INVOICE_COPY, club)


REMINDER_COPY = {
    "en": {
        "subject": "Payment reminder: invoice {number}",
        "hello": "Hello,",
        "ready": "This is a reminder that invoice {number} is still unpaid.",
        "total": "Amount still due: {total}",
        "pdf": "The invoice PDF is attached.",
        "thanks": "Thank you.",
    },
    "fr": {
        "subject": "Rappel de paiement : facture {number}",
        "hello": "Bonjour,",
        "ready": "Ceci est un rappel : la facture {number} n'est pas encore réglée.",
        "total": "Montant restant dû : {total}",
        "pdf": "Le PDF de la facture est joint.",
        "thanks": "Merci.",
    },
    "de": {
        "subject": "Zahlungserinnerung: Rechnung {number}",
        "hello": "Guten Tag,",
        "ready": "Dies ist eine Erinnerung, dass Rechnung {number} noch offen ist.",
        "total": "Noch zu zahlen: {total}",
        "pdf": "Das Rechnungs-PDF ist beigefügt.",
        "thanks": "Danke.",
    },
    "lb": {
        "subject": "Erënnerung: Rechnung {number}",
        "hello": "Moien,",
        "ready": "Dëst ass eng Erënnerung, datt d'Rechnung {number} nach net bezuelt ass.",
        "total": "Nach ze bezuelen: {total}",
        "pdf": "De Rechnungs-PDF ass ugemaach.",
        "thanks": "Merci.",
    },
}


def reminder_copy_for_club(club) -> dict[str, str]:
    return _copy_for(REMINDER_COPY, club)
