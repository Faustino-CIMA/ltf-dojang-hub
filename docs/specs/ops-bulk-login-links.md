# Ops: bulk first-login and password-reset links

Status: spec only. Do not build this until it is approved.

Page: `/en/dashboard/ops/users`.

An operator selects people and downloads one file of live links. The product does not email those links. Today the same page can email a single password reset (`send_password_reset`). That button stays. This spec adds a selection and a file, and it does not send mail.

## What the operator does

1. Search and filter the user list as today.
2. Tick the people on the current page. The header tick selects only the rows on that page. Rows on other pages stay ticked. Changing the search or a filter drops anyone who is no longer visible. The ticks are not stored in the browser, so a reload starts empty. This is the same rule as the member list in PR #88 (`visibleHeaderCheck`, `togglePageSelection`, `pruneSelection`).
3. Choose one action for that selection:
   - **First login links** — the person sets their own password (the existing account-setup link).
   - **Reset password links** — the person replaces their password (the existing reset link).
4. A confirm dialog shows the count of links that will be created, the count of people who will be skipped, and a warning that the file is secret. Cancel does nothing. Confirm creates the links once and downloads a CSV. A PDF of that same set is a second button, not a second set of tokens.
5. The file is the only delivery. No email is sent, including for people who have an address.

One download is one link type. To get both types, the operator runs the action twice and gets two files.

## Who may do this

Only a superuser on the ops desk with a full grant.

- A club admin, coach, member, LTF admin, or LTF finance user is refused, even if they can open other desks.
- A read-only ops grant is refused. The ops desk is full today; the check still requires `level = full` so a later read-only grant cannot mint links.
- The existing user list stays superuser-only. This action uses the same door, plus the full-grant check.

The raw token is created on the server. The browser never receives a token except inside the file the operator just confirmed.

## Links

### First login

Reuse `AccountSetupInvite` and `issue_setup_invite`.

- The link is `/{locale}/account-setup?token=…`, same as a single invite.
- It expires 7 days after it is created.
- It is single use. Opening the page does not use it. Saving a password sets `used_at`. A second visit says the link is closed.
- Creating a new first-login link revokes every older unused, unexpired invite for that person (`revoked_at`). An older link then fails. This is already how `issue_setup_invite` works.
- The file uses the locale the operator is viewing (`en` or `lb` in the app today; `fr` and `de` when those locales are enabled).

### Reset password

Reuse the Django reset token (`PasswordResetTokenGenerator`) and `/reset-password`, same as the emailed reset.

- It expires after `PASSWORD_RESET_TIMEOUT`. The project does not set that, so the Django default of 3 days applies. The file prints that expiry as a date and time.
- It is single use because the token includes the current password hash. After the password changes, the token fails.
- A new reset link must also kill older reset links for that person, including links that were emailed earlier. Django does not store the token, so a new integer on the user (a reset generation) has to be mixed into the hash and incremented each time a reset link is issued. Do not invent a second token scheme.
- Do not email the link. Do not call `send_password_reset_email` from this action.

Neither action prints or stores a password. The person chooses the password when they open the link. Password rules stay as they are on those pages.

## Inactive people and people with no email

- **Inactive** (`is_active` is false): do not create a link. Count them as skipped in the confirm dialog and in the result. They can appear in the file only as a row with the reason "inactive" and an empty link. A disabled account must not gain a way back in through this file.
- **No email**: still create the link. The file is the delivery, so a blank address is not a reason to skip. The email column is empty. Do not pretend an email was sent.
- **Already has a password**: still allowed. The operator chose the type. A first-login link replaces the password when it is used and revokes older setup links. A reset link does the same job as today's emailed reset.
- **The operator themselves**: allowed. The confirm count includes them. Do not add a special block.

If every selected person is inactive, the confirm explains that no file will be created. There is no empty download of live links.

## File

CSV is the required download. PDF is the same rows, for someone who wants a page to hand over. Both are produced from the tokens created by that one confirm. Do not mint a second token for the PDF.

Columns, in this order:

| Column | Contents |
| --- | --- |
| username | Account username |
| name | Family name, then given name. Empty if both are blank. |
| link_type | `first_login` or `reset_password` |
| link | The full URL, or empty when the row was skipped |
| expiry | ISO date and time, or empty when skipped |
| skipped | Empty, or `inactive` |

No password, no password hash, no token on its own, no recovery code, no MFA secret.

The CSV is UTF-8. The PDF repeats the warning from the dialog at the top of the first page: the file holds live links.

The response that carries the file is not cached. The raw tokens are not written to the ops audit log, application logs, or error reports.

## Confirm and warning

The dialog is the last step before any token exists.

