# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]
- **Module fees:** A module price can have an optional maximum, in euros. Empty means no cap. The cap applies to the line after the minimum. A per-member cap limits the line total. Bundles stay a flat price. Invoices already sent stay as they are. The next renewal uses the current cap.
- **Fee invoices:** Invoices from LTF Finance fee billing use the same letterhead as the other federation invoices. Amounts, tax, invoice numbers, and payment stay as they are.
- **Side panels:** Each edit and create panel has one Close button. Escape and the dimmed background still close it.
- **Club desk:** A view-only club desk can read the admin list for the open club again. Appointing or removing an admin is still refused.
- **License types:** A license type that is already used can be removed from new choices. Existing licenses, invoices, payments, and prices keep it and still show its name. A type that nothing uses is deleted as before.
- **Licenses:** Deleting a license that is on an order or a print job no longer ends in a server error. The license, invoice, and payment stay, and the screen explains that Revoked is the status to use. A license with no such link can still be deleted.
- **Invoices:** On the LTF Finance desk, the invoice PDF opens for any club in that list, including the overdue list. A club desk still cannot open another club's invoice.
- **Club profile:** Club admins left the club desk menu and now sit on the Club profile, for the selected club. The old Club admins address opens that section. The LTF menu is unchanged.
- **Club admins:** On the club desk, the admin list is only the selected club. A club admin cannot list, read, change, or revoke admins of a club they do not administer. A superuser or the LTF desk still sees every club.
- **Build:** The subsidies page no longer declares the same translation helper twice, so the production build can finish.
- **Security:** The short description on each security card now sits on an info icon beside the card title. Password step-up, the secret, the regenerate warning, and grace stay on the card.
- **Sections:** Fees, subsidies, the calendar introduction, teams, and committee explanations now sit on an info icon beside the title. Archived teams, the officer notice, delete confirms, and the calendar’s empty state stay on the page.
- **List pages:** The short explanation under a list title now sits on an info icon beside the title. Billing, the bank import, transfer rules, and the query screen stay written on the page.
- **Info badge:** Explanatory notes can sit on a small info icon. Hover, keyboard focus, or a tap opens the note. Escape or moving away closes it. No page text has moved yet.
- **Club admin from a member row:** LTF and club member lists can add a club admin from the three-dots menu, after Edit and before Delete. Someone with no login is asked to create a user account first. Someone who is already a club admin is shown as already on. A view-only desk, a coach, and anyone the server refuses do not gain the action.
- **Navigation:** The slogan under the logo is gone. A menu name that does not fit, including a collapsed icon, shows the full name under the pointer and on keyboard focus.
- **LTF clubs:** Each club row has Edit in the three-dots menu. It opens the same club form as the club page. A view-only desk does not show it.
- **Passkey:** Adding a passkey just after sign-in is no longer treated as a stale visit. If the passkey prompt is cancelled or the browser cannot create one, the note says so. It does not ask you to sign in again.
- **Desk recovery:** If the desk the screen is already using is refused and the sign-in is still valid, the screen opens a desk that is still open. A superuser opens Ops. If the sign-in is gone, the screen goes to sign-in with the usual note. Choosing a desk that is not open, on purpose, is still refused.
- **Create user account:** The panel names each person before you confirm. The login is still created immediately, and a success message slides in. The file is saved only when you press Save CSV. Send invitation email sends the first-login link to people who have an email address.
- **Row menus:** Three-dots menus that were text only now show an icon with the label, including the LTF and club member lists.
- **Security setup:** When an authenticator code or a security key is correct and the password is still required, a success message slides in and the cursor moves to the password field. The password section stays where it is.
- **Sign-in:** Finishing sign-in no longer depends on a desk left in the browser. If the last desk is no longer open, sign-in opens one that is, instead of saying that desk is not open.
- **LTF clubs:** Opening a club no longer shows “That action is not available.” A superuser or an LTF desk can read training venues. A view-only desk still cannot add one. If the venue list cannot be loaded, that note stays with the venues and is not a red page error.
- **Member page:** The club member page no longer shows a pencil beside the three-dots menu. Edit stays in that menu, and every item has an icon and a label. The LTF member page uses the same icon and label on each menu item.
- **Ops translations:** The translations screen lists English, French, German, and Luxembourgish. Those are the four languages the app already ships.
- **Security setup:** When an authenticator code or a security key is correct but the visit is old, the setup is not treated as a failure. The screen says it was correct and asks for the password before saving. A wrong code or a wrong password is still shown as an error.
- **Ops user delete:** Deleting a user on Ops users removes the login only. The member or contact record stays, and office desks end the same way as unlinking that login. Every open session for that login stops at once. A leftover sign-in is sent to the sign-in page with a short note. You cannot delete your own login. The row actions sit in a three-dots menu, with Delete last.

## [0.13.1] - 2026-11-03

### Changed
- **User manual:** The 0.13.0 manual is updated in English, French, German, and Luxembourgish. Screenshots were recaptured, the language menu is described, and the PDFs were rebuilt. There is no other change in how the app works, and there is no database migration. The manuals and PDFs do not need a deploy.
- **Displayed version:** The version in the sidebar, on About, and in the backend default is 0.13.1. That is the same kind of version bump used for 0.13.0. A deploy is what makes the new number appear.

### Documentation
- Public notes for this version, ready to paste into a GitHub release: `docs/releases/v0.13.1.md`.

## [0.13.0] - 2026-11-02

