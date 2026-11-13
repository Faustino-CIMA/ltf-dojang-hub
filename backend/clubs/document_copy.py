"""Wording for emails and PDFs in en, fr, de, and lb. English is the fallback."""

from __future__ import annotations

DOCUMENT_LANGUAGES = ("en", "fr", "de", "lb")

_LICENSE_WORD = {
    "en": "License",
    "fr": "Licence",
    "de": "Lizenz",
    "lb": "Lizenz",
}


def normalize_document_language(value: str | None) -> str | None:
    code = str(value or "").strip().lower().replace("_", "-").split("-", 1)[0]
    if code in DOCUMENT_LANGUAGES:
        return code
    return None


def resolve_document_language(*, explicit: str | None = None, club=None, prefer_club: bool = False) -> str:
    """A chosen locale wins, unless the club language is the recipient preference."""
    explicit_code = normalize_document_language(explicit)
    club_code = None
    if club is not None:
        club_code = normalize_document_language(getattr(club, "communication_language", None))
    if prefer_club and club_code:
        return club_code
    if explicit_code:
        return explicit_code
    if club_code:
        return club_code
    return "en"


def license_word(language: str | None) -> str:
    code = normalize_document_language(language) or "en"
    return _LICENSE_WORD[code]


def _pick(table: dict[str, dict[str, str]], language: str | None) -> dict[str, str]:
    code = normalize_document_language(language) or "en"
    return dict(table.get(code) or table["en"])


_INVOICE = {
    "en": {
        "invoice": "Invoice",
        "status": "Status",
        "issued": "Issued",
        "paid": "Paid",
        "club": "Club",
        "bill_to": "Bill to",
        "delivery": "Delivery",
        "order": "Order",
        "currency": "Currency",
        "item": "Item",
        "qty": "Qty",
        "unit_price": "Unit price",
        "unit": "Unit",
        "total": "Total",
        "subtotal": "Subtotal",
        "tax": "Tax",
        "credits": "Credits",
        "amount_due": "Amount due",
        "payconiq": "Payconiq",
        "scan_payconiq": "Scan to pay (Payconiq)",
        "payconiq_missing": "Payconiq QR not available",
        "sepa": "SEPA",
        "scan_sepa": "Scan to pay (SEPA transfer)",
        "sepa_missing": "SEPA QR not available",
        "name": "Name",
        "license": "License",
        "license_id": "License ID",
        "total_qty": "Total Qty",
        "subject": "Subject",
        "placed": "Placed",
        "delivered": "Delivered",
        "item_service": "Item / service",
        "size": "Size",
    },
    "fr": {
        "invoice": "Facture",
        "status": "Statut",
        "issued": "Émise",
        "paid": "Payée",
        "club": "Club",
        "bill_to": "Facturer à",
        "delivery": "Remise",
        "order": "Commande",
        "currency": "Devise",
        "item": "Article",
        "qty": "Qté",
        "unit_price": "Prix unitaire",
        "unit": "Prix",
        "total": "Total",
        "subtotal": "Sous-total",
        "tax": "Taxe",
        "credits": "Avoirs",
        "amount_due": "Montant dû",
        "payconiq": "Payconiq",
        "scan_payconiq": "Scanner pour payer (Payconiq)",
        "payconiq_missing": "QR Payconiq indisponible",
        "sepa": "SEPA",
        "scan_sepa": "Scanner pour payer (virement SEPA)",
        "sepa_missing": "QR SEPA indisponible",
        "name": "Nom",
        "license": "Licence",
        "license_id": "N° de licence",
        "total_qty": "Qté totale",
        "subject": "Objet",
        "placed": "Passée",
        "delivered": "Livrée",
        "item_service": "Article / service",
        "size": "Taille",
    },
    "de": {
        "invoice": "Rechnung",
        "status": "Status",
        "issued": "Ausgestellt",
        "paid": "Bezahlt",
        "club": "Verein",
        "bill_to": "Rechnungsempfänger",
        "delivery": "Übergabe",
        "order": "Bestellung",
        "currency": "Währung",
        "item": "Posten",
        "qty": "Menge",
        "unit_price": "Einzelpreis",
        "unit": "Preis",
        "total": "Summe",
        "subtotal": "Zwischensumme",
        "tax": "Steuer",
        "credits": "Gutschriften",
        "amount_due": "Fälliger Betrag",
        "payconiq": "Payconiq",
        "scan_payconiq": "Zum Bezahlen scannen (Payconiq)",
        "payconiq_missing": "Payconiq-QR nicht verfügbar",
        "sepa": "SEPA",
        "scan_sepa": "Zum Bezahlen scannen (SEPA-Überweisung)",
        "sepa_missing": "SEPA-QR nicht verfügbar",
        "name": "Name",
        "license": "Lizenz",
        "license_id": "Lizenz-ID",
        "total_qty": "Menge gesamt",
        "subject": "Betreff",
        "placed": "Aufgegeben",
        "delivered": "Geliefert",
        "item_service": "Posten / Leistung",
        "size": "Größe",
    },
    "lb": {
        "invoice": "Rechnung",
        "status": "Status",
        "issued": "Ausgestallt",
        "paid": "Bezuelt",
        "club": "Club",
        "bill_to": "Rechnungsempfänger",
        "delivery": "Iwwerginn",
        "order": "Bestellung",
        "currency": "Währung",
        "item": "Posten",
        "qty": "Zuel",
        "unit_price": "Eenzelpräis",
        "unit": "Präis",
        "total": "Total",
        "subtotal": "Zwëschentotal",
        "tax": "Steier",
        "credits": "Gutschrëften",
        "amount_due": "Ze bezuelen",
        "payconiq": "Payconiq",
        "scan_payconiq": "Scanne fir ze bezuelen (Payconiq)",
        "payconiq_missing": "Payconiq-QR net disponibel",
        "sepa": "SEPA",
        "scan_sepa": "Scanne fir ze bezuelen (SEPA-Iwwerweisung)",
        "sepa_missing": "SEPA-QR net disponibel",
        "name": "Numm",
        "license": "Lizenz",
        "license_id": "Lizenz-ID",
        "total_qty": "Zuel total",
        "subject": "Objet",
        "placed": "Gemaach",
        "delivered": "Geliwwert",
        "item_service": "Posten / Leeschtung",
        "size": "Gréisst",
    },
}

