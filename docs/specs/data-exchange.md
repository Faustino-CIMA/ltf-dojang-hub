# Import and export of member and licence data

Status: spec only. No code until this spec is approved.

## In short

The app holds a lot more than the member list. This section is the map. The design further down applies only to the rows marked yes.

What clubs and the federation actually need first is a file of people, their licences, and their grades. A club that uses club management also needs the household: who is in the family, in which order, who is billed, and the parent or guardian behind that bill. Those links have to travel together. A file of names with the family left behind is the gap that is easy to miss.

A member can download their own copy. A parent uses the minor's own desk for that. There is no parent login.

Money can be read out later, for the people who already see the finance desk. It is not written back in from a spreadsheet. Stripe ids, passwords, sign-in tokens, and the picture files used for cards never leave in this tool.

There is no table of competition results. The calendar has events. Teams have rosters. The national team has squads. None of those stores a match score or a medal.

## Inventory

Yes means this tool does it. Own file means the member's download. Bulk means a club or federation file. Formats are the ones from the design below: CSV as a zip of tables, XLSX as one workbook, JSON, and a PDF report that is not imported again.

| Domain | Export | Import | Own file | Who, for the bulk file | Why |
| --- | --- | --- | --- | --- | --- |
| Members | Yes | Yes | Yes | Club admin of that club. LTF admin for one club or all clubs | The list everyone asked for |
| Licences | Yes | Yes, new and updates. History events are export only | Yes | Same as members | A licence can be created or corrected. The history log must not be rewritten from a file |
| Grades and belt history | Yes | Yes, append only | Yes | Club admin. LTF admin | Progression is part of the member. A row cannot be deleted, so import only adds |
| Belt-test sittings and pass or fail | Yes | No | Yes, their own result | Club admin | An imported pass would invent an exam. Export is enough until a club asks |
| Families and rebate rules | Yes | Yes | Yes, their own household and their place in it. Not the club's whole discount table | Club admin, and only when club management is on | This was missing from the first pass. The household, the order, and the bill-to person are one file. See Families below |
| Guardians, emergency contacts, emails, phones, addresses | Yes | Yes | Yes | Club admin, club management on. Not LTF, not a coach, not finance | Same people the family bills. They travel in the same file as the household |
| Medical notes and checkups | Yes, switch off until asked | Yes, same switch | Yes | Club admin only | Health notes. The download is audited |
| Weight and height | Yes | Yes | Yes | Club admin and coach, competition module on. Not LTF | Already stored. Dated rows, not only the latest pair |
| Gear sizes | Yes | Yes | Yes | Same as weight and height | Current sizes only. There is no history |
| Clothing sizes | Yes | Yes, labels only. The catalog is not created from the file | Yes | Club admin, club management on | The club's item list stays edited on the clothing page |
| Consents and publication flags | Yes | Publication flags yes. The account consent flag no | Yes | Club admin for the publication flags | A spreadsheet must not set "consent given" |
| Login, as a fact | Yes: email, role, minor flag, "has a login" | No | Yes | Club admin sees it on the member row. Roles are not changed here | Useful on the member file. The password and the links stay inside |
| Invoices, payments, credit notes, orders | Yes, amounts and status | No | Yes, their own invoices, amounts and status only | Club admin and LTF finance, for the ledger they already open | Reading the books out is useful. Writing them in from a sheet would fake a payment |
| Fee catalog, billing calendar, club licence fee | Yes | Yes, the catalog only | No | Club admin, club management on | The price list is club setup. Past charges stay in the invoice export |
| Committees | Yes | No | Yes, offices they hold | Club admin for a club committee. LTF admin for the federation committee | Offices are unique. An import can double-book a president |
| Training attendance | Yes | No | Yes, their dates | Club admin | The calendar is easy to invent by accident |
| Coach pay and outings | Yes | No | No | Club admin | Pay is staff money, not the member's file |
| National team squads and status | Yes | No | Yes, their own selection and status | LTF admin | Federation data. No club import |
| Events | Yes | No | No | The owner: LTF admin or the club admin | A calendar, not a result list |
| Club teams | Yes, name and roster | No | Yes, team names | Club admin and coach, competition on | Import would create teams from a member file |
| Subsidies | Yes, the season summary, without the attached files | No | No | Club admin | The RIB and diploma files stay on the subsidy page |
| Shop | Yes, stock and sales summary | No | Yes, their own purchases as item, date, and amount | Club admin | A stock file must not silently rewrite quantities |
| Club profile and venues | Yes, the public profile | No | No | Club admin and LTF admin. The IBAN only for the club admin and LTF finance | The profile page already edits this. An import must not create a club or change a bank account |
| Federation profile | Yes | No | No | LTF admin | Letterhead and address. Edited on its own page |
| Card templates, fonts, paper, printers | No | No | No | Nobody, in this tool | Design assets. A later backup can cover them. This tool does not |
| Photos and print jobs | No bytes | No | The words "a profile photo is stored" or "no profile photo" | Nobody gets the file bytes | Card pictures are not stored. Profile photos and the print-job PDF are image files and stay on the server |
| Audit logs | No, through this tool | No | No | Ops keeps its own page | A file must not rewrite history |
| Accounts, secrets, Stripe, modules | No | No | No | Nobody | Listed under Never |

