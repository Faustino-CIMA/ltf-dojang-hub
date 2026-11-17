# Member verification and locking

Status: spec only. The rest of this document is approved. The name-matching section is the recommendation added for confirmation. No code until this spec is merged.

A club admin or an LTF admin can check a member against a social security card from Luxembourg, Germany, France, or Belgium. Border clubs have members from all four. When the card and the record agree, the member is verified and the checked fields lock. The photograph of the card is never stored. The same check, the same lock, and the same badge are meant to be reused later for enrolment, including when the person fills the form themselves.

## What the operator sees

### Badge

A small shield, success token (green), wherever a member is shown:

- `/dashboard/club/members`, its own mark on the row
- `/dashboard/ltf/members`, the same mark
- the member detail page, in the overview, on the title row
- any later enrolment summary that shows the person

The mark has a text label as well as the colour. The accessible name is "Verified" (en), "Vérifié" (fr), "Geprüft" (de), "Nogekuckt" (lb). Unverified members have no badge. A locked member who was unlocked and not checked again has no badge.

### Phone check

The admin opens Verify on the member. On a phone, the camera opens at once. The page says what will be read (name, date of birth, social security number) and that the picture is not kept. The person holds the card in the frame. The phone reads the text. The card text is the reference. Names follow the subset rule in Name matching. The social security number, the date of birth, and sex when the card shows it, must match exactly. If that holds, the admin is offered the full names from the card, then the fields lock. If something does not match, the page names the fields that differ and does not lock anything. The admin can correct the record, when it is not locked, and try again, or stop.

### Desktop and laptop

The same Verify action shows a QR code. Scanning it opens the phone page above. The desktop stays on the member and updates on its own when the phone finishes, so the admin continues there. The code lasts 10 minutes and works once. Closing the panel or starting again cancels the previous code.

## Who can verify

- A club admin of the member's club, the same people who can already edit that member.
- An LTF admin, for any member.
- A coach cannot verify.
- In this phase the member does not verify themselves. The Later section is where that starts.

The admin must already be signed in. The phone page does not create a login.

## What is compared

The text read from the card is the reference. Both sides are normalised first, as in Name matching.

| Card | Record | Rule |
| --- | --- | --- |
| Social security number, in the shape of the member's country | the club record's number, stored with that country | exact, after the country's own check. This is the definitive key |
| Date of birth, when the card prints it or encodes it | `date_of_birth` | exact |
| Sex, when the card prints it | `sex` | exact |
| Family name and given names | `last_name` and `first_name` | subset of the card, in Name matching |

A field the card does not carry is not a failure and is not a pass. The check never succeeds on less than the number plus a name (at least one first-name token and one last-name token). If the club has no number yet, the check cannot succeed. The admin enters it, with the country, through the club-management field first. The number is not taken from the card and saved on a mismatch.

## Cards by country

The member's country chooses the parser. A card whose layout does not match that country is refused, not guessed. Each country is a small record: how the card looks, which side to photograph, which fields are printed, the number rule, and which fields are absent. Adding another country later is a new record of that shape. It does not change the match engine.

Reading stays on the phone for every country. The photograph is never stored, on any path. There is no server-side reader in this phase.

### Luxembourg

The card is the carte de sécurité sociale. It is a plastic card with two faces. The national face is titled as the social-security identification card of the Grand Duchy and is the face to photograph. It prints the holder's name and the 13-digit national identification number (matricule). It has no expiry date of its own. The other face is the European Health Insurance Card, with an expiry date, and is not the face we read.

The number, for a natural person, is `AAAAMMJJXXXC1C2`: year, month, and day of birth, three sequence digits, then two check digits. The 12th digit is a Luhn check of the first 11. The 13th digit is a Verhoeff check of the same 11. The Centre commun de la sécurité sociale published this structure for the identifier introduced on 1 July 2014 under the law of 19 June 2013. CNS and Guichet.lu describe the national face as name plus the 13-digit number. They do not list a separate printed sex. The birth date is inside the number, so it is checked against the record. Sex is absent, so it is skipped.