_STATEMENT = {
    "en": {
        "invoice": "Invoice",
        "issued": "Issued",
        "status": "Status",
        "total": "Total",
        "credits": "Credits",
        "paid": "Paid",
        "due": "Due",
        "outstanding": "Outstanding",
        "generated": "Generated",
        "empty": "No invoices for this period.",
        "account": "Account statement",
    },
    "fr": {
        "invoice": "Facture",
        "issued": "Émise",
        "status": "Statut",
        "total": "Total",
        "credits": "Avoirs",
        "paid": "Payé",
        "due": "Dû",
        "outstanding": "Reste dû",
        "generated": "Établi",
        "empty": "Aucune facture pour cette période.",
        "account": "Relevé de compte",
    },
    "de": {
        "invoice": "Rechnung",
        "issued": "Ausgestellt",
        "status": "Status",
        "total": "Summe",
        "credits": "Gutschriften",
        "paid": "Bezahlt",
        "due": "Offen",
        "outstanding": "Offener Betrag",
        "generated": "Erstellt",
        "empty": "Keine Rechnungen für diesen Zeitraum.",
        "account": "Kontoauszug",
    },
    "lb": {
        "invoice": "Rechnung",
        "issued": "Ausgestallt",
        "status": "Status",
        "total": "Total",
        "credits": "Gutschrëften",
        "paid": "Bezuelt",
        "due": "Op",
        "outstanding": "Nach op",
        "generated": "Opgestallt",
        "empty": "Keng Rechnunge fir dës Period.",
        "account": "Kontauszuch",
    },
}

_PACK = {
    "en": {
        "title": "Membership invoices {year}",
        "intro": "{count} invoice(s) to print and deliver.",
        "invoice": "Invoice",
        "payer": "Payer",
        "delivery": "Delivery",
        "address": "Address / note",
        "amount": "Amount",
        "hand": "Hand to the member",
    },
    "fr": {
        "title": "Factures de cotisation {year}",
        "intro": "{count} facture(s) à imprimer et à remettre.",
        "invoice": "Facture",
        "payer": "Payeur",
        "delivery": "Remise",
        "address": "Adresse / note",
        "amount": "Montant",
        "hand": "Remettre au membre",
    },
    "de": {
        "title": "Mitgliedsbeitragsrechnungen {year}",
        "intro": "{count} Rechnung(en) zum Drucken und Aushändigen.",
        "invoice": "Rechnung",
        "payer": "Zahler",
        "delivery": "Übergabe",
        "address": "Adresse / Hinweis",
        "amount": "Betrag",
        "hand": "Dem Mitglied aushändigen",
    },
    "lb": {
        "title": "Memberbeitragsrechnungen {year}",
        "intro": "{count} Rechnung(en) fir ze drécken an ze ginn.",
        "invoice": "Rechnung",
        "payer": "Bezueler",
        "delivery": "Iwwerginn",
        "address": "Adress / Notiz",
        "amount": "Betrag",
        "hand": "Dem Member ginn",
    },
}