## What each domain contains

Walked from the Django apps: accounts, clubs, members, licenses, clubmgmt, events, nationalteam, modules, ops, setup. allauth, sessions, and the API token tables are included. There is no results model and no general document cabinet.

| Domain | Models | Links | Sensitivity | Scope |
| --- | --- | --- | --- | --- |
| Federation | `FederationProfile`, `BrandingAsset` | One profile. Logo and signature files | Organisation. The bank account on the profile is financial | Federation |
| Clubs | `Club`, `TrainingVenue` | A club has many venues and many members | The IBAN is financial. Address and contacts are organisation data | One club, or the federation looking at one club |
| Members | `Member` | One club. One optional login. Names, birth date, sex, belt, licence ids | Personal. Can be a minor | Club. The member owns their row |
| Families | `Family`, `FamilyMember`, `FamilyRebateRule` | A family belongs to one club. Members join it with a sort order. The rebate rules belong to the club, not to one family. Optional bill-to member, or a bill-to person | Personal, often a minor. The rebate is financial | Club |
| Guardians and contacts | `Person`, `PersonEmail`, `PersonPhone`, `PersonAddress`, `MemberContact` | A contact links one member to one person. The same person can be linked to several members and can be the family's bill-to | Personal, minor. Emergency and guardian | Club |
| Member contact lists | `MemberRecord`, `MemberEmail`, `MemberPhone`, `MemberAddress` | One record per member. Many emails, phones, and addresses. One invoice address | Personal. The social security number sits on the record | Club |
| Medical | `MedicalCheckup`, plus `medical_notes` on the record | Many checkups per member | Health | Club |
| Licences | `License`, `LicenseHistoryEvent`, `HistoricalLicense`, `LicenseType`, `LicenseTypePolicy`, `LicensePrice` | A member has many licences. One active licence at a time. History is append-only | Personal | Federation and the club |
| Grades and exams | `GradePromotionHistory`, `PromotionRule`, `BeltTest`, `BeltTestResult` | Promotions are append-only and dated. A belt test has a result per member | Personal | Club. LTF can read the promotion history |
| Weight and height | `BodyMeasurement` | Many dated rows per member | Personal, close to health | Club, competition module. LTF cannot read them today |
| Gear and clothing | `MemberGear`, `ClubClothingItem`, `ClubClothingSize`, `MemberClothingValue` | One gear row. Clothing values point at the club's items | Personal, low | Gear: competition. Clothing: club management |
| Teams | `ClubTeam`, `ClubTeamMembership`, `ClubTeamMembershipEvent`, `ClubTeamGroup`, `ClubTeamGroupMember`, `WeightCategorySet`, `WeightCategoryBand`, `ClubTeamCategoryBand` | A team has a roster. Category sets are reference data | Personal for the roster | Club, competition module |
| Events | `Event`, `EventAttention` | Federation or one club. Attention is per user | Low. Private events are internal | The owner |
| National team | `Season`, `Squad`, `SquadSelection`, `CadreLevel`, `AthleteStatus`, `NationalTeamStaff`, `NationalTeamSettings` | A selection links a member, a squad, and a season | Personal. Status can name a support programme | Federation |
| Fees and billing | `MembershipFee`, `MembershipFeePrice`, `MembershipBilling`, `ClubLicenseFee`, `ClubLicenseFeePrice`, `MembershipYearConfirmation` | Fees belong to the club. A member record points at one fee | Financial | Club |
| Invoices and Stripe | `Order`, `OrderItem`, `Invoice`, `CreditNote`, `Payment`, `ClubFeeType`, `ClubFeePrice`, `ClubFeeBillingSchedule`, `ModulePurchase`, `ModuleRenewalJournal`, `ModulePurchaseOverride`, `ModuleBundle`, `ModuleBundleModule`, `ModuleBundlePrice` | An order belongs to a club and may name a member. A payment belongs to an invoice. Stripe ids are encrypted columns on the order and the invoice | Financial | Federation ledger or club ledger, matching the desk |
| Other finance | `Expense`, `ExpenseCategory`, `Income`, `IncomeCategory`, `FinanceBudgetLine`, `FinanceYearOpening`, `ClubFinanceYearOpening`, `BankStatement`, `BankStatementLine`, `DutyException`, `FinanceAuditLog` | Receipts and bank files are stored files | Financial | The finance desk that owns the ledger |
| Subsidies | `SubsidySeason`, `CoachQualification`, `ExtraordinarySubsidy` | A season belongs to a club. Athletes are stored as ids on the extraordinary request. RIB and diploma are files | Financial. The diploma is a staff document | Club |
| Shop | `ShopItem`, `ShopVariant`, `ShopMovement`, `ShopSale`, `ShopSaleLine`, `ShopSnapshot`, `ShopSnapshotLine` | A sale may name a member | Financial | Club |
| Committees | `Committee`, `CommitteeMandate` | A mandate is a member or a person, with dates. One holder for the main offices | Governance | Federation or one club |
| Training | `TrainingSettings`, `TrainingSeries`, `TrainingSession`, `TrainingAttendance`, `PublicHoliday`, `SchoolHoliday`, `CoachPayRate`, `CoachOuting` | Attendance links a member to a session. Pay links a coach | Attendance is personal. Pay is financial | Club |
| Photos and print | Profile picture fields on `Member`. `PrintJob`, `PrintJobItem`. `VerificationChallenge` | A print job lists members and stores a PDF | The image is personal. The challenge token is a secret | Club for the job. The bytes stay put |
| Card templates | `CardFormatPreset`, `PaperProfile`, `PrinterProfile`, `CardTemplate`, `CardTemplateVersion`, `CardFontAsset`, `CardImageAsset` | A template has versions, fonts, and images | Design. Not a member record | Federation, and a club when it has its own template |
| Accounts | `User`, `DeskGrant`, `OfficeDeskMap`, `DeskPreference`, `AccountSetupInvite`, allauth email, social, and MFA tables, `EmailMfa`, `EmailMfaCode` | A user may link to one member. Desks grant a role | The login email is personal. The secrets are never files | The person. Admins see the role |
| Consents | `User.consent_given`, photo consent fields on `Member`, `publish_*` on `MemberRecord` | On the person | Personal | The member, and the club for the publication flags |
| Transfers and verification | `MemberTransfer`, `MemberTransferMessage`, `MemberVerification`, `MemberVerificationEvent`, `AdminNotice` | A transfer links two clubs | Personal, and a process log | The clubs involved. Not a spreadsheet |
| Staff functions | `LtfStaffFunction` | On a member, dated | Personal | Federation |
| Modules and setup | `InstallIdentity`, `InstallEntitlement`, `ClubModuleAssignment`, `ProductCodeRedemption`, `ModuleSubscriptionSettings`, `SetupState` | Which modules a club has | The product code is a secret | Federation. The page only shows or hides groups from the assignment |
| Audit and ops | `OpsAuditLog`, `AuthEvent`, `AuthTokenMeta`, `SecurityAlert`, `TranslationOverride` | Who did what | Security | Ops |
| Reference | `LuxembourgRegisteredStreet`, `LuxembourgRegisteredHouse` | The public street list | None | Shared lookup. Not a club file |

