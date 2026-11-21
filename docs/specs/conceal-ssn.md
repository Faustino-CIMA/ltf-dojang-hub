# Conceal the social security number

Status: spec only. No code until this spec is approved.

The social security number is shown in full today on the club member form and on the club-management record. It should be masked until someone who is allowed to see it asks. Locked fields, including that number, should show a lock so it is obvious they cannot be edited. Licence-card PDFs and letterheads do not print this number today, and this spec does not add it to any PDF.

The number belongs to a social security card from Luxembourg, Germany, France, or Belgium. The copy keeps saying social security number. It does not call the card an identity card.

## Mask

Default state: the field shows bullets for every digit except the last four. A fake Luxembourg example stored as `1971100213046` is shown as `•••••••••3046`. A short or empty value stays empty. The mask follows the stored length, so a 12-character German number and an 11-digit Belgian number keep their own length. Letters in a German number are masked the same way as digits, except the last four characters.

The field is read-only while masked, so a paste does not replace the hidden part with the bullets. Editing happens only while the number is revealed and the field is unlocked.

## Show and hide

A button sits on the same row as the label. It uses the Eye icon while the number is hidden, and the EyeOff icon while it is visible. The visible text is **Show number** or **Hide number** (en), **Afficher le numéro** or **Masquer le numéro** (fr), **Nummer anzeigen** or **Nummer verbergen** (de), **Nummer weisen** or **Nummer verstoppen** (lb). The icon is not alone. `aria-pressed` is true while the number is visible.

The number hides itself again after 30 seconds, and as soon as the person leaves the page or closes the panel. A second press hides it at once.

Who can press it:

- A club admin of that member's club.
- An LTF admin.
- The member, on their own record only, including a minor account looking at their own number.

A coach cannot. A finance desk cannot. Another member cannot. The button is absent, not merely disabled, when the role cannot reveal.

A staff reveal (club admin or LTF admin) is written to the audit log: who, which member, and that the number was shown. The log does not contain the number. A member opening their own number is not an audit event.

## Lock

Verification already locks `first_name`, `last_name`, `date_of_birth`, `sex`, and `social_security_number`. The country of the number is refused on update while the member is locked as well. Those fields get a status icon beside the label.

- Closed lock, label **Locked** (en), **Verrouillé** (fr), **Gesperrt** (de), **Gespaart** (lb), when the member is verified and the field cannot be edited.
- Open lock, label **Can be edited** (en), **Peut être modifié** (fr), **Kann geändert werden** (de), **Kann geännert ginn** (lb), when the field is open.

The icon is not a button. It does not unlock. Unlock stays the existing action, with its own label. The lock uses the theme foreground and muted tokens. It is not red. Red stays for a real error, such as a number that fails the country check.

The same pair is used on every locked field, not only the social security number, so a locked name and a locked birth date look the same.

## Where it appears

Today the full number is rendered in two places:

- The club member form, create and edit (`member-form-panel`).
- The club-management record on the member (`member-club-record-panel`).

Both use the shared field: mask, eye button, and lock. Member lists and the member's own overview do not show the number today. If a later column or preview shows it, it uses this same field. The ops audit page already omits the number and keeps omitting it.

A verification result that needs to say the numbers differ names the field. It does not print both full numbers on screen. The masked form is enough.

## Keyboard and screen readers

The eye control is a button. Enter and Space toggle it. Focus is visible. The accessible name is the same text as the visible label. `aria-pressed` tells the state. The lock is text plus an icon, with the words in the accessible name, so the state is not colour or shape alone.

On a phone, including Brave on an iPhone, the label stays beside the icon. The row uses the normal control height. The number does not need the camera.

## Later encryption

A later spec may encrypt the number with Fernet and keep a blind index for exact lookup. This mask does not depend on that. The API keeps returning the number to a role that may see it. The server decrypts before that response. The screen never receives ciphertext, and it never shows the blind index. The mask, the eye, and the lock stay as specified here. Encryption does not change the PDF, because the PDF does not print the number.

## Copy

New strings go in en, fr, de, and lb together. No hard-coded sentence in the component.

## Out of scope

No change to how a number is validated, stored, or locked. No change to licence-card PDFs, letterheads, or any other PDF. No new role. No import or export work. That is the separate data-exchange spec.