_CONSENT = {
    "en": {
        "title": "Publication consent",
        "empty": "No members match this list.",
        "last_name": "Last name",
        "first_name": "First name",
        "birth": "Date of birth",
        "age": "Age",
        "document": "Document",
        "date": "Date",
    },
    "fr": {
        "title": "Consentement de publication",
        "empty": "Aucun membre ne correspond à cette liste.",
        "last_name": "Nom",
        "first_name": "Prénom",
        "birth": "Date de naissance",
        "age": "Âge",
        "document": "Document",
        "date": "Date",
    },
    "de": {
        "title": "Einwilligung zur Veröffentlichung",
        "empty": "Keine Mitglieder passen zu dieser Liste.",
        "last_name": "Nachname",
        "first_name": "Vorname",
        "birth": "Geburtsdatum",
        "age": "Alter",
        "document": "Dokument",
        "date": "Datum",
    },
    "lb": {
        "title": "Accord fir ze verëffentlechen",
        "empty": "Keng Memberen passen op dës Lëscht.",
        "last_name": "Familljennumm",
        "first_name": "Virnumm",
        "birth": "Gebuertsdatum",
        "age": "Alter",
        "document": "Dokument",
        "date": "Datum",
    },
}

_SHOP = {
    "en": {
        "catalogue": "Shop catalogue",
        "catalogue_heading": "equipment catalogue",
        "snapshot": "Stock snapshot",
        "snapshot_heading": "stock snapshot",
        "sku": "SKU",
        "item": "Item",
        "size": "Size",
        "quantity": "Quantity",
        "price": "Price",
        "stickers": "Stickers",
    },
    "fr": {
        "catalogue": "Catalogue de la boutique",
        "catalogue_heading": "catalogue d'équipement",
        "snapshot": "Instantané de stock",
        "snapshot_heading": "instantané de stock",
        "sku": "SKU",
        "item": "Article",
        "size": "Taille",
        "quantity": "Quantité",
        "price": "Prix",
        "stickers": "Étiquettes",
    },
    "de": {
        "catalogue": "Shop-Katalog",
        "catalogue_heading": "Ausrüstungskatalog",
        "snapshot": "Bestandsaufnahme",
        "snapshot_heading": "Bestandsaufnahme",
        "sku": "SKU",
        "item": "Artikel",
        "size": "Größe",
        "quantity": "Menge",
        "price": "Preis",
        "stickers": "Etiketten",
    },
    "lb": {
        "catalogue": "Shop-Katalog",
        "catalogue_heading": "Ekipement-Katalog",
        "snapshot": "Stockopnam",
        "snapshot_heading": "Stockopnam",
        "sku": "SKU",
        "item": "Artikel",
        "size": "Gréisst",
        "quantity": "Zuel",
        "price": "Präis",
        "stickers": "Etiketten",
    },
}

_REPORT = {
    "en": {
        "income_sheet": "Income statement",
        "income_title": "Income statement",
        "balance_sheet": "Balance sheet",
        "balance_title": "Balance sheet",
        "cover": "Cover",
        "annual": "Annual financial report {year}",
        "license_income": "License fee income",
        "license_by_club": "License income by club",
        "surplus": "Surplus / (deficit)",
    },
    "fr": {
        "income_sheet": "Compte de résultat",
        "income_title": "Compte de résultat",
        "balance_sheet": "Bilan",
        "balance_title": "Bilan",
        "cover": "Couverture",
        "annual": "Rapport financier annuel {year}",
        "license_income": "Recettes des licences",
        "license_by_club": "Recettes des licences par club",
        "surplus": "Excédent / (déficit)",
    },
    "de": {
        "income_sheet": "Gewinn- und Verlustrechnung",
        "income_title": "Gewinn- und Verlustrechnung",
        "balance_sheet": "Bilanz",
        "balance_title": "Bilanz",
        "cover": "Deckblatt",
        "annual": "Jahresfinanzbericht {year}",
        "license_income": "Lizenzgebühreneinnahmen",
        "license_by_club": "Lizenzeinnahmen nach Verein",
        "surplus": "Überschuss / (Fehlbetrag)",
    },
    "lb": {
        "income_sheet": "Gewënn- a Verloschtrechnung",
        "income_title": "Gewënn- a Verloschtrechnung",
        "balance_sheet": "Bilan",
        "balance_title": "Bilan",
        "cover": "Deckel",
        "annual": "Joresfinanzbericht {year}",
        "license_income": "Lizenzrecetten",
        "license_by_club": "Lizenzrecetten pro Club",
        "surplus": "Iwwerschoss / (Defizit)",
    },
}