## Families

A family is a household inside one club. It is not a second member list.

- `Family` has a name, the club, an optional member who receives the invoice, an optional person who is billed when the household is all minors, and how that bill is delivered (email, post, or in person).
- `FamilyMember` puts members in that household with a sort order. Rank 1 is the first person. The same member can appear in two households. The preview warns when that happens.
- `FamilyRebateRule` is the club's discount, not a row on the family. Rank 2 might be a percent off or an amount off, and a rule can cover the later ranks. The discount follows the sort order. The licence fee is not discounted.
- The bill-to person is the same `Person` as a guardian contact. The file writes that person once. The family points at them with `person_ref`. Each member points at them with a contact row (`relation`, `is_emergency`, `is_primary`).

In the file:

- `families` holds `family_ref`, the name, `invoice_member_ref`, `bill_to_person_ref`, and the delivery.
- `family_members` holds `family_ref`, `member_ref`, and `sort_order`.
- The people, emails, phones, and addresses use the sheets already described. A child row that names a `member_ref` or `person_ref` the file does not contain is an error.
- JSON nests `members` inside each family and still keeps `people` once at the top, so two children do not get two copies of their mother.
- The PDF prints one heading per family, the people in order, who is billed, then each member's own sections.

Import, after the members and the people have been matched:

- Match a family by its name inside this club. Two families with the same name are an error until one is renamed or skipped.
- Match a member link by `member_ref`. The sort order is updated. **Add and update** keeps a member the file left out. **Replace the list** removes them from the household and says so in the preview. It does not delete the member.
- The bill-to person is matched like any other person. If the file names a person who is not also a contact of someone in the household, the preview says that, and the import still stores the link.
- Rebate rules are a separate sheet, matched by rank. They are club settings. A member file does not change them. Replacing the rule sheet replaces the club's ranks, and the preview lists the ranks that would disappear.
- A family never moves to another club. A `member_ref` from outside the desk club is an error.

The member's own file names their household, their place in the order, who is billed, and that person's phone and email. It does not include the club's rebate table or the other households.

## Never in a file

These exist in the database. This tool does not export them and does not import them.

| What | Where | Why |
| --- | --- | --- |
| Password hash, reset generation | `User.password`, `User.password_reset_generation` | A password file is a breach. A new password is set on the account screen |
| Invite links, API tokens, sessions | `AccountSetupInvite.token_hash`, `authtoken.Token`, `AuthTokenMeta`, the session table | Whoever holds the token is signed in |
| MFA secrets and one-time codes | allauth MFA, WebAuthn keys, `EmailMfa`, `EmailMfaCode` | Second factor. Exporting it defeats it |
| Verification desktop code | `VerificationChallenge.token_hash` | One-time. The raw code is not even stored. No card image is stored on it |
| Stripe ids and the lookup hash | Encrypted `stripe_payment_intent_id`, `stripe_checkout_session_id`, `stripe_invoice_id`, `stripe_customer_id`, and `stripe_session_lookup` on the order and the invoice | Stripe internals. The payment's amount and status are enough |
| Product codes and the install id | `ProductCodeRedemption`, `InstallIdentity` | They unlock modules |
| Profile photos, pending cutouts, print-job PDFs | Picture fields on `Member`, `PrintJob.artifact_pdf` | Card pictures are not stored as their own file. The photos that are stored, and the printed sheet, are images. The data file says only whether a profile photo exists |
| Card template images and fonts | `CardImageAsset`, `CardFontAsset` | Design files, not member data |
| Bank files, receipts, subsidy RIB, diplomas | `BankStatement.source_file`, expense and income receipts, `SubsidySeason.rib_file`, `CoachQualification.diploma_file` | Documents stay on the finance and subsidy pages. The summary rows can be exported later without the file |
| Audit rows | `OpsAuditLog`, `FinanceAuditLog`, `AuthEvent` | Importing a log would forge it |