### Added
- **First-run setup:** A superuser imports clubs, then members and LTF staff, then club admins, from CSV. Nothing is emailed during the import. A row with an empty club, an unknown club, or an unreadable membership end date can be parked and still confirmed. “No club yet” is a choice on a member row. The Member ID column maps to both license ids. Active or inactive follows the membership end year.
- **Account setup:** An invited admin sees the role and the organisation, chooses an email and a password, and then sees “Your account is ready.” LTF can send the set-password link again. The club-admin menu uses plain labels for those actions.
- **Club record:** A club stores World Taekwondo or ITF, an RCS number, and its training venues. LTF settings stores the federation RCS number and looks up a Luxembourg address.
- **Luxembourg addresses:** Street, number, postcode, and locality are separate fields. The street field is the street name only, and a house number may include a letter. Suggestions come from the official street register.
- **Invoice address:** One saved address can be marked for invoices. Deleting an account clears that person’s private addresses.
- **National team:** The federation desk keeps squads, Pupils and Minimes, an optional weight, coaches, a medic, and media. A club sees a short badge, not the staff file.
- **LTF staff licenses:** Staff can hold a license with a club or with no club. Lists say when there is no club.
- **Club teams:** With the competition module on, a club keeps a roster, coach roles, a weigh-in, a sheet, Poomsae groups, a duplicate, and a history of who joined or left. A team’s competition can be removed. The members list can show who is not on a team. Height and weight stay with that club.
- **Equipment:** Sizes are grouped as Protectors, e-gear, and clothing. Each club defines the clothing sizes it orders. Daedo or KPNP can be switched off without deleting the sizes.
- **Module fees:** LTF Finance can set a yearly price for Club management and the event calendar. A price is either a flat amount or an amount times the club's active members, with an optional minimum. Billing uses the existing Billing tab and skips a club already invoiced for that year. Only an active club with the module switched on is billed. An unpaid invoice leaves the module on. Club admins can read Modules and prices on the club profile, including when no module is switched on. The yearly figure there is an estimate.
- **Committee:** Offices are recorded as terms and hand over on election day.
- **Header:** The club switcher opens as a small panel. After a logo upload, the preview shows the file that was saved.
- **Subsidies:** The headcount is the January snapshot. A member who holds a license for the year stays in it when the club marks them inactive later. Every licensed member is counted in the age row for 31 December. A coach or official aged 35 or over is included in Veterans / masters, and is still listed again under other licenses.
- **Coach pay:** On Coach pay, a club admin sets each coach to an hourly rate or to one amount per held class. A held class counts in full for every coach on it. The period shows hours, units, training pay, tournament coaching, fuel, hotel, and the total. A tournament, fuel, or hotel row uses its date to pick the period. Leave the coaching fee empty to use the coach's rate. Enter a fee, including 0, when that day is not paid at the rate. Coaches still see hours and units. Only a club admin sees and edits the amounts. A new rate recalculates the open periods. Membership invoices already issued stay as they are.
- **Calendar audiences:** A club date can stay inside the club. Private is that club’s admins only. Internal is that club’s admins and coaches, for a staff outing such as Europapark. Public stays with that club’s members and with LTF Admin. All clubs and the LTF puts the date on the LTF calendar and on every club calendar, with the kind and the club name, so another club can see a Kyorugi or Poomsae day. A Club presidents meeting is an LTF event. Tick the clubs. Only LTF Admins and the current president of each ticked club can see it. The president needs a login on their member record. The calendar does not block a second event on the same day.
- **Calendar link:** The Calendar link shows how many events fall in the next two months. It also shows “new” until each of those events has been opened. A club admin can set a reminder on an event, including the day it should appear. On that day a reminder shows Snooze for a day and Got it. Snooze hides it until the next day. Got it does not show that reminder again.
- **License validity** (#65): A license type can last until 31 December of its year, or for a number of years and days. The expiry is stored on the license when it becomes active and is not moved if the type changes later. Reminder settings can be saved. No reminder is sent yet.
- **Module bundles** (#68, #69, #70, #72, #73): LTF Finance keeps a catalog of bundles and the subscription settings. A bundle needs a unique name and at least two of club management, competition, and the event calendar. The price is a flat amount. Settings cover the subscription length (1–36 months), the renewal notice, the payment window, and the warning. A club admin orders modules and bundles on one federation invoice from Club settings. Finance can create the same invoice from Billing. The modules stay off until that invoice is paid. A bundle is one line. A module already inside a selected bundle is left off the invoice. Two bundles that share a module cannot be ordered together. The period ends a subscription length after the payment day. A daily job at 06:10 Luxembourg time looks at purchases that have an end date. Around the notice window it emails the club, or the club admins when the club has no address, with the modules, the end date, the price of continuing, and two signed links. A later choice replaces the earlier one until the renewal invoice exists. No answer means stop: the modules switch off on the end date and no renewal invoice is created. Continue creates one renewal invoice the day before the end. The modules stay on through the payment window. If that invoice is still unpaid the morning after the window, the modules switch off. Paying it after that turns them back on, and the new period starts that day. A module that is already on with no end date is left alone. Ops can mint a product code for the competition module. LTF Admin can switch the modules on a purchase on or off, change the end date, keep them on with no end date, waive the current period, or cancel the purchase. While that hold is set, the daily job skips the purchase. Each override stores who did it, when, what changed, and an optional reason.
- **Desks** (#75, #76, #78, #79): Each account has a desk grant matching the role it already had, including one grant per club for a club admin or a coach. Someone with more than one desk sees the current desk in the header and a row for each desk. A view-only grant is tagged view only. Someone with one desk still sees a plain role label. The next sign-in opens the last chosen desk. A superuser maps federation offices to desks. The starting map is President to LTF Admin in full and LTF Finance as view only, and Treasurer the other way around. Other offices stay empty until one is mapped. Club offices do not hand out LTF desks. A grant follows the term dates. A contact with no login receives a desk only when a superuser links that contact. A superuser can merge extra logins of one person into the login that should remain. Nothing is matched by name. The screen shows the grants, club links, member profiles, and email addresses that will move. If both logins have a member profile, the merge waits until one profile is chosen. The folded login is set inactive and is kept, so history can still name it. Passkeys on the folded login are removed. The authenticator and recovery codes move only when the kept login does not already have them.
- **Member accounts** (#96): A full club-admin desk can create a login for its own members. A full LTF-admin desk can do it for every member, including someone with no club. The login is a member, with no staff desk. Nothing is emailed. There is no login under 16. Ages 16 and 17 are allowed. A missing date of birth is refused until one is saved. Inactive members are skipped. The members list and the overview show an Account badge: none, waiting, active, or disabled. The list can sort and filter on that badge. Copying a first-login link for an account that is still waiting replaces the older link.
- **Ops links** (#92): A superuser on the ops desk can tick people on the users page and download first-login and password-reset links. Nothing is emailed. The file is CSV, and the same rows are available as a PDF. Columns are username, name, link type, link, expiry, and skipped. First-login links last 7 days, work once, and revoke older setup links. Reset links last 3 days. A new reset link cancels older reset links, including ones that were emailed. Inactive accounts are skipped and listed with an empty link. The confirm panel shows the count and says the file is secret. The download is not cached.
- **License expiry** (#89): Club and LTF license tables have a sortable Expires column. The date is shown the same way as other dates, or a dash when there is none. A date within 30 days uses the warning color. A date already past is muted.

### Changed
- **Name:** The application is called LTF Dojang Hub. The front page, sign-in, welcome back, and the club, federation, and member overviews describe the desk: members, licenses, training, billing, the shop, and the shared calendar.
- **Theme:** The public home, sign-in, and the in-app welcome use the black-and-red theme, and the light counterpart when that theme is selected.
- **Desk:** Edit forms open in side panels. Lists sort. Row actions sit in a menu. The sex mark is a small plain mark. The sidebar stays mounted while you move between pages. Federation links are grouped under LTF management.
- **Printing:** Printing is its own section. Preview, download, and delete are on the print-job row menu. A job that is queued or still running has to be cancelled before it can be deleted. A club print started from the members list uses that member’s current license, so the license year is printed. An active license is used when the member has one. Printing a chosen row from the licenses list still prints that license.
- **List menus:** Members and Actions on the club members list, Clubs and Actions on the LTF clubs list, and Licenses and Actions on the LTF licenses list open as popovers. Those labels use the normal field text color. The print-job, LTF clubs, and LTF licenses trash buttons match the outline trash button on the members list.
- **Member import:** Import from the members list can update a matched person. An empty cell does not wipe a value already stored. This is separate from first-run setup.
- **Club expenses:** The club expense list and form subtitles refer to the club ledger (`clubExpensesSubtitle`, `clubExpenseFormSubtitle`).
- **Training timetable** (#64): The class form picks a training venue from club settings instead of a free-text place. The place stays optional. A class saved earlier with its own place text still shows that text. Renaming a linked venue updates the class. Deleting the venue leaves the last name on the class. Adding a one-off class, and the session page opened from the week, month, or year view, use the same venue picker. Older sessions have no place stored, so they keep showing without one until a venue is chosen. A new class generated from the timetable copies that class’s venue.
- **English spelling** (#66): English interface copy, emails, and docs say license. French stays licence. German and Luxembourgish wording is unchanged. Database columns and API fields keep their current names.
- **Club fees** (#67): On License settings, Club fees, each fee has a pencil. It opens the same form, filled with the name, when it is charged, the description, the active flag, and the current amount. Save updates that fee. A changed amount is the next price and does not rewrite invoices already sent. The fee code stays as it was when the fee was created.
- **Module invoices** (#74): Module and bundle invoices use the same federation letterhead as license invoices, with one row per order line: Item, Qty, Unit, and Subtotal. A bundle stays one line. That PDF is the download, the invoice email attachment, and the file the renewal job attaches. Older club-fee bills that are not module purchases stay on the previous plain invoice.
- **Account security** (#85): Security is a stack of cards in the side panel: authenticator app, recovery codes, passkeys, password, and email codes. Email codes are only for people who are not staff. Staff desks have no switch to turn the authenticator off. A new set of recovery codes replaces every old code, and the card can download the set while it is on screen. Each passkey can be removed. Change password asks for the current password and stays signed in.
- **Member photos** (#87): Photographing a member starts on the rear camera, and falls back when the phone has no rear camera. When the phone has more than one camera, Switch camera stops the current one and starts the other. The camera stops when the panel closes. A person’s own profile photo still starts on the front camera, with the same switch. The shop QR scanner uses that switch too.
- **Federation offices** (#90): Replace on the federation committee can hand an office to any adult, not only the people already on the page. Search is by name and includes club members and people with no club. Each row shows the club name, or LTF when there is no club. People under 18 and inactive members are left out. The club committee picker is unchanged.
- **Ops header** (#91): Open federation dashboard stays on the ops console only when that person has no desk for the dashboard the button opens. When the desk switcher already lists that desk, the button is hidden.
- **French and German** (#93, #94, #95, #97, #98): French and German cover the club admin screens, the LTF admin screens, the LTF finance screens, club management, and the rest of the interface, including ops, import, the member pages, and About. Both can be chosen in the language menu, shown as Français and Deutsch. English stays the default. Luxembourgish is unchanged.
- **Emails and PDFs** (#110): French and German are in the backend language list, and a club can save them as its language. Emails and PDFs use the recipient's locale when one was chosen, otherwise the club's language, otherwise English. French keeps licence. German uses Lizenz, and the income statement sheet is Gewinn- und Verlustrechnung. Luxembourgish stays available. Official subsidy lists stay in their French wording.
- **Member list filters** (#102, #103): On the club members list and the LTF members list, search stays on the page. The other filters sit in popovers labelled Status, User, and Person. Status is active, inactive, or all. User is no account, waiting, active, or disabled. On the LTF list, Person is everyone, club members, or LTF staff. On the club list, Person is the team filter, and it appears when the competition module is on. Each button shows how many filters in that group are narrowing the list. Reset filters returns them to the usual start and clears the row selection. A dashboard warning that opens the list with a license issue still filters that list. A short chip next to search can dismiss it.
- **Finance list filters** (#113): On the club and LTF finance orders, invoices, and payments lists, search stays on the page. Status opens as a popover, labelled Status. On the club lists, Accounting opens the same way. Each button shows how many filters in that group are on. Reset filters returns them to all. Those six lists do not tick rows, so there is no selection to keep.

### Fixed
- **Invoice emails** (#112): The amount in the email is the same total as on the PDF, including a license invoice that is mailed in the same step that records the payment. A paid invoice says the amount paid. An invoice that is not paid says the amount due. The same words are used in English, French, German, and Luxembourgish.
- **After card checkout:** Pay now opens card checkout. On the success page and the cancel page, the button returns to the desk you left: club, LTF, finance, or member.
- **License settings** (#65): Saving “Allow next-year preorder”, its month and day window, or “Email the club before this license expires” keeps those choices. Opening the type again shows the saved policy.
- **Renewal migration** (#71): Deploy can finish migrate when a club already has a module switched on. The renewal migration is schema only. Grandfather rows are inserted in the following migration, and running it again does not add a second row.
- **Authenticator setup** (#80, #84): A correct authenticator code is accepted. The setup key is created once and reused until it is confirmed, or until a new key is requested. When the visit is older than five minutes, the panel asks for the password and then confirms the same key. Starting a replacement leaves the old authenticator and the old recovery codes valid until a code from the new key is accepted. Cancelling or a wrong code leaves the old setup in place. Sign-in accepts a username or an email. A recovery code can be typed in the same box as the authenticator code, and each code works once. After one is used, a notice says how many are left.
- **Two-step sign-in** (#81, #82, #83): A staff desk that still needs an authenticator shows an info notice, with the days left during the grace period, and a button to set it up. The raw status code is not shown. Choosing another desk stores it and opens that desk. Finance and Admin are separate desks, so a switch leaves the page. Turning two-step sign-in on is allowed on a view-only desk. A real edit of desk data on that desk is still refused. When the code is accepted, the recovery codes stay on screen until they are saved. The window then says two-step sign-in is on. Reduced motion skips the celebration and keeps the message. The same moment is used for a passkey.
- **View-only desks** (#86): A view-only desk can load the same lists as a full grant on that desk. Text can still be copied. Selects, switches, uploads, save, delete, and import stay off. The tooltip is “View only on this desk”. A person with no grant for a desk is refused.
- **List selection** (#88, #107): On the club members list, club licenses, LTF licenses, and the LTF clubs list, a tick applies to the rows you choose. Search, filters, and pages leave that selection in place until you clear it or finish the bulk action. The screen shows how many are selected, including rows that are not on the current page. The order screen lists every name that will be included before the order is created. The same persistence is on eight lists: club and LTF members, club and LTF licenses, LTF clubs, ops users, parked members, and club billing (#107).
- **Module bundles** (#108): Under Already on, a bundle appears only when that bundle itself was bought. A bundle that merely contains a module already on stays in the chooser, unavailable, with a note such as “Competition is already on”. It does not copy that module’s end date, and it still cannot be ordered. A minimum on a flat price is hidden when it is not higher than the flat price. The amount charged is unchanged.
- **Rows per page** (#102): 50 and 150 stay one request. 300 and All are built from server pages of 200, so those choices show that many rows. Changing the size, or a filter, returns the list to page 1 before the request is sent. On a view-only desk the rows-per-page control stays open, because it does not change records. The same control is fixed on sixteen lists: club members, licenses, orders, payments, invoices, expenses, and income; LTF members, licenses, and clubs; and LTF finance orders, payments, invoices, expenses, income, and the audit log.
- **Create account** (#104): The confirm step says what will be created, who is skipped, and that no email is sent. It does not open with the ops file warning. After the accounts exist, the CSV still downloads and the PDF button stays. A shorter warning sits with that download: the file holds the first-login links, anyone with the file can use a link until it expires, and the file should be deleted afterwards. Linking a login does not produce a file, so that step has no file warning. The ops download of first-login and reset links keeps its own warning (#92).
- **Stripe webhook and paid checkout** (#106): A webhook is still refused when the signature does not match. After a valid signature, the event is read with `to_dict()`, because current stripe-python does not allow `event.get`. Confirming a checkout finds the order from an HMAC of the session id. The session id stays encrypted. `licenses.0058_order_stripe_session_lookup` adds that column, and `licenses.0059_backfill_stripe_session_lookup` fills existing rows. A person who cannot confirm the order is refused before Stripe is called. An order that is already paid does not call Stripe again.
- **Subsidy officials** (#106): An extraordinary official must be an adult with a license for that subsidy year. Saving a person who has no license for the year is refused, so the saved officials are the ones the dossier shows. The people list stays the licensed members for the year. A licensed child is still left off the official list.
- **Ops desk switcher** (#109): Ops console in the header now selects the Ops desk. The desk list shows Ops as the current desk, and choosing a club, LTF, or finance desk opens that desk. A click on the desk you just left is no longer ignored. Open federation dashboard stays only when the desk list cannot open that dashboard.
- **Deleted accounts** (#111): Deleting a user from the Django admin, or any other delete of that user, removes that person's own addresses, the same way self-delete does. A guardian's address, another person's address, and the text already stored on an invoice stay.
- **Office desks follow the login** (#115): Linking a login to a member who already holds a federation office opens the desks that office is mapped to. Changing or clearing that login moves or closes those desks. The same happens for a committee contact. A parked import still receives no desk. An inactive member still receives the desks the map allows. An ended grant for that term is reused, so the one-row rule is not tripped. `accounts.0013_resync_office_grants` fills grants for open federation terms that already have a login. Deploying runs it.
- **Edit office** (#116): Opening an existing office shows the current holder in the Person field, family name then given name, including when that person is not on the first page of the list. Saving without a change keeps that holder. Choosing someone else still replaces them. A new office still starts on “Choose a member.” The federation committee and the club committee use the same panel.
- **Redis task queue** (#117): Queueing a card-payment notice or a licence-card print job needs the `packaging` package. The backend requirements now install Celery’s Redis extra, which brings that package in. Rebuilding the backend image picks it up. Until that image is rebuilt, those two queues can fail as soon as they are asked to run.

### Security
- **Staff second factor** (#77): LTF Finance, LTF Admin, Club Admin, and Ops ask for a second factor. The factor is an authenticator app plus recovery codes. A passkey counts as that factor. There is no SMS. An email code is optional for members, coaches, and parents, and it is refused for every staff desk. People who already held a staff desk have 14 days to enrol. During those days the desk opens and a notice asks them to set it up. After that, the desk stays closed until they enrol. A staff desk granted after this release has no grace. A superuser can extend that grace once, from Ops users, and can reset an authenticator without removing passkeys. Sign-in tokens already in browsers keep working for 30 days from this release, then they stop. Signing out ends them sooner.
- **Who may approve and who may pay** (#78): An LTF Admin cannot change module purchases for their own club. The person who created an invoice cannot record its payment. A superuser can record an exception, per club for at most 90 days, or for one invoice. A read-only desk cannot write, so it does not count as approving or paying. Every map change, grant, link, exception, and refused override is audited.
- **Merge and login links** (#79, #92): Opening a merge preview and confirming the merge both require the superuser’s second factor. A password, or the grace period, is not enough. Downloading first-login or reset links does not enrol, remove, or extend two-factor authentication. Only a superuser on the ops desk can download that file. A read-only ops grant is refused. The audit row records the counts and the user ids, not the URLs.

### Technical
- `ClubFeeType.module_id` and module price rows (`pricing_type`, `minimum_amount`) are migration `licenses.0048_module_fees`. An active member is a member of the club with an active or pending license for the billing year (`licenses.module_fees.active_member_count`). A per-member invoice line stores that count and says when the minimum fee applied. `GET /api/clubs/{id}/module-fees/` is readable by that club's admin without any module switched on. Only LTF Finance can change the prices.
- `DELETE /api/print-jobs/{id}/` removes a draft, succeeded, failed, or cancelled print job, its items, and its PDF. A queued or running job stays until it is cancelled. A club admin can delete only that club’s jobs. Members, Clubs, and Licenses list menus are popovers (`@radix-ui/react-popover`).
- `CoachPayRate` and `CoachOuting` are migration `clubmgmt.0023_coach_pay`. `GET /api/club-management/training/coach-hours/` adds units for everyone and euro amounts for a club admin. Rates are saved and removed at `training/coach-pay-rates/`. Tournament, fuel, and hotel rows are created, updated, and removed at `training/coach-outings/`.
- Event visibility adds `shared` and `presidents`. `Event.audience_clubs` is migration `events.0002_event_audiences`. Kind `calendar`, `kyorugi`, and `poomsae` can be saved. A federation or club calendar includes shared dates, and a club calendar includes presidents meetings for that club. Each row is then hidden unless that person may see it.
- `EventAttention` is migration `events.0003_event_attention`. `GET /api/events/summary/` returns the next two months. Opening an event marks it seen. A club admin saves, snoozes, and dismisses a reminder at `/api/events/{id}/reminder/`, `reminder-snooze/`, and `reminder-dismiss/`. Due reminders are `GET /api/events/reminders/`.
- The API root redirects to the frontend. Demo seeding gives each demo club its own admin, starts only when `DEMO_MODE` is set, and leaves non-demo rows alone.
- Luxembourg street lookup reads the CACLR cache. `python manage.py refresh_lu_addresses` fills it. The monthly task `clubmgmt.tasks.refresh_luxembourg_addresses` runs on the morning of the 6th. An empty cache falls back to the previous lookup.
- Card checkout stores a same-origin dashboard path before the redirect. The confirm response also returns `return_area` (`club`, `ltf`, `ltf-finance`, `member`, or `ops`). The button uses the stored path first.
- License validity is `licenses.0051_license_validity`. It adds the policy columns and `expiry_locked`, marks existing licenses locked, and does not change their start or end dates. `PATCH /api/club-fee-types/{id}/` accepts the same fields as create, including a new amount (#67).
- Training venues are `clubmgmt.0038_trainingseries_venue` and `clubmgmt.0039_trainingsession_venue`. `place` stays text. Saving a venue stores the id and copies the name into `place`. Deleting the venue clears the link and leaves the last name (#64).
- Module bundles, purchases, and renewals are `licenses.0052_module_bundles`, `licenses.0053_module_purchases`, `licenses.0054_module_renewals`, and `licenses.0055_legacy_module_purchases`. `0054` is schema only. Grandfather rows are inserted in `0055_legacy_module_purchases`. Overrides and their audit table are `licenses.0055_module_purchase_overrides` (#68–#73). The renewal task runs at 06:10 Europe/Luxembourg.
- Desk grants are `accounts.0005_desk_grants` and the backfill `accounts.0006_legacy_desk_grants`. The second factor, the ship date, and the grace rows are `accounts.0007_mfa_policy` and `accounts.0008_mfa_grace_rows`. Office maps are `accounts.0009_office_desk_map` and `accounts.0010_seed_office_map`. Linking a committee contact to a login is `clubmgmt.0040_person_user`. Duty exceptions are `licenses.0056_duty_exception` (#75, #77, #78). Merging logins adds no migration (#79).
- Ops login-link files use `accounts.0011_user_password_reset_generation` (#92). Member logins reuse the existing 7-day single-use first-login link and add no migration (#96). The Expires column sorts on the existing `end_date`. A write of that date is ignored (#89).
- French and German are locales in the frontend menu and in `LANGUAGES` for emails and PDFs. A club language outside en, fr, de, and lb is stored as English.
- Choice-only migrations (#101). `accounts.0012_officedeskmap_choices` records the desk and level choices on the office map. `licenses.0057_duty_rule_choices_and_reminder_default` records the duty-rule choices and points the reminder default at `licenses.models.default_reminder_offsets`, which is still 60, 30, and 7 days. Both migrations print `(no-op)` from `sqlmigrate`. The columns stay `varchar(20)`, `varchar(32)`, and `jsonb`. Stored rows are unchanged. The same change cleared the frontend lint that was failing the release check. Those edits call the same updates from a nested function so the React compiler rule is satisfied. What the screens do is unchanged.
- Checkout session lookup is `licenses.0058_order_stripe_session_lookup` and the backfill `licenses.0059_backfill_stripe_session_lookup` (#106). The column stores an HMAC of the session id. The encrypted session id is unchanged. The backend suite for this version passes with 0 failures and 0 errors.

### Documentation
- The manuals in `docs/user-manual/` (#114) are the 0.13.0 edition, in English, French, German, and Luxembourgish. They now also describe desks, the authenticator, the language menu, member-list filters and row selection, the Expires column, member logins, module bundles, and training venues. No new screenshots.
- Public notes for this version, ready to paste into a GitHub release: `docs/releases/v0.13.0.md`. They cover every pull request merged into `develop` from #64 through #116 (#99 recorded these notes). #100 is the open release pull request into `main`. It is not a separate change.


## [0.12.0] - 2026-10-02

### User-facing
- **Billing is the invoice desk:** Membership invoices are issued from Billing. A row opens that household’s invoice page. A bill of 0,00 is issued and marked paid, as proof of membership, and no payment is recorded. Households already confirmed for that year stay closed. Family cards keep who is in the family and who receives the bill. They no longer create the invoice.
- **Family invoice page:** The family invoice preview is its own page, so the year, the billing, and Create invoice stay on the screen. Family cards start collapsed and show the member count. Open a card to edit members and who receives the bill.
- **Family rebates:** A rebate can apply to every following member, until a later rank has its own rule. Without that tick, a rank with no rule still pays full price. A rebate can be removed from the member-rank table.
- **Fees:** On Club fees, entry fields clear after a successful save. A saved license fee is shown as its name and amount, and a pencil opens the editor. Edit is a pencil and Remove is a trash icon on membership fees, billings, and family rebates. The license fee has no remove button.
- **Several membership billings a year:** On Club fees, a club can define the billings for a year in advance. Each billing charges the membership amount again. With no extra billings, the year stays one bill. On Billing, and on a family invoice, a billing picker appears when the year has more than one.
- **License fee:** Club fees has a license fee with a price history. It is added once per member, on the billing chosen for that year. On Club fees, a year with more than one billing has a License fee billing list. Until another billing is chosen, the fee stays on the first billing of the year. Family rebates do not reduce it. Every member pays it unless Pays the license fee is cleared. That box is on by default, on the club record, on Billing, and on the household invoice. A member whose membership amount is 0,00 still pays it, so that bill is not complimentary. Clearing the box on a 0,00 membership makes the household total 0,00, and that invoice is marked paid. 0,00 means no license fee. A bill that was already issued is left as it is. A member who joins after the chosen billing has started pays the fee on the next bill.
- **Club member invoices:** Invoices a club sends to its own members use the club letterhead. Footer logos, left to right, are World Taekwondo, European Taekwondo Union, and Luxembourg Taekwondo Federation. Federation license invoices keep the federation letterhead.
- **Family rebate on the line:** A zero family rebate is left off. A percent or a euro amount still prints in parentheses.
- **Invoice total:** The euro sign in the Total column has 2 mm of room on the right.
- **Family bills:** People in a family share one club invoice. The family card chooses who receives it: a family member, or a parent or guardian. If nobody is chosen and someone is 18 or older, the first adult receives it. If every member is under 18 and no recipient is set, that family cannot be invoiced until someone is chosen. Parents and guardians are entered on the family card or on a minor’s club record, and they become contacts. The name and address printed on an invoice stay as they were when it was issued.
- **Club billing:** A family row shows an invoice number only when one invoice covers every current member, and the amount is that invoice’s total. Members who were billed separately keep their own invoices. The family price is not labelled with one of those numbers.
- **Sidebar:** Links are grouped under a small italic module title. On a wide screen the sidebar can collapse to icons, and this browser remembers that choice.
- **Buttons and fields:** Primary buttons are white with a cyan edge, and they fill cyan when the pointer is over them. Links and buttons use a hand pointer. Entry fields are white. Placeholder text is light grey.
- **Club record:** Adding a contact includes Spouse in the relation list.
- **Publication consent:** On a member’s club record, Select all and Clear selection tick or clear every publication box. Those boxes are still saved with the record. Club settings has a Publication consent tab for active members, with last name, first name, date of birth, age, and a tick for each channel. The ticks save immediately. A tick in the column header sets that channel for every active member. The list exports as CSV, Excel, and PDF. The PDF uses the club invoice letterhead and the World Taekwondo, European Taekwondo Union, and Luxembourg Taekwondo Federation footer. The PDF can list every active member, members allowed on the chosen channels, members not allowed on every chosen channel, or members missing consent on at least one chosen channel. CSV and Excel include every active member.
- **Promotion and members:** On the promotion rules table, Edit is a pencil and Remove is a trash icon. The members list uses the same trash icon, and it still opens that member’s delete page.
- **Club website:** Club settings has a Website field under the club email. It is printed under the email on invoices the club sends to its members. An address without `http://` or `https://` is stored with `https://`. An empty website prints nothing. Federation invoices keep the federation website.
- **LTF license invoices:** The Order column in the footer reads Order, Placed, Delivered, and Status. The Invoice column stays Invoice, Issued, Paid, and Status.
- **Membership fees:** On Club fees, each fee can be renamed or have its current amount corrected, and it can be deleted. Deleting a fee returns assigned members to the club default. Invoices already issued stay as they are. A later price still uses Save new amount.
- **Product codes:** A new server creates its own signing key and can mint codes from Ops → Modules. Paste the `LTF1.…` code, not the install id. The install id is only the label this server is bound to.

### Technical
- `FamilyRebateRule.applies_to_later` is migration `clubmgmt.0019_family_rebate_applies_to_later`. An exact rank still wins. A later rank with no rule uses the nearest earlier rule only when that rule applies to following members.
- Membership billings are `MembershipBilling` rows (`clubmgmt.0018_membership_billings_and_license_fee`). A year with none is billing 1. The first extra billing creates sequences 1 and 2. `OrderItem.billing_installment` (`licenses.0046_orderitem_billing_installment`) is null on older lines; null and 1 are the same billing. A later billing can be issued after the first.
- The license fee is `ClubLicenseFee` plus `ClubLicenseFeePrice`, resolved like a membership price as of 31 December of the invoice year. The line is stored with `is_license_fee` and is not passed through family rebate rules. The printed text is `{name} {year} — First Last`, with no rebate note. `MembershipYearConfirmation` is unique per club, year, installment, and household.
- `MemberRecord.pays_license_fee` is migration `clubmgmt.0020_member_pays_license_fee`, default true. A member with no club record still pays. `POST /api/club-management/billing/member-license-fee/` sets the flag. The pencil on the license-fee card uses the existing license-fee update.
- `MembershipBilling.charges_license_fee` is migration `clubmgmt.0022_license_fee_billing`. The first billing of each existing year is marked. `PATCH /api/club-management/billings/{id}/` with `charges_license_fee: true` moves the fee to that billing for the year. Billings before it do not include the fee. The same late-joiner rule applies from the chosen billing onward. Deleting the chosen billing marks the earliest remaining billing.
- `MemberContact.relation` accepts `spouse` (`clubmgmt.0021_membercontact_spouse`). Spouse is a contact relation, not a parent or guardian.
- Club member PDFs use `finance/club_member_invoice_pdf.html`. Federation license invoices still use `finance/ltf_license_invoice_pdf.html`.
- `Club.website` is migration `clubs.0011_club_website`. `normalize_club_website` accepts only `http` and `https`.
- A family has either `invoice_member` or `bill_to_person`. Issued invoices store `bill_to_name`, `bill_to_email`, and `bill_to_address` (`clubmgmt.0017_family_bill_to_and_primary_contact`, `licenses.0045_invoice_bill_to_snapshot`). The order stays linked to a family member.
- Club billing treats an invoice as the family invoice only when every current member’s name is on that invoice’s lines.
- `clubmgmt.0005` settles old zero-euro membership invoices with SQL against the columns that exist at that step. It no longer loads the current invoice model, which includes `bill_to_name` from `licenses.0045`. Databases that already applied `0005` do not run it again.
- `PATCH /api/club-management/membership-fees/{id}/` updates the fee name. A changed amount updates the latest price row and `MembershipFee.amount`. `DELETE` removes the fee. Assigned member records are set back to no fee (`on_delete=SET_NULL`).
- `ensure_module_keys` runs after migrate. When `MODULE_CODE_PUBLIC_KEY` and `MODULE_CODE_PRIVATE_KEY` are unset, it stores one Ed25519 keypair on `InstallIdentity` and does not rotate it later. A database backup keeps that key. The private key is not printed and is hidden in the Django admin.
- Opening Ops → Modules creates the same key if startup did not. Superusers can mint when this install holds the private key, including when `DJANGO_DEBUG` is false.
- `MODULE_CODE_PUBLIC_KEY` alone means an outside issuer signs codes. This server verifies them and does not mint. `MODULE_CODE_PRIVATE_KEY` still overrides the database key.
- Pasting the install id into Redeem code returns “That is the install id. Paste a product code that starts with LTF1.”

## [0.11.0] - 2026-09-27

### User-facing
- **LTF license invoices:** Federation license invoices follow the OnlyOffice letterhead. Columns are Name, License, License ID, Qty, Unit, and Subtotal. An Annual Standard license is printed as Annual St plus the year. SEPA and WERO codes sit in the blue address mark. The English closing block is 17.5 cm wide and is printed only on the last page.
- **Family rebates:** On Fees, Edit opens that rebate in a row underneath it. The card above the table only adds a new rule. A rebate can be a percent or a fixed amount off that family member’s fee.
- **Qualité+ coaches:** On Club settings, Coaches, each coach has a Qualité+ tick. Unticked coaches stay on the timetable and in coach hours, and they are left out of the subsidy file, the countersigned trainers list, and the training list.
- **Qualité+ training list:** Landscape weekly grid. Columns are only the weekdays the club actually trains. The earlier letterhead, date, and president line stay. A small footnote says the president or a delegated committee member certifies the information.
- **Qualité+ trainers list:** The earlier letterhead and president block stay. The table has no signature column per coach. The same small certification footnote is printed.
- **Training:** Club management has a Training section. A weekly class can be kids, adults, belt-test preparation, competition preparation, or other, with start and end times. Generating the season skips Luxembourg public holidays and school holidays when the class says so. An extra class can still be added on one of those days. The roll starts with the usual students. Further students are ticked in a list and added together, and an age filter only shortens the list. Classes, this week, holidays, and coach hours use the same tables, search, and filters as Members and Licenses. The schedule also has a month calendar and a year overview. Promotion is its own sidebar page. It lists who has enough training hours for the next grade and records a pass on the member. Every active member can attend every class. Coach hours are kept between paydays. A club can pay every month, every quarter, or twice a year. Pay amounts and belt-test hour rules come later.
- **Club shop:** The in-club shop is part of Club management. It is not a separate product. Federation inventory remains a future install-wide product.
- **Shop stock:** Each size has its own purchase price, sale price, and QR sticker. Desk sales scan stickers with the phone camera.
- **Shop stickers:** QR stickers print on Avery Zweckform L7121-25 (45 × 45 mm, 20 per A4). Choose the first free label on a started sheet and apply the club printer offset.
- **Shop desk:** Tabs are Sell, Items, and Sales. New goods go on the shelf when you save. A later delivery uses Goods arrived. Each size shows how many are left.
- **Member from a contact:** Making a contact into a member assigns an LTF license ID. Paying for a license does the same when the member still has none. A contact whose name matches one club member is linked to that member and shows Open member instead of Make this person a member.
- **Club settings:** Club admins can appoint and remove coaches. A coach can sign in for that club and is not a club admin. In Luxembourgish the same role is labelled Trainer.
- **Subsidies:** Finance has a Subsidies section for the yearly MyGuichet checklist, coach qualifications, the under-16 export, and filled extraordinary grant forms. Coaches can download a countersigned trainers list for the subsidy year, with grade, qualification, and signature lines. The youth export is also an Excel file with the MyGuichet headcount page (male, female, and total by age and license type) and the under-16 name list. Coach qualifications and the under-16 list use the same tables as the rest of the club screens. Diploma scans and the RIB are added with upload buttons. Diploma scans and the RIB can be kept with the year. A paid subsidy is written into club income when a committee officer opens the page. Extraordinary requests can be edited, removed, and moved from the preliminary request to the final account. The filled forms include the travel mode, athlete names, place, and entry, medical, and supply costs.

### Technical
- `docker-compose.yml`: removed host source bind mounts (`./backend`, frontend messages, `.cursor`) from backend, worker, and beat so Coolify/VPS image builds are not overlaid. Message catalogs are copied into the backend image at `/app/i18n_frontend`. Named data volumes are unchanged.
- Removed `inventory_club` from `MODULE_SPECS`. Codes that still list it grant `club_management`. Migration `modules.0002_absorb_inventory_club` rewrites leftover entitlements and assignments.
- Shop variants store `sale_price` and `cost_price` (`clubmgmt.0007_shop_variant_prices`). Club admins enter purchase cost on stock. Phone camera scans sticker QR codes at the desk.

## [0.10.0] - 2026-09-11

### User-facing
- **Event calendar:** Federation and club calendars on one Event engine (`/{locale}/dashboard/ltf/calendar`, `/{locale}/dashboard/club/calendar`). Members see public dates when the module is entitled (`/{locale}/dashboard/member/calendar`).
- **Visibility:** Public, Internal, and Private now spell out who can see the event (members vs admins/coaches vs admins only). LTF Admin can always see club events.
- **Today:** The current day is a filled cyan date circle. The cyan cell border is only for the day you select.
- **Product codes:** Redeeming a code **adds** its modules. It does not turn off modules you already have.

### Technical
- New Django app `events`: `Event` (`kind` calendar now; kyorugi/poomsae reserved), migration `events.0001_event_engine`. `GET/POST /api/events/`.
- Module id `event_calendar` is shipped. Install entitlement unlocks the federation calendar; per-club assignment unlocks that club’s calendar. API 403 and hidden nav when locked.
- Date-only `from`/`to` query params no longer 500. Branch: `feature/module-event-calendar`.

## [0.9.0] - 2026-09-06

### User-facing
- **Modules:** Superusers unlock product modules with a signed **product code** on `/{locale}/dashboard/ops/modules`. Do not call this a software license; that word stays with member LTF licenses.
- **Two switches:** A code entitles modules for this install. Per-club modules (for example Preview) are then on or off per club. Locked modules are hidden in the nav and return API 403.
- **Preview prove-out:** A coming-soon Preview screen appears for LTF Admin when entitled, and for a Club Admin only when that club is assigned. Calendar, shop, and tournaments are not in this release.

### Technical
- New Django app `modules`: registry of stable ids (`preview`, `club_management`, `event_calendar`, `inventory_federation`, `inventory_club`, `tournament_kyorugi`, `tournament_poomsae`), `InstallIdentity`, `ProductCodeRedemption`, `InstallEntitlement`, `ClubModuleAssignment`; migration `modules.0001_module_entitlements`.
- Ed25519 product codes (`LTF1.…`), bound to install id, verified offline. The raw code is not stored. `GET /api/modules/`, `GET /api/modules/preview/`, `/api/ops/modules/**`.
- Debug mint on ops, or `python manage.py mint_module_code --modules preview`. Optional `MODULE_CODE_PUBLIC_KEY` / `MODULE_CODE_PRIVATE_KEY`; in `DJANGO_DEBUG` an install-local keypair is generated.
- Branch: `feature/module-entitlements`.

## [0.8.0] - 2026-09-04

### User-facing
- **Ops console:** Django superusers (`is_superuser`) sign in on the same frontend and land on `/{locale}/dashboard/ops`. Federation roles stay separate. The console shows who is signed in, dependency health, failed logins, lockouts, security alerts, users, a read-only query catalog, a screen-by-screen EN|LB translation editor, Celery/print/billing jobs, and an ops audit log.
- **Ops navigation:** Superusers get an **Ops console** button on federation dashboards and **Open federation dashboard** on ops. Sign out calls the logout API so the session disappears from “who is signed in.”
- **Club admins:** Club Admins can add other admins for their clubs on a rubber-band board (`/{locale}/dashboard/club/admins`). A member can only become admin of the club they belong to. The header club dropdown is hidden on that page; click a club in **Your clubs** to list its members. Coaches do not see this screen. A club must keep at least one admin.

### Technical
- New Django app `ops`: `AuthEvent`, `AuthTokenMeta`, `SecurityAlert`, `TranslationOverride`, `OpsAuditLog`; migration `ops.0001_ops_console`.
- `/api/ops/**` is gated on `IsSuperuser`. Login records success/failure, lockout (10 failures / 15 minutes), and token last-used. `GET /api/i18n/{locale}/` serves bundled messages plus overrides.
- Club Admin may call `admin_assignment`, `add_admin`, and `remove_admin` for clubs they administer, with `require_home_club` and `prevent_last_admin`.
- `docker-compose.yml`: backend, worker, and beat share image `ltf-license-manager-backend`; frontend messages are mounted read-only for the translation editor; `INTERNAL_API_URL` for server-side i18n fetch.

## [0.7.0] - 2026-09-03

### User-facing
- **Club fees:** LTF Finance Settings has a Club fees catalog (name, cadence, amount) and a Billing tab. Finance can invoice active clubs for those fees once, or on a monthly/annual schedule. Club fees are not licenses; paying a club-fee invoice does not create or activate a license.
- **Club status and language:** LTF Finance and LTF Admin can mark a club Active or Inactive. Inactive clubs are not billed. Clubs can set communication language (English or Luxembourgish) for emails.
- **Member pages:** Club and LTF member detail use a tab bar (Overview, Current license, Licenses history, Grades, Club movements).
- **Finance Settings:** Sidebar label is Settings, with tabs for License types, License prices, Club fees, and Billing.
- **Action messages:** Success and error toasts slide in from the top-right so they stay on screen when you are scrolled down.
- **LTF Finance club filter:** After login, Orders, Invoices, and Payments start on **All clubs**.
- **Audit log:** The list shows date, action, and message. Click a row to open a detail page with names, order/invoice links, and readable extra details (no raw IDs).
- **Buttons:** Everyday actions (Save, Create invoice, Add price) use a quiet gray fill. Brand cyan is for Sign in, Pay now, Record payment, and page-level Create.

### Technical
- `ClubFeeType`, `ClubFeePrice`, `ClubFeeBillingSchedule`; migrations `licenses.0034_club_fee_types`, `licenses.0035_club_fee_billing`.
- `Club.is_active`, `Club.communication_language`; migration `clubs.0009_club_active_and_language`.
- `POST /api/club-fee-billings/`, Celery `run_club_fee_billing_schedules`.
- `apply_payment_and_activate` skips order items without a license.
- Finance audit logs expose display names (`actor_name`, `club_name`, `order_number`, `metadata_display`).
- `ActionNotices` / `FloatingNotice`; Button `default` uses `--default`, `primary` is brand cyan.

## [0.6.4] - 2026-08-28

### User-facing
- **Club movement history:** Completed club changes stay with the member. LTF Admins can review frequent movers and clubs with high incoming or outgoing traffic. Members who reach the configured number of completed club changes are flagged as potential club tourists only; they are not restricted.
- **Club-tourist threshold:** LTF Settings controls how many completed club changes trigger the flag (default 3).
- **Order and invoice line items:** Member names on club and LTF Finance order/invoice details come from the license, so transferred members no longer show as Unknown member.

### Technical
- `FederationProfile.club_tourist_transfer_threshold` (migration `0008`).
- `GET /api/member-transfers/movements/` and `GET /api/members/{id}/club-transfers/`.
- Order items include `member_id`, `member_first_name`, `member_last_name`, and `member_ltf_licenseid`.

## [0.6.3] - 2026-08-28

### User-facing
- **Member import:** SimplyCompete `Membership End Date` is an optional helper column. It is not stored. When present, preview can skip members or import them as Active/Inactive by year.
- **License issue date:** Newly activated licenses (including those issued by an LTF admin) now get an issue date. Existing active licenses without one are backfilled.
- **Card preview:** If a member has no profile photo, the club logo is used as a faded photo fallback. Empty photo slots no longer show a dashed “No image” box. Card titles wrap more reliably on iPhone.

### Technical
- Import detects the helper header automatically (`detect_membership_end_date_header`) and does not map it as a member field.
- `License.save()` sets `issued_at` when status becomes ACTIVE; migration `0033_backfill_license_issued_at`.
- Club-logo photo fallback uses contain, light grey background, and 40% opacity. Card simulation sets `-webkit-text-size-adjust: none`.

## [0.6.2] - 2026-08-27

### User-facing
- **License card on member pages:** Club and LTF member Current licenses show the published Standard 3C card (print-accurate, sharp on 1× and retina) above the license table.
- **License roles:** Primary and secondary roles are stored capitalized (`Athlete`, `Coach`, …). Import still accepts mixed CSV casing (`athlete`, `ATHLETE`) and saves the capitalized value.

### Technical
- `GET /api/members/{id}/license-card-preview/` returns the published template simulation for the member's current license.
- Member card preview scales the millimetre canvas to the iframe (no 72/96 letterbox, no CSS-scaled iframe).
- `Member.canonicalize_license_role()` plus migration `0015_capitalize_member_license_roles`.

## [0.6.1] - 2026-08-25

### User-facing
- **Member transfers:** Club Admins can request a member move to another club (rubber-band). The receiving club must accept. Optional fee (0 is free). Club-to-club messages on the request. Active or pending licenses move with the member.
- **Transfer notice:** The receiving Club Admin sees an in-app notice on login, and **Review transfers** scrolls to Requests and messages.
- **First password:** The welcome/reset link prefills the username so a password manager can save both fields. Login is prefilled after Continue to login.
- **LTF:** Pending transfers with a fee appear on the LTF Transfers page and in the overview action queue.

### Technical
- `MemberTransfer` / `MemberTransferMessage` and `/api/member-transfers/`.
- Set-password URL includes `username=` for autocomplete.

## [0.6.0] - 2026-08-25

### User-facing
- **Club admins:** LTF Admin assigns club admins on a search-first board (pick a club or a member, then connect them). The Admins tab on the club detail page is gone.
- **Club email:** Each club can store an email. Invoice mail goes there, or to the club admins if none is set.
- **Welcome email:** New club admins receive a username and a set-password link (Resend in production, Mailpit locally).
- **Lists:** LTF Members, Licenses, and LTF Finance orders, invoices, and payments use the same flattened list chrome as Club Members.
- **Card templates:** License card templates can be exported and imported. Print PDFs no longer draw bleed or slot guides.
- **Checkout return:** After Stripe payment, the success page confirms the session and activates licenses before **Go to dashboard**.
- **Record payment:** LTF Finance records a payment on a full page instead of a modal.
- **Fund inflows:** LTF Finance can record other income (subsidies, donations, sponsoring, grants) on an Income register.

### Technical
- `Club.email`, `notification_emails()`, and `/api/clubs/admin_assignment/` plus capped `/api/clubs/admin_assignment_members/`.
- Mailpit in Compose; Resend when `RESEND_API_KEY` is real, otherwise Django SMTP.
- Card template transfer (`ltkdf.card-template`) and authenticated logo previews on the LTF club page.
- Frontend: Next.js 16.3.2, React 19.2.8, Tailwind 4.3.3 lockfile refresh. CI matches Docker (Python 3.13, PostgreSQL 18, Node 22).
- Millimetre print precision is unchanged.

## [0.5.0] - 2026-08-20

### User-facing
- **LTF lists:** Club Members chrome (filters, toolbars, pagination, expandable tables) now applies across LTF Admin and LTF Finance lists and forms.
- **Pending licenses:** Pending licenses are shown as current licenses, with history, member badges, and clearer order-license copy.
- **License availability:** License types can show an availability countdown. Types that are not sold for a year (for example Annual Standard in 2026) are marked unavailable.
- **Finance books:** LTF Finance can record expenses, set a year opening, and open year-end books (income statement and a simplified balance sheet), with Excel export for annual meetings.
- **LTF ID prefix:** LTF Admin can rewrite `LUX-` to `LTF-` on the LTF license ID during member import, and bulk-update existing LTF IDs. WT IDs stay unchanged. Club admins are told whether the rewrite is on.
- **LTF ID length:** New LTF license IDs use 4 digits (for example `LTF-0001`) and grow automatically when the number needs more digits.
- **What's new:** Sidebar version link opens `/{locale}/about` with the user-facing history from 0.5.0 back to 0.1.0, plus a GitHub releases link.

### Technical
- Expense ledger (`ExpenseCategory`, `Expense`) and `FinanceYearOpening`; accrual P&L and cash/AR/AP snapshot in `licenses/finance_reports.py` (Excel via openpyxl).
- `FederationProfile.rewrite_lux_prefix_on_member_import` and `POST /api/members/ltf-license-prefix-rewrite/`.
- `format_ltf_license_id` / `_next_available_ltf_license_id` use a 4-digit minimum and skip serials already stored as 6-digit IDs.
- Frontend `APP_VERSION` / `APP_RELEASES` drive the about page (`en` + `lb`).

## [0.4.0] - 2026-08-17

### User-facing
- **Visual refresh:** Softer athletic-fintech chrome — brand cyan, canvas/card contrast, and a radius scale (12px controls, 18px cards, pill chips) instead of 2px sharp boxes.
- **App shell:** Role dashboards use a left sidebar with icons and a quiet sticky top bar (title, club switcher, user, language). Tab strips are gone.
- **Overview cards:** Tinted KPI tiles with icons, a clearer action queue, and bar breakdowns for license/invoice/order mixes.
- **Login and home:** Split branded login and a lighter marketing home. Public pages use a slim header.
- **Members filters:** Status filters are pill buttons with live counts (HeroUI RadioGroup removed).
- **Import confirm:** “Only rows with action set to create…” is a yellow notice, not an alert.
- **Import wizard:** Step back button now shows “Previous” instead of the raw key `Common.previousPage`.
- **Home:** A signed-in visit to `/{locale}` shows role-based navigation instead of the public Sign in landing.
- **Club Members:** Active status controls are green; inactive stays the previous neutral tone.
- **Profile photo:** Use camera opens the device webcam via the browser camera permission, then lets the user take a photo. Choose file still opens the file picker.
- **Member grades:** Belt rank is no longer a free-text field on member create/edit. Grades are changed only from the Grades section, using the official Kup/Poom/Dan dropdown. Custom values such as “DAN 1” no longer appear in that list. A selected grade promotion can now be deleted; the member’s current belt rank is updated to the latest remaining official grade.
- **Page loading:** Fetching dashboard page data now shows a brand spinner above the existing “loading” message.
- **Club header switcher:** Club Admin (and Coach) always see one of their assigned clubs in the header dropdown. A leftover or invalid stored club ID no longer leaves the field blank.
- **LTF club filter:** The header club dropdown is hidden on LTF Overview, License cards, Print jobs, License types, Printer profiles, and Settings. On the remaining LTF pages it filters the listed data, with an **All clubs** option. **All clubs** is the default on LTF Admin pages.
- **Club Members filters:** Status pills show the count next to the title (e.g. All 34) instead of a second line of text.
- **Club Members toolbar:** Members and Actions sit on the same row as pagination. Actions is disabled until a row is selected. The batch-action hint is behind an exclamation icon (hover or click).
- **Club Members table:** The row pencil was removed. Open a member by clicking the row, then edit from the detail page. The row still has delete.
- **Club Licenses:** Toolbar, status pills, pagination, and table styling now match Club Members. Actions stays disabled until a license is selected.
- **Club Orders and Invoices:** Filter card, status pills with counts, page-size options, and pagination now match Club Members / Licenses.
- **Club IBAN bank lookup:** Luxembourg IBANs now use the official 3-digit bank code, so older accounts (especially Spuerkeess numbers starting with 9) are no longer mistaken for POST.
- **Club and LTF Settings logos:** Upload starts with a drop well and preview. Purpose (General, Invoice, Print, Digital) is explained, the selected-logo checkbox is shown once, and uploaded logos are grouped by purpose with a larger preview and a delete confirm.
- **License card designer:** The LTF designer is now a full-height design workspace (no sidebar). Tools, canvas, and inspector stay on screen. Preview/print controls open as a panel. Built-in print fonts (Inter, Source Sans 3, Source Serif 4, IBM Plex Mono, Barlow Condensed) are seeded as embeddable TTF assets. Designer chrome uses the same light surface, border, and muted icon tokens as the rest of the app. The top bar is grouped into document / side / history / save clusters. Preview & print is a full-screen panel with a **Back to designer** button. Spaces can be typed normally in Text controls.
- **LTF Finance club filter:** The header club dropdown is hidden on Finance Overview, Audit log, and License settings. Orders, Invoices, and Payments keep it as a club filter, including **All clubs**.

### Technical
- Design tokens live in `ltf_theme.css` / `globals.css` (`--radius-control`, `--radius-card`, `--shadow-card`, type scale).
- Shared `AppShell` + `AppChrome`; Club / LTF / Finance / Member layouts are thin nav adapters.
- Removed `@heroui/react` (only RadioGroup + RouterProvider were in use).
- Grade promotions now validate against the official belt-rank list. `DELETE /api/members/{id}/grade-history/{history_id}/` removes a promotion (bypassing the append-only model guard) and resyncs `member.belt_rank`.
- Shared `Spinner` for page-data loading; `EmptyState` accepts `loading` to show it above the existing message.
- Club header selection now validates the stored club ID against clubs returned for the current user and falls back to the first assigned club.
- LTF Admin header club control is route-aware (hidden on federation-wide pages) and treats `null` as “All clubs” on filter pages.
- Luxembourg IBAN bank lookup uses the official 3-digit bank code first. Existing club and federation `bank_name` values are re-derived in `clubs.0005_rederive_luxembourg_bank_names`.
- Club and LTF Settings share `BrandingLogosManager` for logo upload, purpose grouping, and delete confirm.
- Card designer workspace chrome lives in `AppShell` `variant="workspace"`. Built-in print faces are seeded by `manage.py seed_card_print_fonts` from `licenses/print_fonts/*.ttf`. The millimetre render/PDF path is unchanged.

## [0.3.9] - 2026-03-28

### User-facing
- **HeroUI v3.0.1:** The dashboard shell adopts HeroUI v3 with the existing LTF theme tokens, giving a cleaner, more consistent control surface without changing protected print or designer flows.
- **Sticky top bar:** The main top bar stays visible while scrolling so navigation and context remain at hand on long pages.
- **Stable tab navigation:** Club / LTF / Finance dashboard tabs no longer reorder or swap labels when switching sections.
- **Club Members page overhaul:** Status filtering uses a horizontal **RadioGroup** card control with **live total counts** (All / Active / Inactive). **Members** and **Actions** menus are clearer; toggling a member’s active status from the table asks for **confirmation** before applying. **Rows per page** options are **50**, **150**, **300**, and **All** (capped by the API’s maximum page size). Touch targets and card radii follow the sharp theme (`--radius-card`) and ~44px minimum hit areas where this pass touched the UI.
- **Member Import Step 3 UX improvement:** Orange **Review** status for invalid or non-matching license roles, inline dropdowns to fix **primary** and **secondary** roles, empty `secondary_license_role` treated as valid, same-role validation with a clear error message, and a confirmation dialogue before applying role changes.

### Technical
- Frontend: `@heroui/react` v3.0.1 integration with `HeroUIProvider`, theme alignment to `ltf_theme.css`, and incremental UI consistency (radii, spacing, focus rings) on updated surfaces.
- Club Members: server-backed facet counts for filter subtitles; persisted filter preference in `sessionStorage` with migration from legacy dual-switch storage; pagination helper respects `API_PAGINATION_MAX_PAGE_SIZE` for numeric and “All” page sizes.
- Navigation: layout/tab state fixes to prevent label flicker or order changes across dashboard variants.
- Import: `row_overrides` support in the member import confirm flow so Step 3 role corrections are applied on final import.

## [0.3.6] - 2026-03-14

### User-facing
- **Printer profiles (user-owned):** Club Admins can select their own printer profile when creating quick-print jobs (members, licenses, and quick-print page) and have a dedicated **Printer profiles** nav link and CRUD page at **Dashboard (club) → Printer profiles**. LTF Admins can create, edit, and delete their own printer profiles at **Dashboard (LTF) → Printer profiles**. Offsets (X/Y mm) are applied only in the final PDF output; designer canvas and live simulation are unchanged.
- Fixed member photo uploads that previously failed with generic errors.
- Fixed cases where a photo saved successfully but did not display afterward.
- Improved upload failure messages, including clearer feedback for server and size-related failures.

### Technical
- Backend: PrinterProfile model with `created_by` ownership; owner-scoped list/retrieve/update/delete and create; print job creation accepts only the caller’s profiles. Render offset applied in final PDF path only (`_apply_printer_offset_to_pdf`).
- Frontend: Printer profile API helpers and selection in Club Admin quick-print flows; LTF Admin CRUD page at `/dashboard/ltf/printer-profiles` and Club Admin CRUD page at `/dashboard/club/printer-profiles` (nav link shown only for Club Admin role), with create/edit/delete modals.
- Hardened backend photo processing and storage flow to tolerate partial derivative write failures while preserving required processed image saves.
- Increased upload-size limits and made frontend multipart uploads size-aware by skipping oversized optional original files.
- Added authenticated API endpoints for processed and thumbnail profile images to avoid reliance on direct `/media` routing.
- Improved container startup permission handling for media, static, and Celery beat storage paths in Docker Compose deployments.

## [0.3.5] - 2026-03-11

### User-facing
- Finalized SVG logo rendering reliability so uploaded SVG assets now appear consistently in the designer simulation and generated PDFs.
- Preserved simulation/PDF visual parity for typography and element placement to match print output more closely.
- Added support for the `current_grade` merge field in card templates and preview/print rendering.
- Reconfirmed LP798 geometry precision (85.00 x 55.00 mm card canvas and exact sheet placement contract) after the recovery/fix cycle.

### Technical
- Hardened SVG data-URI normalization and render-path embedding across preview, simulation, and PDF generation.
- Stabilized simulation refresh behavior to avoid stale iframe payloads after image/source updates.
- Extended regression coverage for real uploaded SVG assets and merge-field rendering consistency.
- Completed patch-release readiness for Card v2.1 + recovery closure on `v0.3.5`.

## [0.3.4] - 2026-03-07

### User-facing
- Card v2.1 Recovery Step 4 final gate is complete and release-ready.
- LP798 geometry placement and multi-image asset behavior were revalidated end-to-end (including SVG assets).
- Designer ruler/snap controls and simulation/PDF parity remain stable after recovery fixes.

### Technical
- Added final recovery UAT report with full matrix coverage in `docs/license-card-v2-1-recovery-step4-uat.md` (`23 PASS`, `0 FAIL`).
- Re-ran backend card regression suite (`licenses.test_cards`), runtime preview/simulation/PDF assertions, and print execution/duplicate-guard checks.
- Refreshed release runbooks and project memory for patch release rollout (`README.md`, `PROJECT_CONTEXT.md`, `docs/license-card-rollout-rollback-checklists.md`).

## [0.3.3] - 2026-03-06

### User-facing
- Card v2.1 precision/stability closure is complete with exact LP798 geometry parity across preview and print.
- Multi-image card designs now resolve selected uploaded image assets reliably (including SVG) across simulation/PDF/print.
- Designer merge fields now include `primary_license_role` and `secondary_license_role`, with locked date formatting applied consistently.

### Technical
- Enforced deterministic simulation refresh behavior and validated simulation/PDF font-size parity in regression coverage.
- Added/extended runtime and backend regression checks for LP798 slot geometry, role/date merge context, and print pipeline stability.
- Fixed multipart asset upload activation defaults by forcing omitted `is_active` to `true` on create and sending explicit `is_active: true` from the designer upload flow.
- Finalized v2.1 UAT gate documentation and rollout checklist updates for release `v0.3.3`.

## [0.3.2] - 2026-03-05

### User-facing
- License Card Designer v2 stability gate passed after remediation sprint and full regression/UAT rerun.
- Publishing a draft now protects unsaved in-memory edits before publish.
- Asset library upload flow is stable for repeated file-picker usage.

### Technical
- Closed P1 findings from deep review: dual-side print selection, enqueue failure stranding, duplicate execution guard, and preview/print parity hardening.
- Added/expanded print pipeline and preview regression coverage in `licenses.test_cards`.
- Enforced and documented SVG sanitize-and-accept policy with strict stripping of dangerous constructs before storage/render.
- Finalized v0.3.2 rollout and rollback runbooks for production operations.