_EMAILS: dict[str, dict[str, dict[str, str]]] = {
    "reset": {
        "en": {
            "subject": "Reset your LTF Dojang Hub password",
            "greeting": "Hello {name},",
            "body": "We received a request to reset your LTF Dojang Hub password.",
            "username": "Your username: {username}",
            "action": "Reset your password:",
            "ignore": "If you did not request this, you can ignore this email.",
        },
        "fr": {
            "subject": "Réinitialisez votre mot de passe LTF Dojang Hub",
            "greeting": "Bonjour {name},",
            "body": "Nous avons reçu une demande de réinitialisation de votre mot de passe LTF Dojang Hub.",
            "username": "Votre nom d'utilisateur : {username}",
            "action": "Réinitialisez votre mot de passe :",
            "ignore": "Si vous n'êtes pas à l'origine de cette demande, vous pouvez ignorer cet e-mail.",
        },
        "de": {
            "subject": "Setzen Sie Ihr LTF-Dojang-Hub-Passwort zurück",
            "greeting": "Guten Tag {name},",
            "body": "Wir haben eine Anfrage erhalten, Ihr LTF-Dojang-Hub-Passwort zurückzusetzen.",
            "username": "Ihr Benutzername: {username}",
            "action": "Passwort zurücksetzen:",
            "ignore": "Wenn Sie das nicht angefordert haben, können Sie diese E-Mail ignorieren.",
        },
        "lb": {
            "subject": "Setzt Äert LTF Dojang Hub Passwuert zréck",
            "greeting": "Moien {name},",
            "body": "Mir hunn eng Ufro kritt, Äert LTF Dojang Hub Passwuert zréckzesetzen.",
            "username": "Äre Benotzernumm: {username}",
            "action": "Passwuert zrécksetzen:",
            "ignore": "Wann Dir dat net ugefrot hutt, kënnt Dir dës E-Mail ignoréieren.",
        },
    },
    "member_invite": {
        "en": {
            "subject": "Your LTF Dojang Hub login",
            "greeting": "Hello {name},",
            "body": "A login is ready for you at LTF Dojang Hub.",
            "username": "Your username: {username}",
            "action": "Open this link to choose your password:",
            "ignore": "If you did not expect this, you can ignore this email.",
        },
        "fr": {
            "subject": "Votre connexion à LTF Dojang Hub",
            "greeting": "Bonjour {name},",
            "body": "Une connexion est prête pour vous sur LTF Dojang Hub.",
            "username": "Votre nom d'utilisateur : {username}",
            "action": "Ouvrez ce lien pour choisir votre mot de passe :",
            "ignore": "Si vous n'attendiez pas ce message, vous pouvez l'ignorer.",
        },
        "de": {
            "subject": "Ihre Anmeldung bei LTF Dojang Hub",
            "greeting": "Guten Tag {name},",
            "body": "Eine Anmeldung ist für Sie bei LTF Dojang Hub bereit.",
            "username": "Ihr Benutzername: {username}",
            "action": "Öffnen Sie diesen Link, um Ihr Passwort zu wählen:",
            "ignore": "Wenn Sie diese Nachricht nicht erwartet haben, können Sie sie ignorieren.",
        },
        "lb": {
            "subject": "Är Umeldung bei LTF Dojang Hub",
            "greeting": "Moien {name},",
            "body": "Eng Umeldung ass fir Iech um LTF Dojang Hub prett.",
            "username": "Äre Benotzernumm: {username}",
            "action": "Maacht dëse Link op, fir Äert Passwuert ze wielen:",
            "ignore": "Wann Dir dës Noriicht net erwaart hutt, kënnt Dir se ignoréieren.",
        },
    },
    "picture_rejected": {
        "en": {
            "subject": "Photo not approved",
            "greeting": "Hello,",
            "body": "{name}'s new photo was not approved. The current photo stays. They can sign in and send another one.",
            "reason": "Reason: {reason}",
        },
        "fr": {
            "subject": "Photo non acceptée",
            "greeting": "Bonjour,",
            "body": "La nouvelle photo de {name} n'a pas été acceptée. La photo actuelle reste. Cette personne peut se connecter et en envoyer une autre.",
            "reason": "Motif : {reason}",
        },
        "de": {
            "subject": "Foto nicht angenommen",
            "greeting": "Guten Tag,",
            "body": "Das neue Foto von {name} wurde nicht angenommen. Das bisherige Foto bleibt. Die Person kann sich anmelden und ein neues senden.",
            "reason": "Grund: {reason}",
        },
        "lb": {
            "subject": "Foto net ugeholl",
            "greeting": "Moien,",
            "body": "Dat neit Foto vun {name} gouf net ugeholl. Déi aktuell Foto bleift. D'Persoun kann sech umellen an eng nei schécken.",
            "reason": "Grond: {reason}",
        },
    },
    "minor_invite": {
        "en": {
            "subject": "A login for {name}",
            "greeting": "Hello,",
            "body": "A login is ready for {name}. They sign in with the username below, not with an email address.",
            "username": "Username: {username}",
            "action": "Open this link to choose their password:",
            "ignore": "If you did not expect this, you can ignore this email.",
        },
        "fr": {
            "subject": "Une connexion pour {name}",
            "greeting": "Bonjour,",
            "body": "Une connexion est prête pour {name}. La connexion se fait avec le nom d'utilisateur ci-dessous, pas avec une adresse e-mail.",
            "username": "Nom d'utilisateur : {username}",
            "action": "Ouvrez ce lien pour choisir le mot de passe :",
            "ignore": "Si vous n'attendiez pas ce message, vous pouvez l'ignorer.",
        },
        "de": {
            "subject": "Eine Anmeldung für {name}",
            "greeting": "Guten Tag,",
            "body": "Eine Anmeldung ist für {name} bereit. Die Anmeldung erfolgt mit dem Benutzernamen unten, nicht mit einer E-Mail-Adresse.",
            "username": "Benutzername: {username}",
            "action": "Öffnen Sie diesen Link, um das Passwort zu wählen:",
            "ignore": "Wenn Sie diese Nachricht nicht erwartet haben, können Sie sie ignorieren.",
        },
        "lb": {
            "subject": "Eng Umeldung fir {name}",
            "greeting": "Moien,",
            "body": "Eng Umeldung ass fir {name} prett. D'Umeldung geet mam Benotzernumm hei drënner, net mat enger E-Mail-Adress.",
            "username": "Benotzernumm: {username}",
            "action": "Maacht dëse Link op, fir d'Passwuert ze wielen:",
            "ignore": "Wann Dir dës Noriicht net erwaart hutt, kënnt Dir se ignoréieren.",
        },
    },
    "welcome": {
        "en": {
            "subject": "You are a Club Admin for {club}",
            "greeting": "Hello {name},",
            "body": "You have been assigned as a Club Admin for {club} in LTF Dojang Hub.",
            "username": "Your username: {username}",
            "action": "Set your password:",
            "ignore": "If you did not expect this email, you can ignore it.",
        },
        "fr": {
            "subject": "Vous êtes admin de club pour {club}",
            "greeting": "Bonjour {name},",
            "body": "Vous êtes admin de club pour {club} dans LTF Dojang Hub.",
            "username": "Votre nom d'utilisateur : {username}",
            "action": "Choisissez votre mot de passe :",
            "ignore": "Si vous n'attendiez pas ce message, vous pouvez l'ignorer.",
        },
        "de": {
            "subject": "Sie sind Club-Admin für {club}",
            "greeting": "Guten Tag {name},",
            "body": "Sie sind Club-Admin für {club} im LTF Dojang Hub.",
            "username": "Ihr Benutzername: {username}",
            "action": "Legen Sie Ihr Passwort fest:",
            "ignore": "Wenn Sie diese Nachricht nicht erwartet haben, können Sie sie ignorieren.",
        },
        "lb": {
            "subject": "Dir sidd Club-Admin fir {club}",
            "greeting": "Moien {name},",
            "body": "Dir sidd Club-Admin fir {club} am LTF Dojang Hub.",
            "username": "Äre Benotzernumm: {username}",
            "action": "Setzt Äert Passwuert:",
            "ignore": "Wann Dir dës Noriicht net erwaart hutt, kënnt Dir se ignoréieren.",
        },
    },
    "transfer_request": {
        "en": {
            "subject": "Member transfer request: {member}",
            "body": "A club admin of {from_club} requested to transfer {member} to {to_club}.",
            "fee": "Proposed transfer fee: {fee_amount} {fee_currency}.",
            "free": "This is a free transfer.",
            "note": "Note: {note}",
            "action": "Review:",
        },
        "fr": {
            "subject": "Demande de transfert : {member}",
            "body": "Un admin de club de {from_club} demande le transfert de {member} vers {to_club}.",
            "fee": "Frais de transfert proposés : {fee_amount} {fee_currency}.",
            "free": "Ce transfert est gratuit.",
            "note": "Note : {note}",
            "action": "Examiner :",
        },
        "de": {
            "subject": "Vereinswechsel angefragt: {member}",
            "body": "Ein Club-Admin von {from_club} hat den Wechsel von {member} zu {to_club} angefragt.",
            "fee": "Vorgeschlagene Wechselgebühr: {fee_amount} {fee_currency}.",
            "free": "Dieser Wechsel ist kostenlos.",
            "note": "Hinweis: {note}",
            "action": "Prüfen:",
        },
        "lb": {
            "subject": "Transfert ugefrot: {member}",
            "body": "En Club-Admin vu {from_club} freet den Transfert vu {member} op {to_club}.",
            "fee": "Proposéiert Transfert-Frais: {fee_amount} {fee_currency}.",
            "free": "Dësen Transfert ass gratis.",
            "note": "Notiz: {note}",
            "action": "Nokucken:",
        },
    },
    "transfer_fee": {
        "en": {
            "subject": "Transfer fee notice: {member} ({fee_amount} {fee_currency})",
            "body": "A member transfer with a fee was requested. {member} from {from_club} to {to_club}.",
            "fee": "Proposed fee: {fee_amount} {fee_currency}.",
            "review": "This notice is so LTF can review unusual transfer fees.",
            "action": "Open:",
        },
        "fr": {
            "subject": "Avis de frais de transfert : {member} ({fee_amount} {fee_currency})",
            "body": "Un transfert de membre avec des frais a été demandé. {member} de {from_club} vers {to_club}.",
            "fee": "Frais proposés : {fee_amount} {fee_currency}.",
            "review": "Cet avis permet à la LTF d'examiner des frais de transfert inhabituels.",
            "action": "Ouvrir :",
        },
        "de": {
            "subject": "Hinweis zur Wechselgebühr: {member} ({fee_amount} {fee_currency})",
            "body": "Ein Vereinswechsel mit Gebühr wurde angefragt. {member} von {from_club} zu {to_club}.",
            "fee": "Vorgeschlagene Gebühr: {fee_amount} {fee_currency}.",
            "review": "Dieser Hinweis dient der LTF zur Prüfung ungewöhnlicher Wechselgebühren.",
            "action": "Öffnen:",
        },
        "lb": {
            "subject": "Hinweis Transfert-Frais: {member} ({fee_amount} {fee_currency})",
            "body": "En Member-Transfert mat Frais gouf ugefrot. {member} vu {from_club} op {to_club}.",
            "fee": "Proposéiert Frais: {fee_amount} {fee_currency}.",
            "review": "Dësen Hinweis ass fir datt d'LTF ongewéinlech Transfert-Frais nokuckt.",
            "action": "Opmaachen:",
        },
    },
    "transfer_status": {
        "en": {
            "subject": "Member transfer {kind}: {member}",
            "body": "The transfer of {member} from {from_club} to {to_club} was {kind}.",
            "action": "Open:",
        },
        "fr": {
            "subject": "Transfert {kind} : {member}",
            "body": "Le transfert de {member} de {from_club} vers {to_club} est {kind}.",
            "action": "Ouvrir :",
        },
        "de": {
            "subject": "Vereinswechsel {kind}: {member}",
            "body": "Der Wechsel von {member} von {from_club} zu {to_club} ist {kind}.",
            "action": "Öffnen:",
        },
        "lb": {
            "subject": "Transfert {kind}: {member}",
            "body": "Den Transfert vu {member} vu {from_club} op {to_club} ass {kind}.",
            "action": "Opmaachen:",
        },
    },
    "confirm": {
        "en": {
            "subject": "Verify your email for LTF Dojang Hub",
            "greeting": "Hello,",
            "body": "Thanks for registering with LTF Dojang Hub. Please verify your email address:",
            "action": "Verify your email",
            "ignore": "If you did not request this account, you can ignore this email.",
        },
        "fr": {
            "subject": "Vérifiez votre e-mail pour LTF Dojang Hub",
            "greeting": "Bonjour,",
            "body": "Merci de vous être inscrit à LTF Dojang Hub. Veuillez vérifier votre adresse e-mail :",
            "action": "Vérifier votre e-mail",
            "ignore": "Si vous n'avez pas demandé ce compte, vous pouvez ignorer cet e-mail.",
        },
        "de": {
            "subject": "Bestätigen Sie Ihre E-Mail für LTF Dojang Hub",
            "greeting": "Guten Tag,",
            "body": "Danke für Ihre Registrierung bei LTF Dojang Hub. Bitte bestätigen Sie Ihre E-Mail-Adresse:",
            "action": "E-Mail bestätigen",
            "ignore": "Wenn Sie dieses Konto nicht angefordert haben, können Sie diese E-Mail ignorieren.",
        },
        "lb": {
            "subject": "Confirméiert Är E-Mail fir LTF Dojang Hub",
            "greeting": "Moien,",
            "body": "Merci fir Är Umeldung bei LTF Dojang Hub. Confirméiert w.e.g. Är E-Mail-Adress:",
            "action": "E-Mail confirméieren",
            "ignore": "Wann Dir dëse Kont net ugefrot hutt, kënnt Dir dës E-Mail ignoréieren.",
        },
    },
}


