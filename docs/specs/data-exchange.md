# Import and export of member and licence data

Status: spec only. No code until this spec is approved.

A club admin, an LTF admin, and a member need a way to take their data out and, for the admins, to bring a list back in. The data is members, licences, grade history, and the dated weight and height rows fighters already have. A club that uses the club management module also exchanges the lists that hang off a member: emails, phones, addresses, emergency contacts and guardians, families, clothing sizes, and medical notes. The tool is its own page, not a section buried in the club profile. The page shows only the groups that club's modules allow. Files stay on this server. Nothing is sent to a third party. Licence-card PDFs are not part of this tool and their output does not change.

## Where it lives

Recommend a sidebar entry named **Data**, with an icon and a text label, in the same nav group as Members.

Reasons:

- The club profile is a settings page. A mapping table, a preview of hundreds of rows, and a progress report do not fit there, and a member never opens the club profile.
- Members, licences, grades, measurements, and the club-management contact lists are one job. One page with two actions, Export and Import, is easier to find than a button on every list.
- The same page serves every role. What changes is which actions and which clubs are offered, not a different product in each profile.

The club settings page and the member overview may each show one text link, icon plus label, "Open data", that goes to this page. That link is a shortcut. The work happens on the Data page.

On a phone the page is a vertical wizard. On a desktop it is the same steps, with the preview as a table. A side panel is used only for a one-person export (the member's own file, or one row from a member page). That panel has one Close button, in the header. The full import never runs inside a side panel.

| Role | Export | Import | Scope |
| --- | --- | --- | --- |
| LTF admin | Members, licences, grade history | The same | One chosen club, or every club in one file with a club column. No club-management contacts, medical notes, families, or clothing. No weight, height, or gear |
| Club admin | Members, licences, grade history. When club management is on for this club: emails, phones, addresses, contacts, families, clothing, and medical notes if explicitly included. When competition is on: weight, height, and gear | The same sets | The club on the open desk only |
| Coach | Weight, height, and gear, for clubs where they already record them | None | That club, and only when the competition module is on. No contacts, no medical notes, no social security number |
| Member | Their own file, including the club-management lists that exist on their row | None | Their own member row |
| Parent of a minor | The child's file, from the child's member desk | None | The minor account. There is no parent role today. A guardian in the club file is a contact, not a login |
| LTF finance, read-only desk | Only lists they can already open. No contacts and no medical notes | None | A read-only download is written to the audit log, as today's read-only export already is |
| Ops | None in this tool | None | Ops keeps its own audit and user tools |

A club admin never sees another club. The server checks the desk club on every request. A file that names another club is rejected, not filtered quietly.

LTF admin does not gain weight and height rows in this spec. Those rows are stored for the club competition module, and LTF roles cannot read them today. That limit stays.

## What is already in the app

- Members, with `ltf_licenseid`, club, names, birth date, sex, belt, nationality codes, and the club-management record.
- Licences (`License`): member, club, type, year, dates, status. `expiry_locked` is left alone by import.
- Grade history (`GradePromotionHistory`): from grade, to grade, promotion date, exam date, notes. Rows are append-only. `delete()` is refused. A new row cannot be dated before the latest one.
- Weight and height tracking already exists. `BodyMeasurement` stores `measured_on`, `weight_kg` (two decimals, 10.00 to 150.00), `height_cm` (80 to 230), and a short note. Club admins and coaches record them when the competition module is on. The member API already exposes the latest weight and the latest height. No new measurement model is needed. This spec exports and imports the dated rows, not only the latest pair.
- Nationality and address country are ISO 3166-1 alpha-2 codes after #247. A saved name such as Luxembourg is already mapped to LU.
- Social security numbers exist on the club record, for LU, DE, FR, and BE. They are not printed on licence cards.
- A parked-member import already exists for people who cannot be placed in a club. This tool does not replace that path. A row this tool cannot match stays an error in the preview. It is not parked automatically.

### Club management, already in the app

These rows exist today. This spec does not add a table for them. Emails, phones, addresses, contacts, families, clothing, checkups, and the medical notes need the club management module. Gear and teams need the competition module. A club with neither module keeps the shorter file: members, licences, and grade history. Weight and height stay on the competition module, as they are today.

There is no separate parent table and no preferred-phone flag. A guardian is a contact. A phone is a free-text number plus a label.

| What the club keeps | Where it lives | How many | Flags already enforced |
| --- | --- | --- | --- |
| Club file on the member | `MemberRecord` | One | Invoice delivery (email, post, or in person), fee by name, nationalities, joined date, publication consents, medical notes |
| Emails | `MemberEmail` | Many | `use_for_invoice`, any number of rows, the app does not force a single invoice email |
| Phones | `MemberPhone` | Many | `label` is `mobile`, `home`, `work`, or `other`. No primary flag. The number is stored as typed, up to 40 characters. No country column |
| Addresses | `MemberAddress` | Many | At most one `use_for_invoice`. Country is an ISO code (default LU). Street, house number, line 2, postal code, locality |
| Contacts, including guardians and emergency contacts | `MemberContact` plus `Person` | Many people, one link per person per member | `relation` (father, mother, grandfather, grandmother, uncle, aunt, brother, sister, guardian, partner, spouse, other). `is_emergency` may be set on several. At most one `is_primary`. The same person can be the contact for two members |
| The contact's own emails, phones, and addresses | `PersonEmail`, `PersonPhone`, `PersonAddress` | Many on the person | Same invoice flag on the person's email and address. The person has a name and a sex, and no birth date |
| Notice address for a minor's login | `User.guardian_notice_email` | One | This is the address that receives account notices. It is not the contact list. A minor account has no parent login |
| Medical checkups | `MedicalCheckup` | Many | `checked_on`, optional `valid_until`, notes |
| Family | `Family` and `FamilyMember` | A member can be in a family | Family name, who is invoiced, sort order |
| Clothing sizes | `MemberClothingValue` | One label per club clothing item | The club's own item names. Import does not create new items in the catalog |
| Gear sizes | `MemberGear` | One row | Competition module only. Current sizes, no history |
| Teams | `ClubTeamMembership` | Many | Competition module. Export names the team. Import does not create a team |

Also linked to a member, and left out of the bulk import: shop sales, subsidies, invoices and payments, training attendance, committee mandates, transfers, and verification events. Those are finance, the calendar, or account security. The member's own download still lists the personal facts from them (attendance dates, team names, office titles, invoice number, date, amount, and status) so the portability file is complete. The club's bulk file does not move invoices, shop stock, or subsidies. Attendance and committee offices are export-only.

## Formats

| Format | Use | Re-import |
| --- | --- | --- |
| CSV | A zip of one UTF-8 table per list, comma by default inside each file | Yes |
| XLSX | One workbook, one sheet per list, linked by `member_ref` | Yes |
| JSON | A snapshot with members, people, and the child lists nested | Yes |
| PDF | A readable report, grouped under each member | No |

The PDF is a new WeasyPrint report. It is not a licence card and it does not change any card template.

### How nested rows are written

Every child row points at a member with `member_ref`. That value is the LTF licence id when the member has one. When they do not, the export assigns a file-local key such as `m-0007`, unique inside that file. The database id is never written. A child row whose `member_ref` matches no member row is an error.

A contact points at a person with `person_ref` (`p-0001`). The person is written once. Two children who share a mother share that `person_ref`, so the file cannot store two different phones for the same person. `person_ref` joins rows inside the file. Matching a person to one already in the club uses the name rules below, not this key.

JSON keeps one shape for a club file and for a member's own file:

- `members[]` holds the member fields, then `emails`, `phones`, `addresses`, `licences`, `grades`, `measurements`, `clothing`, and `contacts`.
- A contact holds `person_ref`, `relation`, `is_emergency`, and `is_primary`.
- `people[]` holds each person once, with their own `emails`, `phones`, and `addresses`.
- `families[]` holds the family name, who is invoiced (`member_ref` or `person_ref`), and the member refs in order.
- Keys that the module does not allow are absent, not empty shells.

XLSX is one workbook. The sheet name is the stable English key, so a French file still links. Row 1 is the translated column titles. Row 2 is the stable field key. Data starts on row 3. The sheets, when that part was included, are: `members`, `licences`, `grades`, `emails`, `phones`, `addresses`, `people`, `contacts`, `person_emails`, `person_phones`, `person_addresses`, `medical_checkups`, `families`, `family_members`, `clothing`, `measurements`, `gear`. Excel's 31-character sheet-name limit is respected by these keys.

CSV is one zip of those same tables, each a UTF-8 file named `emails.csv` and so on, plus `manifest.csv` listing each file, its key, and its row count. The manifest is not imported as member data.

CSV is a zip, not a single sheet with `email_1`, `email_2`, `contact_1_phone_1`. A member can have any number of emails, phones, addresses, and contacts, and each contact has the same lists again. Numbered columns either stop at an arbitrary count or make a header the mapping screen cannot show. They also cannot say "this email was removed" without a sentinel, and they copy a shared parent once per child. The zip has the same keys as the workbook. Someone who wants one file they can click opens the xlsx. The page calls the CSV choice **CSV tables (one zip)**.

The PDF is grouped, not a grid. Each member is a heading. Under it, short sections appear only when that section was included and has rows: Licences, Grades, Emails, Phones, Addresses, Contacts, Medical, Family, Clothing, Weight and height. A contact is a paragraph: name, relation, whether they are the emergency contact, whether they are the primary contact, then their phone, email, and address. The social security number stays masked unless the export explicitly included it. Medical notes appear only when that switch was on, or in the member's own file.

## Export

### Club or federation

1. The page opens on Export. A short line says which club is in scope.
2. Checkboxes, each with an icon and a label, in groups. A group the club's modules do not include is absent. A checkbox the role cannot use is absent, not disabled and greyed without an explanation.
   - Always, for a club admin and an LTF admin: Members, Licences, Grade history.
   - Club management on: Emails, phones, and addresses; Contacts (guardians and emergency contacts); Families; Clothing sizes.
   - Competition on: Weight and height; Gear.
   - A club with neither module sees the first group only. An LTF admin does not see the club-management group or the competition group, including when one club is selected.
3. Format: CSV, XLSX, JSON, or PDF. The PDF choice hides the "include social security numbers" control and the medical-notes control, except on the member's own file. A paper report for a committee stays masked and leaves medical notes out.
4. Social security numbers are off. A club admin or an LTF admin can turn them on. The control says the file will contain the full numbers and that the download is written to the audit log. A coach never sees this control. Medical notes and checkups are a second switch, off by default, shown only to a club admin when club management is on. Turning it on says the file will contain health notes and that the download is written to the audit log. Contacts include emergency contacts. There is no second list that strips the emergency flag while leaving the person in the file.
5. The button is **Download**, icon plus label. The file is built on the server. For more than about 500 rows the button becomes **Prepare file**, and the page shows a progress line until the file is ready, using the same waiting pattern as a print job. The file is not built in the browser.

The download name includes the club and the date, for example `example-club-members-2026-11-21.xlsx`. The examples in tests use fake clubs and fake people only.

### Member's own file

On the member overview, a button **Download my data**, icon plus label, opens a small panel. One Close button sits in the header. The panel offers JSON (the portability file) and PDF (a readable copy). CSV and XLSX are also offered, for the same facts. There is no column picker. The file contains the member's own row, their licences, their grade history, and their weight and height history when any exists. When the club uses club management, it also contains that member's emails, phones, addresses, contacts (with each person's own emails, phones, and addresses), family name, clothing sizes, medical notes, checkups, and the guardian notice email if the account is a minor. The social security number is included, because it is their data. Medical notes are included for the same reason, with no extra switch. The card photograph is not in the file. Profile photos are not copied into the file either. The file names the photo only as "a profile photo is stored" or "no profile photo", never the image bytes. Card pictures are never stored, so there is nothing to export. The same file adds the read-only extras named above (attendance dates, team names, office titles, invoice references) when those rows exist.

A minor account uses the same button. The page says, in the four languages, that this file is the child's data and that the parent who holds the account can download it here. There is no separate parent login today. A club admin can also produce this one-person file from the member page, for a parent who asks, and that action is audit-logged. The admin does not get a special parent role.

This is the Article 15 and Article 20 copy: the person can take their data in a structured file (JSON) and in a readable report (PDF).

## Import

Import is a wizard of six steps. The step titles are text, not only numbers. Back is allowed until the commit starts. After the commit starts, Back is gone and the page shows progress.

### 1. Choose the file

A template row offers **Download template** for CSV and for XLSX, in the language of the screen (en, fr, de, lb). The button is icon plus label. The template includes only the sheets that this club's modules and this role allow. A club without club management does not receive the contact sheets. Sheet names stay the stable English keys in every language. On each sheet, row 1 is the translated column titles and row 2 is the stable field key, so a translated header still maps. A CSV template puts the stable key in a comment on the header. The sample rows are fake: "EXAMPLE Ada", `ada@example.test`, `+352621000000`, a made-up street, a mother contact "EXAMPLE Noor", a made-up licence id, a grade, and a weight.

The upload control accepts `.csv`, `.xlsx`, `.json`, and a `.zip` of the CSV tables. Limit 5 MB and 5,000 data rows across every sheet. A larger file is refused before it is parsed, with a plain error. A workbook or zip that contains a sheet this club's modules do not allow is a warning, and that sheet is not imported. It is not a silent success and it is not a hard failure of the other sheets. The file is stored on this server, under a private path, and deleted after 72 hours or as soon as the job is finished and the result report has been downloaded, whichever is later. It is not sent anywhere else.

### 2. Map columns

The server reads the header and suggests a field for each column. Each sheet is mapped on its own. Auto-detect uses the stable key when the template has one, then the sheet name, then the header text in any of the four languages, then a small alias list (`dob`, `birth date`, `nom`, `grade`, `téléphone`, `notfall`). Each column is a row: source header, suggested field, and a select of target fields including **Ignore**. The person can change the suggestion. **Save this mapping** stores it for this club and this file shape (the sheet key plus the header set), named by the user. The next file with the same headers offers that mapping first. A federation-wide mapping is available to LTF admin only, and it cannot include the club-management sheets.

JSON skips this step. Its keys are the stable field names.

### 3. Check the rows

The preview lists every row. On a desktop it is a table. On a phone each row is a card. A row is one of: ok, warning, error. Errors use the error colour. Warnings and ok rows do not. The text of the problem is always present, not colour alone.

Examples of errors: missing last name, unknown grade, a weight above 150, a promotion date before the member's latest promotion, a licence whose member is in another club, an email cell with two addresses, a phone with no country and no `+` prefix, two invoice addresses for one member, a broken UTF-8 file. Examples of warnings: nationality written as "Luxembourg" (it will be stored as LU), an empty email, a phone label the list does not know, a possible duplicate.

Dates accept ISO `2026-11-21` and the day-month-year forms used in the four languages (`21/11/2026`, `21.11.2026`). A value that is ambiguous (`01/02/2026`) is a warning that names which date was assumed from the file's locale, and the preview shows the ISO date that will be stored. Numbers use a dot or a comma as the decimal mark. The stored weight always has two decimals. Excel serial dates are read as dates, not as raw numbers. The delimiter of a CSV is detected from the header line among comma, semicolon, and tab. Encoding is UTF-8. A file with a UTF-8 BOM is accepted. Any other encoding is an error that tells the person to save as UTF-8. The server does not guess Latin-1.

Nationality and country columns accept an ISO code or a name in en, fr, de, or lb. The preview shows the code that will be stored. An unknown name is an error. The value is not dropped and is not invented.

### 4. Duplicates

Match order, inside the club in scope:

1. `ltf_licenseid`, when the cell is filled.
2. Social security number plus its country, only when the importer is allowed to send numbers. The comparison uses the same country check the club record already uses. The audit log stores that a number was used to match, not the number itself.
3. Last name, first name, and date of birth, together.

A match suggests **Update**. No match suggests **Create**. The person can set the row to **Skip**. The choice is per row, with **Apply to all** for the suggested action. Two rows in the same file that match each other are errors until one is skipped.

When social security numbers are later encrypted with Fernet, matching uses the blind index, not a decrypted value written into the job log. This spec does not build that encryption. The match function is the only place that compares numbers, so the later change stays inside it.

### 5. Dry run

**Check without saving** runs the same rules as the commit and writes nothing. The result is the same preview, with counts: would create, would update, would skip, errors. Errors still block those rows.

### 6. Commit

**Import** is enabled only when at least one row is create or update and no remaining error is included. The job is one Celery task. It is atomic per batch: either every accepted row is saved, or none are, if the database work fails. A row that fails its own check inside the task, after the preview, is recorded in the result and does not roll back the rows already accepted, because the preview is the gate. The page shows progress: queued, running, and a count of rows done. The same waiting pattern as a print job. When it finishes, the result report lists created, updated, skipped, and any late errors. **Download result** offers CSV and JSON.

**Undo this import** is on the result. It is available for 72 hours. It restores the previous field values of updated rows and removes rows the batch created, when the model allows removal. Grade history is append-only, so promotions created by the batch are not deleted. The result says that plainly, before the commit, if the file contains grade rows. Weight and height rows, emails, phones, addresses, contact links, checkup rows, and clothing values created by the batch can be removed, because those rows are ordinary records. A replace that deleted existing children can be restored from the batch snapshot for the same 72 hours. A person created by the batch is removed on undo only when nothing else still points at them. Undo is itself audit-logged and can be used once.

### Nested club-management rows

This applies when the file includes emails, phones, addresses, contacts, families, clothing, or medical checkups. The member is matched first, by the order in step 4. Children then attach to that member. A child is never used to create a member on its own.

For each included collection the preview offers two choices, as a labelled radio group. The default is **Add and update**. **Replace the list** is the other choice. A sheet that is absent is left untouched under both choices. An empty sheet that is present, with **Replace the list**, clears that collection. The preview states the count it would remove and that collection stays blocked until the person confirms it.

**Add and update** matches a child and edits it in place. It does not delete a child the file left out.

| Collection | Match an existing row | Notes |
| --- | --- | --- |
| Email | The address, ignoring case | `use_for_invoice` updates in place |
| Phone | The E.164 number | The label updates in place. Two rows that become the same number are an error |
| Address | Country, postal code, locality, street, and house number | Line 2 updates in place and is not part of the key. A row with all of those empty is skipped |
| Person | First name, last name, and sex, inside this club. If the person is also a member, `member_ref` wins | Two people who share that name and sex are ambiguous. The preview asks which existing person, or to create a new one. Nothing is attached until that choice is made |
| Contact link | The member plus the matched person | The pair is already unique. `relation`, `is_emergency`, and `is_primary` update in place |
| Medical checkup | The member plus `checked_on` | Two checkups on the same day are ambiguous and stay errors until one is skipped |
| Family | The family name inside this club | Members are then linked by `member_ref` |
| Clothing | The member plus the club item's name | An unknown item name is an error. The import does not add an item to the club catalog |
| Gear | The one row on the member | Blank cells on **Add and update** leave the stored size. **Replace the list** writes the file's values, including blanks |
| Fee on the member record | The fee's name and year inside this club | An unknown name is a warning. On update the current fee stays. On create the fee is left empty |

Flags:

- The address table already allows one invoice address per member, and one per person. The contact table already allows one primary contact per member. Emails have no such database rule. The import still refuses two invoice emails in one file, and on commit it clears the flag on the other rows, which is what saving a guardian already does. Two rows that set the same one-only flag are an error until one is cleared. A file that sets none of them leaves the current flags in place on **Add and update**.
- `is_emergency` may be true on several contacts. Guardians are the contacts whose relation is father, mother, grandfather, grandmother, or guardian. The file uses the same contact sheet for them. There is no second guardian table to import.
- `guardian_notice_email` is a single address on a minor's account. Import may set it. It does not create a parent user, and it does not add a contact.

**Replace the list** runs the same match, then removes children of that collection that were not in the file. The preview lists each removal. For contacts, replace removes the link. The person is removed only when they would be left with no member link, no committee mandate, and no family bill-to. A person who is still used elsewhere is kept, and the preview says so. Grade history has no replace choice. Promotions are append-only.

Validation on these sheets:

- An email is one address. A cell with two addresses, or an address the same check as `EmailField` rejects, is an error.
- A phone is stored as E.164 (`+352621000000`). The file also has a country column, an ISO code. A number that is already E.164 is kept, and the country must agree or be empty. A national number is accepted only with a country, and is converted to E.164. A national number with no country is an error. Today's database has no phone-country column, and this spec does not add one. The country lives in the file. The database keeps the E.164 string in `number`. Export writes the stored number as it is. When that stored number is not valid E.164, the export result lists the member as a warning so the club can correct it. The cell itself is not rewritten into a guessed number.
- The phone label accepts `mobile`, `home`, `work`, `other`, or the translated label in en, fr, de, or lb. An unknown label is a warning and is stored as `other`. The preview shows that.
- Relation accepts the keys listed above, or the translated label in the four languages. An unknown relation is an error.
- Address country uses the same ISO code and name mapping as nationality. Postal codes use the rules the address form already uses: Luxembourg 4 digits, Germany 5, Belgium 4, France 5, and up to 12 characters with no lookup for any other country.
- Yes/no flags accept `true`/`false`, `1`/`0`, and the yes/no words of the file's language.
- Medical notes and checkup notes are free text. They are imported only when the medical switch is on and the role is a club admin of this club, or when the file is the member's own file being read back by a club admin of that club.

## Security

- Permissions are checked on the server for every step, not only in the menu.
- Club scope comes from the desk. A club id in the file that is not that club is an error.
- CSV and XLSX cells that start with `=`, `+`, `-`, or `@` are stored as text. On export, such a cell is prefixed so a spreadsheet does not treat it as a formula. On import, a formula is not evaluated. openpyxl reads values, not a macro. Macro-enabled workbooks (`.xlsm`) are refused.
- Parsing uses the Python standard library for CSV, JSON, and zip, and openpyxl for xlsx. No third-party conversion service. A zip is accepted only when every entry is one of the known table names. A path that leaves that list, a nested zip, or a compressed size that blows past the row limit is refused before any row is read.
- Files sit on this server's private media and expire after 72 hours.
- Emergency contacts, guardian details, medical notes, and checkup notes are club care data. A club admin of that club can export and import them. The member can export their own. An LTF admin, a coach, a finance desk, and any other club cannot. The server drops those sheets even if the file contains them.
- The audit log records who exported or imported, the club, the format, the row counts, whether social security numbers were included, whether contacts were included, whether medical notes were included, and the batch id. It does not store the file body, a social security number, a phone number, or the text of a medical note.
- A member export contains only that member. A shared contact person is included, with that person's emails, phones, and addresses, because those are the details the club uses for this member. The other member who also links that person is not included. A parent does not gain a federation export.

## Performance

A few thousand rows is the design point. The preview parses on the server and returns the first 200 row details plus the counts. The rest are in the result file. The commit runs in Celery so a request does not hold the page open. The worker uses one database transaction for the accepted set.

## Accessibility and phones

- Every control has a visible label. Icon-only buttons are not used.
- Errors are text plus the error colour. The error colour is not used for an empty state.
- The wizard keeps focus on the step title when the step changes.
- On a narrow screen the mapping rows stack: header, then the field select. The sheet list sits above the columns. The preview is cards. The merge or replace choice is a radio group with both labels visible.
- The page works in the phone browser, including Brave on an iPhone. The CSV download is one zip, so the phone saves a single file. It does not need the camera and it does not read a card.

## Libraries

Checked against the live indexes on 21 Nov 2026. The app runs Python 3.13.

| Library | Our pin | Latest stable | Date | Decision |
| --- | --- | --- | --- | --- |
| csv, json | Python standard library | The same | Ships with 3.13 | Use these. No new package |
| openpyxl | 3.1.5 | 3.1.5 | 2024-06-28 | Already current. `Requires-Python >=3.8`. Read and write xlsx with this |
| WeasyPrint | 70.0 | 70.0 | 2026-09-08 | Already current. `Requires-Python >=3.10`. Use it for the new report PDF only |
| Celery | 5.7.0 | Already in the app | | The job queue. Do not add a second queue product |
| exceljs | Not installed | 4.4.0 on npm | 2023-10-19 | Do not add. Parsing stays on the server |
| phonenumbers | Not installed | 9.0.44 | 2026-11-20 | Add in the phone-validation pull only. `Requires-Python >=2.5`. Pure Python. Classifiers name CPython through 3.12 and Python 3. They do not name 3.13. The package installs on our 3.13. It parses and checks numbers on this server. It does not call out. Re-check the live version when that pull is opened |

No Node package is added. The browser only uploads and downloads.

## Small pulls, in order

Each pull has tests with fake people only. None of them change a licence-card PDF.

1. Data page and club-admin export of members and licences to CSV and XLSX, without social security numbers.
2. JSON export and the WeasyPrint report.
3. Grade history and weight and height history on the export.
4. The member's own download, including a minor account.
5. Templates, upload, and column mapping, including a saved mapping.
6. The preview, date and number parsing, and the dry run.
7. The Celery commit, the result report, and undo for rows that can be undone.
8. LTF admin scope, one club or every club, still blocked from weight and height and from the club-management sheets.
9. Export of emails, phones, addresses, people, and contacts, only when club management is on. The page hides that group when the module is off.
10. Import of those sheets: match a child without duplicating it, add-and-update as the default, replace as a choice, phone and email checks, shared people.
11. Medical notes and checkups (switch off by default), families, and clothing sizes.
12. The member's own download gains the same nested rows, plus the read-only extras (attendance dates, team names, office titles, invoice references).

## Screens

### Data page

Title **Data**. A line under it names the club, or "All clubs" for an LTF admin who chose that. Two tabs, **Export** and **Import**, text labels. Import is absent for a member and for a coach.

Export: the checkboxes in their groups, the format select, the social security switch when allowed, the medical-notes switch when the club admin's club has club management, then **Download**. A club without club management does not show the contact group. A club without competition does not show weight, height, or gear.

Import: the six steps as a list. The current step is text, not colour alone. **Back** and the step's main button sit at the bottom. On a phone they stack full width.

### Mapping

A heading **Match the columns**. The sheets are a labelled list. The open sheet's columns are below it. Each source column is one block: the header from the file, then a select of our fields. **Ignore** is a choice. **Save this mapping** is a button with an icon and a label. A saved mapping appears as a select above the list. Under the sheets, each included collection has the radio group **Add and update** or **Replace the list**. Grade history does not show that group.

### Preview

A heading with the counts: "12 ready, 2 warnings, 1 error". Then the rows. An error row names the column and the problem in a sentence. A child row names the member it belongs to. When a collection is set to **Replace the list**, the rows that would be removed are listed under a heading **Will remove**, with the count. **Check without saving** and **Import** are separate buttons. **Import** stays disabled while an error is included.

### Result

A heading **Import finished**. Counts, then **Download result** and **Undo this import** when undo is allowed. Undo asks for a confirm in the same page, not a second product: the person types the batch id shown on the page. One Close is not used here, because this is a page, not a panel. The member's one-person panel does have one Close, in the header.