## What to build first

Ordered by what a club and the federation can use, not by which table is easiest. Each step is one pull request, with tests and fake people. None of them change a licence-card PDF.

1. Export members and licences, CSV and XLSX, for a club admin. No social security number.
2. Add grades to that export, then JSON and the PDF report.
3. Import of members, licences, and grades, with the wizard below. Grades only append.
4. The member's own download of those three, including a minor account.
5. Families, rebate rules, and the contact lists, export only, for a club with club management. One file, links intact.
6. Import of that same file: households, people, emails, phones, addresses, emergency contacts.
7. Weight, height, and gear, for a club with the competition module.
8. The member's own download grows to include their household, contacts, measurements, and the words about the photo. Medical notes are included there, and on the club export only when the switch is on.
9. Fee catalog export and import. Invoice and payment export, with no Stripe columns and no import.
10. LTF admin scope for members, licences, and grades, one club or all clubs. Still no contacts, no measurements, no invoices unless the finance desk exports those itself.
11. Anything else in the inventory that is export-only (attendance, committees, squads, shop summary) waits until a club or the federation asks. Import stays no.

## Design

A club admin, an LTF admin, and a member need a way to take the yes-rows out and, for the admins, to bring the import-yes rows back in. The tool is its own page, not a section buried in the club profile. The page shows only the groups that club's modules allow. Files stay on this server. Nothing is sent to a third party. Licence-card PDFs are not part of this tool and their output does not change.

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

The inventory at the top is the full list. Shop sales, subsidies, invoices, attendance, committee offices, and national-team selections can be exported later and are not imported. The member's own download still lists the personal facts from them when those steps are built: attendance dates, team names, office titles, and their own invoice number, date, amount, and status.

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

On the member overview, a button **Download my data**, icon plus label, opens a small panel. One Close button sits in the header. The panel offers JSON (the portability file) and PDF (a readable copy). CSV and XLSX are also offered, for the same facts. There is no column picker. The file contains the member's own row, their licences, their grade history, and their weight and height history when any exists. When the club uses club management, it also contains that member's emails, phones, addresses, contacts (with each person's own emails, phones, and addresses), their household (the name, their place in the order, and who is billed), clothing sizes, medical notes, checkups, and the guardian notice email if the account is a minor. The social security number is included, because it is their data. Medical notes are included for the same reason, with no extra switch. The card photograph is not in the file. Profile photos are not copied into the file either. The file names the photo only as "a profile photo is stored" or "no profile photo", never the image bytes. Card pictures are never stored, so there is nothing to export. Attendance dates, team names, office titles, and their own invoice references are added when those later steps are built. They are not in the first download.

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

## Small pulls

The order is **What to build first**. The wizard, the templates, the preview, the dry run, the Celery job, and the undo arrive inside step 3, and they are reused by the later imports. Families and contacts are steps 5 and 6, in one file, not a later extra. Weight and height wait until step 7. Attendance, committees, squads, and the shop wait until someone asks.

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