_DELIVERY = {
    "en": {"email": "Email", "post": "Post", "hand": "In person"},
    "fr": {"email": "E-mail", "post": "Courrier", "hand": "En main propre"},
    "de": {"email": "E-Mail", "post": "Post", "hand": "Persönlich"},
    "lb": {"email": "E-Mail", "post": "Post", "hand": "Perséinlech"},
}


def delivery_label(language: str | None, method: str | None) -> str:
    labels = _pick(_DELIVERY, language)
    return labels.get(str(method or "").strip().lower(), "")


def invoice_labels(language: str | None) -> dict[str, str]:
    labels = _pick(_INVOICE, language)
    labels["doc_lang"] = normalize_document_language(language) or "en"
    return labels


def statement_labels(language: str | None) -> dict[str, str]:
    labels = _pick(_STATEMENT, language)
    labels["doc_lang"] = normalize_document_language(language) or "en"
    return labels


def pack_labels(language: str | None, *, year: int, count: int) -> dict[str, str]:
    labels = _pick(_PACK, language)
    labels["title"] = labels["title"].format(year=year)
    labels["intro"] = labels["intro"].format(count=count)
    labels["doc_lang"] = normalize_document_language(language) or "en"
    return labels


_CHANNELS = {
    "en": {"Website": "Website", "Print media": "Print media"},
    "fr": {"Website": "Site web", "Print media": "Presse"},
    "de": {"Website": "Webseite", "Print media": "Printmedien"},
    "lb": {"Website": "Websäit", "Print media": "Printmedien"},
}


def channel_label(language: str | None, label: str) -> str:
    return _pick(_CHANNELS, language).get(label, label)


def consent_labels(language: str | None) -> dict[str, str]:
    labels = _pick(_CONSENT, language)
    labels["doc_lang"] = normalize_document_language(language) or "en"
    return labels


def shop_labels(language: str | None) -> dict[str, str]:
    labels = _pick(_SHOP, language)
    labels["doc_lang"] = normalize_document_language(language) or "en"
    return labels


def report_labels(language: str | None) -> dict[str, str]:
    return _pick(_REPORT, language)


def email_copy(template: str, language: str | None, **values) -> dict[str, str]:
    raw = _pick(_EMAILS[template], language)
    rendered = {}
    for key, value in raw.items():
        try:
            rendered[key] = value.format(**values)
        except (KeyError, IndexError):
            rendered[key] = value
    return rendered
