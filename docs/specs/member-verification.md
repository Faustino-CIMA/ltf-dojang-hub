# Member verification and locking

Status: spec only. The rest of this document is approved. The name-matching section is the recommendation added for confirmation. No code until this spec is merged.

A club admin or an LTF admin can check a member against the Luxembourg social security card. When the card and the record agree, the member is verified and the checked fields lock. The photograph of the card is never stored. The same check, the same lock, and the same badge are meant to be reused later for enrolment, including when the person fills the form themselves.

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
| 13-digit social security number | the club record's `social_security_number` | exact, after digits only. This is the definitive key |
| Date of birth | `date_of_birth` | exact, after reading a day-month-year or the date inside the 13-digit number |
| Sex, when the card shows it | `sex` | exact |
| Family name and given names | `last_name` and `first_name` | subset of the card, in Name matching |

If the club has no social security number yet, the check cannot succeed. The admin enters it through the existing club-management field first. The number is not taken from the card and saved on a mismatch.

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

- the social security number is 13 digits and must be the same on both sides
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
- Preferred path: the phone reads the card itself (on-device OCR). Only the extracted text is sent, once, over the existing signed-in channel, and the server compares it with the record. The text is not stored after the answer is sent.
- The image itself does not leave the phone on that path. That matters most for minors: the card photo of a child never reaches the server.
- A server-side reader, still our own code, is only a later fallback if on-device reading is too weak on real Luxembourg cards. Even then the server receives the image in the request, compares, and discards it. It is not written to disk.

## Reading the Luxembourg card

The card carries the 13-digit number, the name, and the date of birth. Glare, a worn card, or a tilted photo will misread characters. The check fails closed: a bad read is a mismatch or an unreadable card, never a verify.

Fallbacks, in order:

1. Ask for another photo, with the card flat and the light even.
2. If the reader cannot find a 13-digit number, say the card was unreadable and stop.
3. Do not offer "confirm anyway". A one-character slip is tolerated only on a name token of 5 letters or more. It is never tolerated on the social security number, the date of birth, or sex.

## Data

Schema only. No backfill.

- `MemberVerification`: one row per member. Status `unverified` or `verified`. When it was verified, by which user, and that the method was the card check.
- Locked fields live on that row (legal first name, legal last name, date of birth, sex, social security number). Empty when unverified. The usual name is a separate optional field on the member and is never in this list.
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