Sources: [CNS, carte de sécurité sociale](https://cns.public.lu/fr/assure/droits-demarches/bases-bonnes-pratiques/carte-securite-sociale.html), [Guichet.lu, demander la carte](https://guichet.public.lu/fr/leichte-sprache/sante/demande-carte-securite-sociale.html), [CCSS, structure du numéro d'identité](https://ccss.public.lu/dam-assets/seculine/ccss-structure-numero-identite-FR.pdf).

### Germany

Two different cards, and only one of them carries the number we store.

The elektronische Gesundheitskarte (eGK) is the statutory health-insurance card. The front shows a photograph (not for children under 15, and not when a photograph could not be taken), the name, and the lifelong Krankenversichertennummer. The back can be the European Health Insurance Card. The chip holds administrative data, including name, date of birth, address, sex, and the Krankenversichertennummer. That health-card number is not the social security number. Section 290 of SGB V says the pension-insurance number must not be used as the Krankenversichertennummer. A photograph of an eGK is the wrong card for this check. The layout check says so and stops.

The number we store is the Rentenversicherungsnummer, also called the Sozialversicherungsnummer. It is 12 characters: two digits for the pension office, six digits for the birth date as day, month, and year (`TTMMJJ`), the first letter of the birth name, two serial digits, and one check digit. Serial `00` to `49` is male. Serial `50` to `99` is female, or no sex given, or "divers", so that band is not a hard sex match. The check digit replaces the letter with its place in the alphabet as two digits, multiplies the twelve resulting digits by `2, 1, 2, 5, 7, 1, 2, 1, 2, 1, 2, 1`, sums the digit sums of those products, and keeps the remainder modulo 10.

The document that prints this number is the Versicherungsnummernachweis (the successor of the Sozialversicherungsausweis). By law it may show only the number, the given names, the family name, the birth name, and the date of issue. It does not print a separate birth date or a sex. The birth date is inside the number and is checked when those six digits are a real date. Sex is not a hard field on this document.

Sources: [§ 2 VKVV](https://www.gesetze-im-internet.de/vkvv/__2.html), [§ 147 SGB VI](https://rvrecht.deutsche-rentenversicherung.de/SharedDocs/rvRecht/05_Normen_und_Vertraege/01_Sozialgesetzbuch/06_SGB_VI/pp_0126_150/0147/0147_2023_01_01.html), [§ 290 SGB V](https://www.gesetze-im-internet.de/sgb_5/__290.html), [GKV-Spitzenverband, eGK](https://www.gkv-spitzenverband.de/service/versicherten_service_egk/egk.jsp), [BMG, elektronische Gesundheitskarte](https://www.bundesgesundheitsministerium.de/themen/digitalisierung/elektronische-gesundheitskarte).

### France

The card is the carte Vitale. Assurance Maladie states that the numéro de sécurité sociale is printed in visible characters on the card and is also in the chip. The official name of that number is the NIR, numéro d'inscription au répertoire. People call it the numéro de sécurité sociale. The Assurance Maladie app, which carries the same identity data, stores family name, given name, date and place of birth, and the NIR. Sex is the first digit of the NIR (1 man, 2 woman), not a separate line we rely on if it is not printed.

The number used on the card is 15 digits: the 13-digit NIR plus a 2-digit key. The NIR is sex (1), year (2), month (2), place of birth (5: department and commune; Corsica uses `2A` or `2B`), and a 3-digit order number. The key is `97` minus the NIR modulo `97`. For Corsica, `A` or `B` is read as `0`, then `1000000` is subtracted for `A` and `2000000` for `B`, before that modulo. The day of birth is not in the number, only the year and the month. A full date of birth is checked only when the card or the read text actually carries one. Year and month inside the NIR must still agree with the record. A missing day is not a failure by itself. Number and name are still required.

Sources: [ameli, le numéro de sécurité sociale](https://www.ameli.fr/assure/droits-demarches/principes/numero-securite-sociale), [Insee, définition du NIR](https://www.insee.fr/fr/metadonnees/definition/c1409), [Insee, composition du NIR](https://www.insee.fr/fr/information/1302169), [Insee, clé de contrôle](https://xml.insee.fr/schema/nir.html).

### Belgium

Two cards can carry the number. The electronic identity card (eID) is the usual card for a resident. The ISI+ card is for children under 12 and for people covered by Belgian social security who have no Belgian electronic identity card, including many cross-border workers. The news of the federal government says the NISS is printed on the ISI+ card. The Crossroads Bank for Social Security records, for an ISI+ card, the identification number, name, first name, date of birth, and sex.

The number is the NISS, numéro d'identification de la sécurité sociale, which for a person in the population register is the national register number (INSZ in Dutch). It is 11 digits: `YYMMDD` of birth, a 3-digit order number, and a 2-digit check. The order number is odd for a man and even for a woman. The check is `97` minus the first 9 digits modulo `97`. For a person born on or after 1 January 2000, the same subtraction is done after a `2` is placed in front of those 9 digits. The National Register published this rule, including the royal decree of 25 November 1997 for the year 2000. Sex can be checked from the order number when the card does not print sex as a word. Birth date is in the number and is checked.

Photograph the side that shows the 11-digit number. On some eID generations that side is the back. The layout check accepts either the eID or the ISI+ card, and refuses a card whose number is not an 11-digit NISS.

Sources: [Registre national, numéro d'identification (PDF)](https://www.ibz.rrn.fgov.be/sites/default/files/documents/fr/registre-national/instructions/liste-TI/TI000_Numero-identification.pdf), [Registre national, fichier (PDF)](https://www.ibz.rrn.fgov.be/sites/default/files/documents/fr/registre-national/fichier-rn/fichier-RN.pdf), [news.belgium.be, carte ISI+](https://news.belgium.be/fr/un-nouveau-systeme-pour-repondre-la-disparition-progressive-de-la-carte-sis), [KSZ, données de la carte ISI+](https://gdpr.belgium.be/nl/federal-institutions/kruispuntbank-van-de-sociale-zekerheid).

### When a field is missing

| Country | Number we accept | Birth date | Sex | Name |
| --- | --- | --- | --- | --- |
| LU | 13-digit matricule, Luhn then Verhoeff | encoded in the number, so it is checked | not on the card, skipped | printed, required |
| DE | 12-character Rentenversicherungsnummer only. A Krankenversichertennummer is rejected | encoded in the number when the six digits are a real date | serial `00`–`49` may confirm male. `50`–`99` is not a hard sex | printed on the Versicherungsnummernachweis, required |
| FR | 15-digit NIR with key modulo 97 | year and month are in the number and must agree. A full date is checked only when printed | first digit when it is 1 or 2. Otherwise skipped if sex is not printed | required. The number alone is not enough |
| BE | 11-digit NISS, modulo 97, with the post-2000 rule | encoded, so it is checked | odd or even order number, or the printed sex | required |

Never pass a member on fewer than number and name. A card that yields a number but no name tokens is a failed read, not a verify.

### Layout check

Before the text is trusted, the phone checks the picture against a small template for the chosen country: the title words and the shape of the number. Luxembourg expects the national face, not the European face. Germany expects the pension-insurance document, not the health card. France expects a carte Vitale. Belgium expects an eID or an ISI+ card, including the back when that is where the number sits. A picture that fails the template is "wrong card" or "unreadable", and nothing is stored. A new country is a new template and a new number rule.

## Name matching

Recommendation, for confirmation. People have more than one first name and more than one last name, and they will not always type all of them.

Normalise both the card text and the stored names before comparing:

- case is ignored
- accents and other diacritics are stripped (`é` and `e` are the same letter)
- hyphens and spaces are the same break between tokens (`Jean-Pierre` and `Jean Pierre` are the same two tokens)
- apostrophes are removed (`O'Neil` and `Oneil` are the same token)
- particles stay as their own tokens: `de`, `da`, `van`, `von`, and the same kind of word
- extra whitespace is collapsed

The card is the reference.

Hard fields have no tolerance:

- the social security number must be the same on both sides, in the shape of the member's country (Cards by country). A Luxembourg number is 13 digits. The other countries are not 13 digits
- the date of birth must be the same
- sex must be the same when the card shows it

Names are a subset of the card, and order does not matter:

- every name token the member entered must appear on the card
- at least one first-name token and at least one last-name token must match
- tokens on the card that the member did not enter are allowed (a second given name, a second family name)
- a token of 5 letters or more may differ by one character, for a misread letter. Shorter tokens must match exactly, so `de` and `da` are not the same, and a 4-letter name is not fuzzy

Examples:

- Stored `Ana Silva`, card `Ana Maria da Silva`: match. `Ana` and `Silva` are on the card. `Maria` and `da` were not entered, and that is allowed.
- Stored `Jean Pierre`, card `Jean-Pierre`: match, after hyphen and space are treated the same.
- Stored `Anna Silva`, card `Ana Silva`: no match. `Anna` is 4 letters, so the one-character rule does not apply.
- Stored `Marc`, card `Marc Hansen`, with no last name entered: no match, because no last-name token matched.
- Social security number off by one digit: no match, even when every name matches.

On a match, before anything locks, the screen offers to replace the stored first and last names with the full names from the card. The admin confirms or skips. Confirm writes those full names, then locks. Skip leaves the shorter names that already matched, then locks those. The offer is not a way to verify a mismatch.

A mismatch does not verify. The screen names the field that differs (number, date, sex, or which name token). Nothing is partially verified. There is no button that marks the member verified anyway. Changing a locked field later is only Unlock, with a reason in the audit log, and then a new check.

Usual name. The legal names are what the card carries and what locks. An optional usual name is the name the person goes by. It is not compared to the card, and it is not locked. When the admin accepts the full legal names from the card, the names they had typed can be kept as the usual name if they ask. Enrolment later uses the same split: legal name locked after a check, usual name free.

## What locks

Only the fields that were checked:

- legal first name
- legal last name
- date of birth
- sex
- social security number

The usual name is not locked. Address, email, phone, grade, club, photo, and licence stay editable. A normal save of a locked field is refused. The screen shows the field as locked and points at Unlock. There is no override that writes a locked field, or that marks a mismatch as verified, without Unlock and an audit reason.

## Unlock and correct

A club admin of that club, or an LTF admin, can unlock. They must type a reason. Unlock clears the verified state and the badge. The fields can be edited again. Another successful card check is required before they lock again.

The audit row records who, when, the reason, and which fields were unlocked. It records old and new name, date of birth, and sex. It does not record the social security number, only that the number changed. The card image is not in the audit.

## The photograph

The picture is handled in memory and then dropped.

- It is not a file field, not a media upload, not a thumbnail, and not written to a log.
- No third-party service sees it. No Google, Amazon, or other OCR API.
- The phone reads the card itself, for every country. Only the extracted text is sent, once, and the server compares it with the record. The text is not stored after the answer is sent.
- The image does not leave the phone. That matters most for minors: the card photo of a child never reaches the server.
- There is no server-side reader and no third-party reader. If the phone cannot read the card, the check stops. It does not upload the picture.

## Reading the Luxembourg card

Each card carries the fields listed under Cards by country. Glare, a worn card, or a tilted photo will misread characters. The check fails closed: a bad read is a mismatch, the wrong card, or an unreadable card, never a verify.

Fallbacks, in order:

1. Ask for another photo, with the card flat and the light even.
2. If the reader cannot find a 13-digit number, say the card was unreadable and stop.
3. Do not offer "confirm anyway". A one-character slip is tolerated only on a name token of 5 letters or more. It is never tolerated on the social security number, the date of birth, or sex.

## Data

Schema only. No backfill.

- `MemberVerification`: one row per member. Status `unverified` or `verified`. When it was verified, by which user, and that the method was the card check.
- Locked fields live on that row (legal first name, legal last name, date of birth, sex, social security number). Empty when unverified. The usual name is a separate optional field on the member and is never in this list.
- The social security number is stored with its country (`LU`, `DE`, `FR`, `BE`, and later codes of the same shape). The country the member chooses picks the parser and the card template. A number that fails that country's check is refused. A German health-card number is not accepted as a `DE` number. Existing Luxembourg numbers are country `LU`.
- `VerificationChallenge`: the desktop code. Stores a hash of the token, the member, the admin session, when it expires, and when it was used. Not the raw token. Not an image.

Existing members stay unverified. Nothing is locked until a check succeeds.

## Endpoints

All of these sit behind the same auth as member edit, except the phone call that carries the one-time token.

- `POST /api/members/{id}/verification-challenges/` creates a code for that member and the current admin session. Answer: the token and when it expires. The desktop turns that into a QR code whose URL is only the site plus the token. No member id and no personal data in the URL.
- `GET /api/members/{id}/verification/` is what the desktop polls. It returns status, locked fields, and whether a challenge is still open. Short timeout. No card data.
- `POST /api/verification-challenges/{token}/compare/` is the phone. Body: the extracted fields, not the image. The server compares with the name rules above, answers match or the list of differing fields, and does not keep the extracted text. A match does not lock yet: the admin is shown the full names from the card and confirms or skips the update. That confirmation consumes the token, writes the names they accepted, writes the verification row, and locks. A mismatch consumes nothing except rate-limit budget, so a retake can reuse the same code until it expires or succeeds. A mismatch never verifies part of the record.

The token is 256 bits, stored only as a hash, single use, 10 minutes, bound to one member and one admin session. Guessing it is rate limited. Compare is constant-time on the social security number.

## Security

- The picture is never stored, as above.
- The QR URL has no secret other than the token, and the token is not a member id.
- A challenge from one admin session cannot be completed against a different member.
- Minors use the on-device path so the photo stays on the phone. Only text crosses the network, and it is not logged.
- Unlock is audited.
- Verification does not widen who can read the social security number. That stays on the club record, behind club management.

## Copy and presentation

Labels in English, French, German, and Luxembourgish. Success token for the badge and for the verified state. Warning token for a mismatch. No red unless the request itself failed (expired code, no permission). The phone page and the desktop panel use the same words.

## Later

The check, the lock, the badge, and the one-time code should be callable by later enrolment, not rebuilt.

- Clubs with club management off enrol with the short set: name, date of birth, sex, club.
- Clubs with club management on use a multi-step form, because there is more to enter (contact, address, social security number, and the rest of the club record). The fields are the same shape for every club.
- An admin can type the enrolment and then run this verification.
- An admin can send a link to a prospective member. That person fills the form and runs the same card check on their own phone. The token is then tied to the enrolment draft instead of only to an admin session. The picture rules do not change.
- Each club can have terms the person must see and accept. Terms are versioned. Acceptance stores who, which version, and when. A new version needs a new acceptance. Acceptance is not a substitute for the card check.

None of that is in this phase. This phase is the admin-started check, the lock, the badge, and the desktop QR.