- Title, first login: "Create {count} first-login links?"
- Title, reset: "Create {count} password-reset links?"
- Body: "This file contains live links. Anyone who has the file can set these passwords until the links expire. It will not be emailed. Delete it when you are finished."
- Skipped line, only when needed: "{count} inactive accounts will be skipped."
- Buttons: Cancel, then Download CSV. Download PDF uses the same generation after the CSV has been created, or is offered beside it from the same response. Cancel is the quiet button. Download is the primary button. Neither is destructive-red; the danger is the secrecy of the file, which the text states.

After download, a short notice stays on the page: "Downloaded {count} links. The file is sensitive."

## Audit

Write one `OpsAuditLog` row for the batch, after the links exist and before the file is returned.

- `action`: `users.bulk_first_login_links` or `users.bulk_password_reset_links`
- `target_type`: `user`
- `message`: the counts only, for example "Created 12 first-login links. Skipped 2 inactive."
- `metadata`: actor id, link type, expiry timestamp, created user ids, skipped user ids and reasons. No URL, no raw token, no token hash.

Do not write one log line per person if that line would contain the link. The id list is enough to see who was included.

## Staff and two-factor authentication

Issuing a link does not enrol a second factor, does not remove one, and does not extend MFA grace.

After the person sets a password:

- An elevated account (LTF admin, LTF finance, club admin, or superuser) still has to enrol an authenticator app or a passkey before using an elevated desk, under the current MFA rules. A first login does not open a new grace period.
- Someone who already has an authenticator still has to use it on the next elevated sign-in. The password link does not replace that.
- A member or coach who is not staff is unchanged: email codes stay available only for people who are not staff, as today.

The setup page and the reset page do not need new MFA steps. The existing desk gate runs on the next visit to an elevated desk.

## Copy

English is the source. French keeps everyday French and does not need the word "licence" here. Luxembourgish follows the tone already used on the ops pages.

| Key | en | fr | de | lb |
| --- | --- | --- | --- | --- |
| bulkLoginLinks | Login links | Liens de connexion | Anmeldelinks | Umeldungs-Linken |
| bulkFirstLogin | First login links | Liens de première connexion | Links für die erste Anmeldung | Linken fir déi éischt Umeldung |
| bulkResetPassword | Reset password links | Liens de réinitialisation | Links zum Zurücksetzen | Linken fir d'Passwuert zréckzesetzen |
| bulkConfirmFirstLogin | Create {count} first-login links? | Créer {count} liens de première connexion ? | {count} Links für die erste Anmeldung erstellen? | {count} Linken fir déi éischt Umeldung uleeën? |
| bulkConfirmReset | Create {count} password-reset links? | Créer {count} liens de réinitialisation ? | {count} Links zum Zurücksetzen erstellen? | {count} Linken fir d'Passwuert zréckzesetzen uleeën? |
| bulkSensitiveWarning | This file contains live links. Anyone who has the file can set these passwords until the links expire. It will not be emailed. Delete it when you are finished. | Ce fichier contient des liens actifs. Quiconque l'a peut définir ces mots de passe jusqu'à l'expiration. Il ne sera pas envoyé par e-mail. Supprimez-le quand vous avez fini. | Diese Datei enthält aktive Links. Wer sie hat, kann diese Passwörter setzen, bis die Links ablaufen. Sie wird nicht per E-Mail gesendet. Löschen Sie sie, wenn Sie fertig sind. | Dëse Fichier huet aktiv Linken. Wien e huet, kann dës Passwierder setzen, bis d'Linken oflafen. E gëtt net per E-Mail geschéckt. Läscht en, wann s du fäerdeg bass. |
| bulkSkippedInactive | {count} inactive accounts will be skipped. | {count} comptes inactifs seront ignorés. | {count} inaktive Konten werden übersprungen. | {count} inaktiv Konten ginn iwwersprong. |
| bulkNothingToCreate | No links to create. Every selected account is inactive. | Aucun lien à créer. Tous les comptes choisis sont inactifs. | Keine Links zu erstellen. Alle gewählten Konten sind inaktiv. | Keng Linken unzeleeën. All déi gewielt Konten sinn inaktiv. |
| bulkDownloaded | Downloaded {count} links. The file is sensitive. | {count} liens téléchargés. Le fichier est sensible. | {count} Links heruntergeladen. Die Datei ist vertraulich. | {count} Linken erofgelueden. De Fichier ass vertraulech. |
| bulkDownloadCsv | Download CSV | Télécharger le CSV | CSV herunterladen | CSV eroflueden |
| bulkDownloadPdf | Download PDF | Télécharger le PDF | PDF herunterladen | PDF eroflueden |

## Out of scope

- Emailing the file or the links.
- Choosing a password for the person.
- Turning MFA off, printing recovery codes, or extending grace.
- Mixing first-login and reset links in one file.
- Letting any desk other than a full ops grant do this.
