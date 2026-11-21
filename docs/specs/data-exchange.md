# Import and export of member and licence data

Status: spec only. No code until this spec is approved.

A club admin, an LTF admin, and a member need a way to take their data out and, for the admins, to bring a list back in. The data is members, licences, grade history, and the dated weight and height rows fighters already have. The tool is its own page, not a section buried in the club profile. Files stay on this server. Nothing is sent to a third party. Licence-card PDFs are not part of this tool and their output does not change.

## Where it lives

Recommend a sidebar entry named **Data**, with an icon and a text label, in the same nav group as Members.

Reasons:

- The club profile is a settings page. A mapping table, a preview of hundreds of rows, and a progress report do not fit there, and a member never opens the club profile.
- Members, licences, grades, and measurements are one job. One page with two actions, Export and Import, is easier to find than four buttons on four lists.
- The same page serves every role. What changes is which actions and which clubs are offered, not a different product in each profile.

The club settings page and the member overview may each show one text link, icon plus label, "Open data", that goes to this page. That link is a shortcut. The work happens on the Data page.

On a phone the page is a vertical wizard. On a desktop it is the same steps, with the preview as a table. A side panel is used only for a one-person export (the member's own file, or one row from a member page). That panel has one Close button, in the header. The full import never runs inside a side panel.

| Role | Export | Import | Scope |
| --- | --- | --- | --- |
| LTF admin | Members, licences, grade history | The same | One chosen club, or every club in one file with a club column |
| Club admin | Members, licences, grade history, weight and height history | The same | The club on the open desk only |
| Coach | Weight and height history only, for clubs where they already record it | None | That club, and only when the competition module is on |
| Member | Their own file | None | Their own member row |
| Parent of a minor | The child's file, from the child's member desk | None | The minor account. There is no parent role today |
| LTF finance, read-only desk | Only lists they can already open | None | A read-only download is written to the audit log, as today's read-only export already is |
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

## Formats

| Format | Use | Re-import |
| --- | --- | --- |
| CSV | Lists in a spreadsheet, UTF-8, comma by default | Yes |
| XLSX | The same lists, one sheet per data set, with a header row | Yes |
| JSON | A full snapshot a program can read, including nested grade and measurement rows | Yes |
| PDF | A readable report for a person or a committee | No |

The PDF is a new WeasyPrint report. It is not a licence card and it does not change any card template.

CSV and XLSX for people use one row per member. Grade history and measurements are separate sheets (xlsx) or separate files (csv), linked by `ltf_licenseid`. JSON nests them under the member. The PDF prints the same facts as short sections, with the social security number masked unless the export explicitly included it.

## Export

### Club or federation

1. The page opens on Export. A short line says which club is in scope.
2. Checkboxes, each with an icon and a label: Members, Licences, Grade history, Weight and height. A checkbox the role cannot use is absent, not disabled and greyed without an explanation.
3. Format: CSV, XLSX, JSON, or PDF. The PDF choice hides the "include social security numbers" control, because a paper report for a committee stays masked.
4. Social security numbers are off. A club admin or an LTF admin can turn them on. The control says the file will contain the full numbers and that the download is written to the audit log. A coach never sees this control.
5. The button is **Download**, icon plus label. The file is built on the server. For more than about 500 rows the button becomes **Prepare file**, and the page shows a progress line until the file is ready, using the same waiting pattern as a print job. The file is not built in the browser.

The download name includes the club and the date, for example `example-club-members-2026-11-21.xlsx`. The examples in tests use fake clubs and fake people only.

### Member's own file

On the member overview, a button **Download my data**, icon plus label, opens a small panel. One Close button sits in the header. The panel offers JSON (the portability file) and PDF (a readable copy). CSV and XLSX are also offered, for the same facts in a table. There is no column picker. The file contains the member's own row, their licences, their grade history, and their weight and height history when any exists. The social security number is included, because it is their data. The card photograph is not in the file. Profile photos are not copied into the file either. The file names the photo only as "a profile photo is stored" or "no profile photo", never the image bytes. Card pictures are never stored, so there is nothing to export.

A minor account uses the same button. The page says, in the four languages, that this file is the child's data and that the parent who holds the account can download it here. There is no separate parent login today. A club admin can also produce this one-person file from the member page, for a parent who asks, and that action is audit-logged. The admin does not get a special parent role.

This is the Article 15 and Article 20 copy: the person can take their data in a structured file (JSON) and in a readable report (PDF).

## Import

Import is a wizard of six steps. The step titles are text, not only numbers. Back is allowed until the commit starts. After the commit starts, Back is gone and the page shows progress.

### 1. Choose the file

A template row offers **Download template** for CSV and for XLSX, in the language of the screen (en, fr, de, lb). The template headers are the translated column titles plus a hidden stable key in the second header row of the xlsx (and in a comment on the csv) so a translated header still maps. The sample rows are fake: "EXAMPLE Ada", a made-up licence id, a grade, and a weight. The button is icon plus label.

The upload control accepts `.csv`, `.xlsx`, and `.json` only. Limit 5 MB and 5,000 data rows. A larger file is refused before it is parsed, with a plain error. The file is stored on this server, under a private path, and deleted after 72 hours or as soon as the job is finished and the result report has been downloaded, whichever is later. It is not sent anywhere else.

### 2. Map columns

The server reads the header and suggests a field for each column. Auto-detect uses the stable key when the template has one, then the header text in any of the four languages, then a small alias list (`dob`, `birth date`, `nom`, `grade`). Each column is a row: source header, suggested field, and a select of target fields including **Ignore**. The person can change the suggestion. **Save this mapping** stores it for this club and this file shape (the header set), named by the user. The next file with the same headers offers that mapping first. A federation-wide mapping is available to LTF admin only.

JSON skips this step. Its keys are the stable field names.

### 3. Check the rows

The preview lists every row. On a desktop it is a table. On a phone each row is a card. A row is one of: ok, warning, error. Errors use the error colour. Warnings and ok rows do not. The text of the problem is always present, not colour alone.

Examples of errors: missing last name, unknown grade, weight 44 written as 44 instead of 44.00 when the column is weight and the value is above 150, a promotion date before the member's latest promotion, a licence whose member is in another club, a broken UTF-8 file. Examples of warnings: nationality written as "Luxembourg" (it will be stored as LU), an empty email, a possible duplicate.

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

**Undo this import** is on the result. It is available for 72 hours. It restores the previous field values of updated rows and removes rows the batch created, when the model allows removal. Grade history is append-only, so promotions created by the batch are not deleted. The result says that plainly, before the commit, if the file contains grade rows. Weight and height rows created by the batch can be removed, because those rows are ordinary records. Undo is itself audit-logged and can be used once.

## Security

- Permissions are checked on the server for every step, not only in the menu.
- Club scope comes from the desk. A club id in the file that is not that club is an error.
- CSV and XLSX cells that start with `=`, `+`, `-`, or `@` are stored as text. On export, such a cell is prefixed so a spreadsheet does not treat it as a formula. On import, a formula is not evaluated. openpyxl reads values, not a macro. Macro-enabled workbooks (`.xlsm`) are refused.
- Parsing uses the Python standard library for CSV and JSON, and openpyxl for xlsx. No third-party conversion service.
- Files sit on this server's private media and expire after 72 hours.
- The audit log records who exported or imported, the club, the format, the row counts, whether social security numbers were included, and the batch id. It does not store the file body or a social security number.
- A member export contains only that member. A parent does not gain a federation export.

## Performance

A few thousand rows is the design point. The preview parses on the server and returns the first 200 row details plus the counts. The rest are in the result file. The commit runs in Celery so a request does not hold the page open. The worker uses one database transaction for the accepted set.

## Accessibility and phones

- Every control has a visible label. Icon-only buttons are not used.
- Errors are text plus the error colour. The error colour is not used for an empty state.
- The wizard keeps focus on the step title when the step changes.
- On a narrow screen the mapping rows stack: header, then the field select. The preview is cards.
- The page works in the phone browser, including Brave on an iPhone. It does not need the camera and it does not read a card.

## Libraries

Checked against the live indexes on 21 Nov 2026. The app runs Python 3.13.

| Library | Our pin | Latest stable | Date | Decision |
| --- | --- | --- | --- | --- |
| csv, json | Python standard library | The same | Ships with 3.13 | Use these. No new package |
| openpyxl | 3.1.5 | 3.1.5 | 2024-06-28 | Already current. `Requires-Python >=3.8`. Read and write xlsx with this |
| WeasyPrint | 70.0 | 70.0 | 2026-09-08 | Already current. `Requires-Python >=3.10`. Use it for the new report PDF only |
| Celery | 5.7.0 | Already in the app | | The job queue. Do not add a second queue product |
| exceljs | Not installed | 4.4.0 on npm | 2023-10-19 | Do not add. Parsing stays on the server |

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
8. LTF admin scope, one club or every club, still blocked from weight and height.

## Screens

### Data page

Title **Data**. A line under it names the club, or "All clubs" for an LTF admin who chose that. Two tabs, **Export** and **Import**, text labels. Import is absent for a member and for a coach.

Export: the checkboxes, the format select, the social security switch when allowed, then **Download**.

Import: the six steps as a list. The current step is text, not colour alone. **Back** and the step's main button sit at the bottom. On a phone they stack full width.

### Mapping

A heading **Match the columns**. Each source column is one block: the header from the file, then a select of our fields. **Ignore** is a choice. **Save this mapping** is a button with an icon and a label. A saved mapping appears as a select above the list.

### Preview

A heading with the counts: "12 ready, 2 warnings, 1 error". Then the rows. An error row names the column and the problem in a sentence. **Check without saving** and **Import** are separate buttons. **Import** stays disabled while an error is included.

### Result

A heading **Import finished**. Counts, then **Download result** and **Undo this import** when undo is allowed. Undo asks for a confirm in the same page, not a second product: the person types the batch id shown on the page. One Close is not used here, because this is a page, not a panel. The member's one-person panel does have one Close, in the header.
