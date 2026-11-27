# Club member onboarding

Status: spec only. No app code until this spec is merged and the maintainer says go. Nothing in this pull request changes the app, the database, or a dependency.

This is the digital replacement for a club's paper fiche d'adhésion. A person, or a parent, fills one form. The club admin reads it and approves it. Until that approval, nothing is written to a live member, family, or login.

Examples below are fake. Example Dojang, Lea Keller, Ana Silva, and Noa Keller are not real people. `lea.keller@example.test` is not a real address. `1893120105732` is the existing checksum fixture, not a person.

## What this reuses

| Need | Already in the app |
| --- | --- |
| Member | `members.Member`. Last name is stored in capitals, first name in title case (`normalize_last_name`, `normalize_first_name`). Sex is `M` or `F`. A new member with no grade gets `10th Kup` (`OFFICIAL_GRADES[0]` in `members/grades.py`). |
| Club record | `clubmgmt.MemberRecord`: social security number and country, nationality, joined date, publication ticks, membership fee. |
| Address | `LuAddressFields` (`frontend/src/components/clubmgmt/lu-address-fields.tsx`). Saved as `MemberAddress` or `PersonAddress`: street, house number, line 2, postal code, locality, country. |
| Phones and emails | `MemberPhone` / `PersonPhone` (number plus a short label), `Member.email`, `MemberEmail` / `PersonEmail`. |
| Emergency contact | `Person` plus `MemberContact` (`is_emergency`, one `is_primary`, relation such as mother, father, guardian). |
| Family | `Family`, `FamilyMember`, and `Family.bill_to_person` when the payer is not a member. |
| Fees | Active `MembershipFee` rows and `MembershipFeePrice.amount_for_year`. The club license fee is `ClubLicenseFee`, separate from dues. An invoice is `create_membership_invoice` in `clubmgmt/billing.py`. |
| Timetable | Active `TrainingSeries`: name, audience, weekday, start, end, venue. |
| Committee and coaches | A club `Committee` and its current mandates. Coaches are `Club.trainers`. |
| Logo, IBAN, email | `Club.iban` (already checked), `Club.email`, `Club.website`, and the selected club logo on `BrandingAsset`. |
| Number check | `members.ssn_countries.validate_ssn` and `birth_agrees`, for `LU`, `DE`, `FR`, and `BE`, stored on `MemberRecord.social_security_country`. Luxembourg stays 13 digits, a real date, Luhn, then Verhoeff. Do not use `validate_luxembourg_ssn` alone: it only checks length and the date. A German health-insurance number is still rejected. |
| First login | `issue_setup_invite` and `AccountSetupInvite`: hashed token, 7 days, single use. |
| Encryption | `FERNET_KEYS` in settings, and `EncryptedCharField` in `licenses/fields.py`. The same key list. No second crypto library. |
| Dates on screen | `formatDisplayDate` and `formatDisplayDateTime`: `29.11.2026` and `29.11.2026 14:05` in `Europe/Luxembourg`. Stored values stay UTC or ISO. |
| Club PDF | The club letterhead in `licenses/pdf_utils.py`, rendered with the existing WeasyPrint adapter. |
| Public token page | The same shape as account setup and the card-check handoff: a locale route, an opaque token, no login. |
| Rate limit | The cache bucket in `clubs/access_links.py` (30 an hour is that feature's cap). Onboarding gets its own keys. |
| Review UI | `SidePanel`: one Close, in the header. Menus are icon plus label. Theme tokens only. Copy in `en`, `fr`, `de`, and `lb`. |

License-card PDFs stay untouched. `backend/licenses/card_rendering.py` is not used. ReportLab stays where it is (subsidy overlay and the login-link sheet). This fiche does not add a PDF library.

## 1. Two ways in

Both are off until a club admin turns them on, separately, in Club settings. A club can run one, both, or neither.

### Reusable club link and QR code

One link per club, stable until the admin rotates it. The QR code is that same URL. Scanning it opens the form. It does not identify a person.

Before any personal detail is accepted, the applicant enters an email and asks for a code. The server emails a short numeric code to that address. The code lasts 10 minutes, works once, and a wrong code does not reveal whether the address is new. Submitting the form requires a code that was just accepted for that email.

Limits, each with its own message (not a generic failure):

- 5 code emails per address per hour
- 20 code emails per IP per hour
- 10 form submits per IP per hour

The public link itself is rate limited the same way. Rotating the link invalidates the old URL and the old QR code.

### Admin-sent invite

From the club desk, a club admin either:

- types an email and the server sends the link, or
- generates the link and copies it, to pass on by WhatsApp, SMS, or their own mail.

The token is random, stored only as a SHA-256 hash (same idea as `hash_setup_token`), lasts 7 days, and works once. It is tied to that club and, when the admin typed an email, to that email. The form then skips the "ask for a code" step only because the email is already bound to the token. The person still confirms the address on screen.

A used, expired, or revoked invite shows its own sentence and does not open the form. Generating a new invite for the same email revokes the previous unused one.

## 2. The form

One page, mobile first, no modal. Steps are a short progress line, not a popup. Last name is above first name. Dates are typed and shown as `DD.MM.YYYY`. The language picker is the existing four locales and can be changed on step 1. The choice is kept for the rest of that visit in memory only.

Refresh loses the draft. That is deliberate. See section 3.

### Step 1. Language and the club

The page loads the club from the link. It shows only public club facts:

- selected club logo, club name, city
- active membership fees for the current year (name and amount, for example `Adult 180.00 EUR`) and the license fee when the club charges one
- the weekly timetable from active training series (weekday, time, audience, venue)
- a short rules summary, plus a link to the current règlement when the club has published one
- the equipment note from onboarding settings, when the club wrote one
- club email, website, and IBAN
- current committee role and the holder's name, and the coaches' names

No member list, no phone of a private person, no social security number.

### Step 2. Who is joining

Two choices:

- Myself, an adult of 18 or over
- My child, or my children, under 18

There is no path for enrolling some other adult who is not the guardian. On the child path the guardian can tick "I am also joining as a member myself" and be included in the same submission. See the child path.

The server decides each person's path from the date of birth, using the Luxembourg calendar date. 18 or over is an adult member. Under 18 is a child. A date that disagrees with the choice is refused, with a sentence that says which one applies.

### Adult path

One person, 18 or over.

- Last name, first name, date of birth, sex, nationality (the existing ISO list, stored as `nationality_1`)
- Sex is Male or Female only. Both competition categories (WT and LTF) need one of those two, and `Member.sex` stores `M` or `F`. The field is required. There is no third value.
- Social security number and its country: Luxembourg, Germany, France, or Belgium, the same four `MemberRecord` already stores. The country picker comes first. Luxembourg is the 13-digit matricule, checked with `validate_ssn("LU", ...)` (date, Luhn, Verhoeff). Germany, France, and Belgium use `validate_ssn` for that country. A German health-insurance number is refused. The date encoded in the number must agree with the date of birth (`birth_agrees`).
- Address through `LuAddressFields`
- Home phone and mobile, stored as two phone rows with those labels
- Email, the address the code was sent to, not editable into a different inbox
- Photo, only when the club asks for one. Optional or required is a club setting. The file follows the existing member-photo pipeline after approval.
- Up to three emergency contacts: last name, first name, relation (the existing `MemberContact` relations), phone. The first is the primary emergency contact.
- Health declaration, the short medical summary, and an optional médico-sportif note or file. The public page links to `https://sports.public.lu/fr/programs/medico-sportif.html`. Whether the file is required is a club setting.
- Photo and film consent, per child on the other path and once here
- Acceptance of the club rules, titled `Règlement d'ordre intérieur du {clubName}`
- Signature, in section 4

### Child path

The guardian is entered once. Each child is entered after that. One signature covers the whole submission. Address, emergency contacts, and the signature are shared. Personal details, health, and photo consent are not.

Guardian, once:

- Last name, first name, email (the verified address), mobile, relation to the children
- One shared address through `LuAddressFields`
- Up to three emergency contacts, shared by every person in this submission
- An optional tick, off by default: "I am also joining as a member myself"

With that tick off, the guardian is a `Person`, not a `Member`. The family can bill that person (`Family.bill_to_person`).

With that tick on, the same guardian block also asks for the adult member fields: date of birth (must be 18 or over), sex (Male or Female only), nationality, social security number and country (the same four-country check as the adult path), photo under the club setting, their own health declaration and médico-sportif file, their own photo and film ticks, and their own short medical summary. Approval creates a `Member` for them in this family, and still keeps them as the guardian contact. They do not fill a second form.

Then one or more children. For each child, only:

- Last name, first name, date of birth, sex (Male or Female only), nationality, social security number and country (the same check, and the date must agree)
- Optional photo, under the same club setting
- That child's health declaration, optional médico-sportif file, and short medical summary
- That child's photo and film answer, which may differ from a sibling or from the guardian

Then the rules acceptance and one signature by the guardian. The typed name is the guardian's, and it must match the guardian name on the form.

Adding a child is a button on the page. Removing one drops only that child. At least one child is required.

### Photo and film

The ticks are the ones `MemberRecord` already has: Facebook, Instagram, X, TikTok, webpage, print. They sit under one heading, photo and film. All start off. Select all and Clear, the same pair the member record already has, apply to that person only. A child can differ from a sibling. Approval writes those booleans onto that member's club record. It does not invent a second consent store.

### Health questions

The condition list is data, not a hard-coded form. A federation-level catalogue (empty until the LTF medical expert fills it) supplies the questions: a stable code, a label in en, fr, de, and lb, and whether a free-text note is offered. The club cannot add its own medical questions.

Each answer is yes, no, or, when the question allows it, a short note. "No to every question" is a valid declaration.

Beside the answers, each person writes a short medical summary in plain words: what a coach should do to help them in training. Example for a fake applicant: "Inhaler in the kit bag if the session is long." The summary is stored encrypted next to the answers, not in the plain `medical_notes` text. Coaches read the summary. They do not get the raw checklist.

A separate checkbox, not ticked by default, is the GDPR Article 9 consent. The sentence names who can see the training view, in section 5.

Spec 2, Health Badge and Médico-sportif Tracking, builds the green, yellow, and red badge, the cleared-to-train or temporary-restriction flag, and the category A periodic tracking on top of these answers. This spec stores the answers and the summary. It does not draw the badge and does not schedule checkups. `MedicalCheckup` stays as it is.

## 3. Security and the waiting area

The public site is HTTPS only. Social security numbers, health answers, files, signatures, and email codes never appear in a URL, a query string, a referrer, or a log line. The opaque invite token may be in the path. It is a capability, not a personal fact.

No third-party tracker, font, or script on this flow. No analytics snippet.

The browser keeps the draft in React state only. `localStorage` and `sessionStorage` are not used for the social security number, health answers, the summary, files, or the signature. Leaving the page or refreshing clears them.

### Staging

A new onboarding submission model, in the club-management app, holds the application until a club admin acts. It is not `Member`, `Family`, `Person`, or `User`.

Creating those live rows happens only in the approval transaction in section 5.

Sensitive columns use Fernet with `FERNET_KEYS`, through the helpers in `licenses/fields.py`. That file today encrypts a short string. A long health payload and a signature image need a text-sized field on the same key list, not a new library. If `FERNET_KEYS` is missing, the server refuses to store the submission and shows its own message. It must not fall through to the current "no key, save the plain text" path in `EncryptedCharField`.

Encrypted at rest:

- social security number, whichever of the four countries it is
- health answers, the short medical summary, and the médico-sportif file
- signature image and the typed signer name inside the audit payload

The signed PDF and its SHA-256 live beside them. The hash is plain, so it can be checked without decrypting the form. The PDF file is not publicly served.

### How long it waits

A submission nobody has approved or rejected is deleted 30 days after it was filed, including its files. Thirty days is the default of one setting, not a number written only in code, so it can be lowered later without a release. A club admin does not change it. Rejection deletes the social security number, the health answers, the summary, the médico-sportif file, and the signature image immediately. The admin's decision row can keep the club, the decision, the reason, and the time, without those fields.

A nightly job does the expiry. It is safe to run twice.

## 4. Signature and the signed PDF

Simple electronic signature, in the eIDAS sense of a drawn signature plus the signer's name and the statements they ticked. Not a qualified certificate, and not a new signature product.

The pad is an HTML canvas. Touch and mouse. No new npm package.

The person must:

- draw a signature
- type their full name (last name then first name), matching the adult or the guardian on the form
- tick the club rules, naming `Règlement d'ordre intérieur du {clubName}` and the version
- tick photo and film only when they mean to allow it (the channel ticks are the record; this line points at them)
- tick the health notice when health answers are present

The audit row stores:

- the verified email
- the UTC time, shown in Luxembourg as `DD.MM.YYYY HH:mm`
- the rules version id and the SHA-256 of the file or text they were shown
- the SHA-256 of the generated PDF

The PDF is the fiche as it was signed: club letterhead (name, logo, address from `licenses/pdf_utils.py`), the answers, the ticks, the signature image, and the audit lines. WeasyPrint, the existing adapter. Not the license-card renderer. Not ReportLab.

The applicant, or the guardian, is emailed a copy of that PDF after approval, not before. The club keeps the same file on the member.

## 5. What the club admin does

A club admin on the full club desk sees an Onboarding queue for that club. A coach, a view-only grant, finance, and a member do not. The queue has a count badge. The menu item is an icon plus a label.

Opening a row opens a `SidePanel`. One Close, in the header. No modal.

The panel shows the application the way the PDF reads it, with the social security number masked until Show number, the same mask the member record already uses. The club admin reviewing the application can read that person's health answers and the short summary.

### Duplicates and families

Before approval the server looks, inside this club, for:

- the same social security number for the same country
- the same last name, first name, and date of birth
- a family that already uses the guardian's email

The panel lists each hit and lets the admin:

- link a new child to that family
- mark the row as a likely duplicate and stop
- mark a likely transfer and stop (the existing `MemberTransfer` flow is unchanged; this does not move a member by itself)

A social security number that already belongs to a member is not written a second time.

### Who sees health after approval

Club Admin, coaches of that member's club (`Club.trainers` and the coach desk for that club), and a national-team coach see the same training view. A national-team coach is `NationalTeamStaff` function `national_coach` or `sportlycee_coach`, and only while this member is currently selected on a national-team squad. The view is:

- the three-colour health badge (green, yellow, red), drawn by Spec 2
- whether the member is cleared to train or has a temporary restriction
- the short medical summary, so they know how to help during training

They do not see a different set from each other. Other clubs, LTF Finance, and staff with no role on this member have no access. The detailed answers stay encrypted. The club admin can open them on the member record. Coaches and national-team coaches are not given the raw checklist.

### Approve

Approve runs in one transaction:

- create each `Member` (last name, first name, date of birth, sex, email, club, `belt_rank` `10th Kup`, active)
- create `MemberRecord` (social security number and `social_security_country` of `LU`, `DE`, `FR`, or `BE`, nationality, publication ticks, `joined_at` the approval date)
- create the address and the phones
- create the `Person` records for a guardian who is not also joining, and for the emergency contacts, and `MemberContact` rows (`is_emergency`, first one `is_primary`)
- on the child path, create or reuse the `Family` and attach the children. If the guardian is not also a member, set `bill_to_person` to that guardian. If they are also joining, add their `Member` to the same family.
- store the health answers and the short summary on an encrypted member-linked record that Spec 2 will read, not in the plain `medical_notes` text
- attach the signed PDF
- email that PDF to the verified address

Two optional ticks on the panel, off by default:

- Create the first-login account, via `issue_setup_invite`. One invite per new member who is 16 or over. Under 16 is skipped, with a line that says so. No second setup page.
- Generate the membership-fee invoice for the current year, via `create_membership_invoice`, using the fee the admin picks from the club's active fees. A child household is one invoice to the guardian when the family is billed to that person.

### Reject

Reject asks for an optional reason. It sends a short email when the admin leaves the reason filled in, then purges the sensitive fields as in section 3. It does not create a member.

## 6. Club settings

A new Onboarding tab on `/dashboard/club/settings`, icon plus label, beside the tabs that are already there (profile, trainers, committee, publication, equipment).

The tab lets a club admin:

- turn the reusable link on or off
- turn admin invites on or off
- copy, rotate, and download the QR code for the reusable link
- upload a file or paste a link for the règlement, as a new version (version number, date, SHA-256). The previous version stays readable so an old signature still points at what was signed. One version is current.
- write the equipment note shown on step 1 (there is no public equipment note today; member gear sizes are a different screen)
- choose whether the photo is hidden, optional, or required
- choose whether the médico-sportif file is hidden, optional, or required

The 30-day purge is a single setting, default 30, kept with this configuration so it can be lowered after a year or two of live use. It is not a per-club choice.

Turning a mode off does not delete applications already waiting.

## 7. Build it in small pull requests

Each pull request branches from the latest `develop`, targets `develop`, and is one slice. No stacked pull requests. Tests land in the same pull request as the behaviour.

1. Settings and the rules version. Flags, equipment note, photo and médico requirements, versioned règlement with a hash. No public page.
2. Read-only public overview for step 1 (logo, fees, timetable, rules link, contacts, IBAN). Still no personal data.
3. Reusable link, QR code, and the email code, with the rate limits and distinct errors.
4. Admin invite: send, or copy. Hashed single-use token.
5. Staging model, Fernet fields, refuse-when-no-key, and the purge setting (default 30 days).
6. Adult form through to a stored submission, including the canvas signature.
7. Child and guardian form, several children, the optional "I am also joining" tick, one signature.
8. Signed PDF and its SHA-256, on the club letterhead. License cards untouched.
9. Queue, side panel, duplicate and family hints.
10. Approve and reject, including the live member, family, contacts, consents, and the purge.
11. The two optional ticks: first-login invite, and the membership invoice.

## 8. How it is tested

Backend tests use fake people only. They cover the Luxembourg checksum (accept `1893120105732`, reject a bad check digit), one valid shape for Germany, France, and Belgium and a rejected German health-insurance number, a date of birth that disagrees with the number, sex refused when it is neither male nor female, the adult and child split at 18, a second child on the same submission, a guardian who also joins becoming a member at `10th Kup` and a guardian who does not join staying a `Person`, rate limits, a reused invite, expiry when the purge setting is 30 days, rejection wiping the social security number and the summary, and approval creating a member with grade `10th Kup`. Approval is refused when `FERNET_KEYS` is empty, and the database row does not contain the plain number.

Frontend tests cover the step order, last name before first name, the health consent checkbox starting unticked, and no write to `localStorage`.

A Playwright smoke walks the public page in Chromium with fake data: language, adult path, and a submit that stops on a missing signature.

CI cannot open a real iPhone camera or a real mail inbox. The pull request that ships the public form includes this manual check, and says it is required before release:

1. On an iPhone, in Safari, open the reusable link, ask for a code, and confirm the code field is usable.
2. Repeat in Brave on that iPhone.
3. Fill the child path with two children and the guardian also joining, draw a signature with a finger, and submit.
4. Confirm the waiting application is absent from the member list until Approve.
5. Approve, and confirm the signed PDF opens and the grade is 10th Kup.
