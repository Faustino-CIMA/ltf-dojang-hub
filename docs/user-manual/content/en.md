---
title: LTF Dojang Hub
subtitle: User manual for clubs, coaches and the federation
cover_roles: Club admins · Coaches · LTF Admin · LTF Finance
ui: en
html_lang: en
edition: October 2026
pdf_name: LTF-Dojang-Hub-User-Manual-EN.pdf
labels:
  manual: User manual
  app_version: App version
  edition: Edition
  lang_name: English
  contents: Contents
  figure: Figure
  tip: Tip
  warning: Watch out
  note: Good to know
  glossary: Glossary
  glossary_intro: "Words used in this manual, with the label you see on screen in English and in Luxembourgish. The app itself is available in those two languages."
  term: Term
  en_screen: Screen label (English)
  lb_screen: Screen label (Lëtzebuergesch)
  meaning: What it means
  index: Index
  page_abbr: p.
index_terms:
  - Absent = absent
  - Address = address(es)?
  - Belt test = belt tests?
  - Bank statement = bank statement|CAMT\.053
  - Bill recipient = (bill recipient|receives the bill)
  - Calendar = calendar
  - Card template = (card )?templates?
  - Club admin = club admins?
  - Club profile = club profile
  - Coach = coach(es)?
  - Coach pay = coach pay
  - Committee = committee
  - Credit note = credit notes?
  - CSV file = CSV
  - Delete a member = delet(e|ing)
  - Email = e-?mails?
  - Expenses = expenses?
  - Family = famil(y|ies)
  - Family rebate = rebates?
  - Grade = grades?
  - Holidays = holidays?
  - Import = import(ing)?
  - Inactive member = inactive
  - Income = income
  - Invoice = invoices?
  - Language = language
  - Licence = licen[cs]es?
  - Licence card = cards?
  - Licence fee = licen[cs]e fee
  - Membership fee = membership fees?
  - MyGuichet
  - Ordering window = (ordering )?windows?
  - Parent = parents?|guardian
  - Password = passwords?
  - Payment = payments?
  - Photo = photos?|picture
  - Printer profile = printer profiles?|offset
  - Print pack = print pack|postal
  - Promotion rule = promotion|required hours
  - Publication consent = publication consent|consent
  - Qualité+ = Qualit\u00e9\+|Qualité\+
  - QR sticker = stickers?
  - Reminder = reminders?
  - Reports = reports?
  - Role = roles?
  - Roll = roll
  - Shop = shop|desk sale
  - Sign in = sign(ing)? in
  - Stock = stock
  - Subsidies = subsid(y|ies)
  - Timetable = timetable
  - Transfer = transfers?
  - Treasurer = treasurer
  - Username = username
  - Visibility = (who can see|visibility)
  - Privacy = privacy|GDPR
  - Season = season
imprint: |
  <p><strong>LTF Dojang Hub – User manual</strong><br>Edition October 2026, for app version 0.12.0.</p>
  <p>Published for the clubs of the Luxembourg Taekwondo Federation (LTF). Available in English, German, French and Luxembourgish.</p>
  <p>All screenshots were taken from a demonstration installation filled with invented clubs, people and amounts. Any resemblance to real people is coincidental.</p>
  <p>Words in <span class="ui">blue boxes</span> are the exact labels you see on screen. Numbered red circles in the screenshots are explained in the list under each picture.</p>
  <p>The app keeps improving. If something on your screen looks different from this manual, the screen is right – and please tell the LTF so the next edition can be updated.</p>
---

# Welcome {#welcome}

LTF Dojang Hub is the shared online desk of the Luxembourg Taekwondo Federation and its clubs. Clubs keep their member list, order licences, take the roll in training, bill membership fees and run their shop. The federation checks licences, prints licence cards and keeps its books. Everyone shares one calendar. It is a management tool for the staff of the clubs and the federation; members and parents do not sign in.

## Who this manual is for {#audience}

The manual is organised by **what you do**, not by screen. Read the first two chapters, then jump to the chapter for your role.

| If you are… | Read |
|---|---|
| a coach | [Getting started](#getting-started), then [Coaches](#coaches) and [Calendar](#calendar) |
| a club admin (president, secretary, treasurer, volunteer) | chapters 2 to 10 – start with [The club year at a glance](#club-year) |
| working at the LTF office | [LTF Admin](#ltf-admin) or [LTF Finance](#ltf-finance) |
| the technical administrator | [Modules (technical administrator)](#ops) |

Members and parents do not need this manual: they have no login, and their club looks after their data.

## How to read this manual {#conventions}

- Words in a blue box, such as [[Common.signOut]], are the **exact labels on screen**.
- Paths such as [[Common.navGroupClubManagement]] › [[navFinance]] › [[navBilling]] tell you where to click, from the menu on the left to the tab at the top.
- Numbered steps are things to do, in that order. A line with a tick tells you what you should see afterwards.
- Red numbered circles in a screenshot are explained in the list under the picture.

> [!TIP]
> Tips save you time.

> [!WARNING]
> “Watch out” boxes protect you from mistakes that are hard to undo.

> [!NOTE]
> “Good to know” boxes explain why the app behaves the way it does.

# Getting started {#getting-started}

All you need is a web browser on a computer, tablet or phone. There is nothing to install.

## Signing in {#sign-in}

Open the address the LTF gave you. The sign-in page appears.

![The sign-in page](fig:signin)

<div class="legend" markdown="1">
1. Language switch – choose English or Luxembourgish before you sign in.
2. [[Auth.username]]
3. [[Auth.password]]
4. [[Auth.submit]] – signs you in.
</div>

To sign in:
{: .proc}

1. Type your {{username}} in [[Auth.username]]. Your username is in the welcome email, for example `anne.reding`.
2. Type your password in [[Auth.password]].
3. Click [[Auth.submit]].

You arrive on the start page for your role, for example the club overview or the federation overview.
{: .result}

> [!NOTE]
> There is no public sign-up. Logins are created when someone is made a club admin or a coach (see [Club admins](#club-admins) and [Coaches tab](#coaches-tab)), or by the LTF.
>
> Members and parents do not get a login.

## Your first password {#first-password}

When you get a login, you receive a welcome email with a **set-password link**.

1. Click the link in the email. The page [[Reset.title]] opens with your [[Reset.usernameLabel]] already filled in.
2. Type a new password in [[Reset.passwordLabel]] and again in [[Reset.confirmPasswordLabel]].
3. Click [[Reset.submit]], then [[Reset.continueToLogin]].

> [!TIP]
> Let your browser or password manager save the username together with the new password. The page fills in the username for exactly that reason.

## Verifying your email {#verify-email}

If the sign-in page says your email isn't verified yet, open the verification email and click its link. No email? Click [[Auth.verifyLink]] under the sign-in button, type your email address and click [[Verify.submit]].

## Forgotten password {#forgotten-password}

The sign-in page has no “forgotten password” link. Ask your club admin or the LTF: the technical administrator can send you a new password email. A club admin who was just created also gets a [[adminResetLink]] shown on screen if the welcome email could not be sent.

## Privacy and your data {#privacy}

The app has a page where you manage your own consent and data rights. It is not in the menu, so you open it by its address.
{: .lead}

1. Sign in.
2. In the browser's address bar, replace everything after the app's address with `/en/settings/privacy` (or `/lb/settings/privacy`) and press Enter. Example: `https://<app address>/en/settings/privacy`.

![The privacy page {small}](fig:privacy)

The page <span class="ui">Privacy &amp; GDPR</span> has three controls:

- <span class="ui">I consent to data processing.</span> – tick or clear the box. The change is saved at once.
- <span class="ui">Export my data</span> – shows your data on the page, under <span class="ui">Export preview</span>: your login details and, if your login is linked to a member record, that member's name, grade and club, the licences, the licence and grade history and the photo details. The data is only shown on screen, not downloaded as a file.
- <span class="ui">Delete my data</span> – deletes your login.

> [!WARNING]
> <span class="ui">Delete my data</span> does not ask for confirmation. It deletes your login at once and signs you out. If the login is linked to a member record, the profile photo is removed and the notes on the grade history are cleared; the member record and its licences stay with the club.

> [!NOTE]
> This page is being reviewed. For now its text is in English only, also when you use the app in Luxembourgish.

## The screen at a glance {#screen}

Every page has the same frame: the menu on the left, a bar across the top and the work area in the middle.

![The club overview with the main parts of the screen](fig:shell)

<div class="legend" markdown="1">
1. **Menu**, grouped under headings such as [[Common.navGroupClub]], [[Common.navGroupClubManagement]] and [[Common.navGroupCalendar]]. You only see what your role and your club's modules allow.
2. **Club selector** – if you look after more than one club, choose the club here. Every page then shows that club.
3. Your name, your username and your **role badge**, for example [[Common.roleClubAdmin]].
4. **Language** – switch between [[Common.languageEnglish]] and [[Common.languageLux]] at any time.
5. [[Common.signOut]]
6. [[Common.sidebarCollapse]] – makes the menu narrow to give tables more room. The app version is shown next to it.
</div>

> [!TIP]
> On a phone the menu folds away. Tap the menu button at the top left to open it.

## Roles: who can do what {#roles}

Your {{role}} decides which menu you see. One person can have only one role per login.

| Role badge | Typical person | Main work |
|---|---|---|
| [[Common.roleCoach]] | coach | sees the training week, takes the roll, sees the calendar |
| [[Common.roleClubAdmin]] | president, secretary, treasurer, volunteer | runs the club: members, licences, money, training, shop |
| [[Common.roleLtfAdmin]] | federation office | clubs, licences, cards, transfers, federation calendar |
| [[Common.roleLtfFinance]] | federation treasurer | federation orders, invoices, payments, books |
| [[Common.roleSuperuser]] | technical administrator | modules, users, system health |

> [!NOTE]
> **Members and parents do not have a login.** LTF Dojang Hub is currently a management tool for the staff of the clubs and the federation. The club keeps the data of its members and their parents and answers their questions. Member access may come later.

What each club role sees in the club menu:

| Page | Coach | Club admin |
|---|---|---|
| [[navTraining]] | yes ¹ | yes |
| [[Events.calendarTitle]] | yes | yes |
| [[navOverview]], [[navMembers]], [[navLicenses]], [[navPrintJobs]], [[navTransfers]], [[navPromotion]] | – ² | yes |
| [[navFinance]], [[navFamilies]], [[navShop]] | – | yes |
| [[navClubAdmins]], [[navSettings]] | – | yes |
{: .matrix}

¹ Coaches see the week, take the roll and choose who taught the class. The timetable, holidays, rates and promotion rules are for club admins. ² These pages appear in a coach's menu but are not set up for coaches yet. A coach who is also a club admin uses them as a club admin.

> [!NOTE]
> Recording payments is even stricter: it needs a current committee office. See [Who may record payments](#payment-permission).

## Modules: why some menus are missing {#modules}

Parts of the app are switched on per club by the LTF as {{modules}}:

- **Club management** adds [[navFinance]], [[navFamilies]], [[navTraining]], [[navPromotion]] and [[navShop]] under [[Common.navGroupClubManagement]].
- **Event calendar** adds [[Events.calendarTitle]] under [[Common.navGroupCalendar]].

If your club has no module, you still have the [[Common.navGroupClub]] pages: members, licences, printing and transfers. Ask the LTF if you are missing a module you need.

# Coaches {#coaches}

<p class="roles"><span class="chip">Coach</span></p>

A club admin makes you a coach in [[navSettings]] › [[clubSettingsTrainersTab]]. You then get a login with the [[Common.roleCoach]] badge.

> [!NOTE]
> The coach role is still being built. This chapter describes what works for coaches today: the training week, the roll and the calendar. More coach features are planned.

## Your week {#coach-week}

Open [[navTraining]]. The tab [[trainingThisWeek]] lists every class of the week with its status and coaches.

![A coach's training week](fig:coach-week)

## Taking the roll {#roll}

Do this during or right after the class. It takes less than a minute.
{: .lead}

![Taking the roll for a class](fig:roll)

<div class="legend" markdown="1">
1. [[trainingSessionCoaches]] – add or remove the coaches who actually taught.
2. Age filters such as [[trainingAge_all]] – they only shorten the list; every active member may attend.
3. [[trainingOnTheRoll]] – the students marked present.
4. [[trainingMarkShown]] – ticks everyone in the current list in one go.
5. [[trainingSaveRoll]]
6. [[trainingAddStudents]] – search for anyone else who came.
</div>

1. In [[navTraining]] › [[trainingThisWeek]], click [[trainingOpenRoll]] next to the class.
2. The usual students are already on the roll. Click a name to take it off if that student was absent.
3. Under [[trainingAddStudents]], tick anyone else who came. Search by name if the list is long.
4. Check [[trainingSessionCoaches]].
5. Click [[trainingSaveRoll]].

The class now shows as [[trainingStatus_held]] and its hours count towards each student's next belt (see [Promotion](#promotion)) and towards coach pay.
{: .result}

> [!TIP]
> Take the roll on a phone at the side of the mat. The page is made for small screens.

## Calendar for coaches {#coach-calendar}

Coaches see public club events and also [[calendarVisibility_internal]] ones, so the club can share coach meetings with its coaches and admins only. See [Calendar](#calendar).

# Club admin: members and licences {#club-members}

<p class="roles"><span class="chip">Club admin</span></p>

## Club overview {#club-overview}

[[navOverview]] is your dashboard. It counts members, licences and open invoices, and its [[actionQueueTitle]] lists things that need you, each with a button that opens the right page.

![The club overview](fig:club-overview)

<div class="legend" markdown="1">
1. [[refreshAction]] – reloads the numbers.
2. [[actionQueueTitle]] – when it says “All clear”, nothing is waiting.
</div>

## The members list {#members-list}

[[navMembers]] lists everyone in your club.

![The members list](fig:members-list)

<div class="legend" markdown="1">
1. Search by name.
2. Filter [[filterAllTitle]] / [[filterActiveTitle]] / [[filterInactiveTitle]] members.
3. The [[membersMenuLabel]] menu: create or import members.
4. [[Common.batchActionsLabel]] for the members you ticked.
5. Tick box to select a member.
6. Delete one member.
</div>

Click a name to open the member. The [[Common.batchActionsLabel]] menu works on all ticked members at once:

![Actions for selected members](fig:members-actions)

<div class="legend" markdown="1">
1. [[actionPrintCards]] – see [Printing licence cards](#print-cards).
2. [[actionOrderLicense]] – see [Ordering licences](#order-licences).
3. [[actionChangeStatus]] – make members active or inactive.
</div>

> [!WARNING]
> Prefer making a member **inactive** to deleting. Deleting also deletes the member's licences; an inactive member keeps their history.

## Adding a member {#add-member}

1. In [[navMembers]], open [[membersMenuLabel]] and click [[createMember]].
2. Fill in [[firstNameLabel]], [[lastNameLabel]], [[sexLabel]] and [[dobLabel]].
3. Choose the [[ltfLicensePrefixLabel]]. The LTF licence number itself is created automatically when you save. Fill in [[Import.wtLicenseLabel]] only if the athlete already has a World Taekwondo licence.
4. Set the belt grade after saving, on the [[memberGradesTab]] tab.
5. Click [[createMember]].

![Creating a member](fig:member-new)

## Importing members from a spreadsheet {#import}

Use this once, when your club starts with the app, or to add a whole group.
{: .lead}

1. Save your list as a CSV file (one row per person, one column per field).
2. In [[navMembers]], open [[membersMenuLabel]] and click [[Import.importMembers]].
3. [[Import.sourceStepTitle]]: choose the [[Import.dateFormatLabel]] used in your file and click [[Import.chooseFileButton]]. Click [[Import.continueToMapping]].
4. [[Import.mappingStepTitle]]: for each field of the app, pick the matching column of your file. [[Import.autoMapButton]] does most of the work. All fields marked [[Import.requiredBadge]] must be mapped.
5. [[Import.previewStepTitle]]: click [[Import.previewButton]]. Each row is [[Import.statusReady]], [[Import.statusDuplicate]], [[Import.statusInvalid]] or [[Import.statusSkipped]]. Fix your file or change the action for a row.
6. [[Import.confirmStepTitle]]: click [[Import.startImport]].
7. [[Import.resultStepTitle]] shows what was created.

![Step 1 of the import wizard](fig:import)

> [!TIP]
> If your file has a membership end date column, use [[Import.membershipYearRulesLabel]] to import current members as active and skip people who left years ago.

## The member record {#member-record}

A member's page has six tabs.

![A member's page](fig:member-detail)

<div class="legend" markdown="1">
1. [[memberOverviewTab]] – name, birth date, licence numbers, belt.
2. [[memberClubRecordTab]] – what only the club needs (below).
3. [[memberCurrentLicensesTab]] – this year's licence and its card preview.
4. [[memberLicenseHistoryTab]]
5. [[memberGradesTab]]
6. [[memberClubMovementsTab]] – transfers between clubs.
7. Edit the overview data.
8. [[photoChangeButton]] – opens the photo editor (see [A member's photo](#member-photo)).
9. [[downloadStatementAction]] – a PDF of the member's invoices and payments.
</div>

### The club record {#club-record}

[[memberClubRecordTab]] holds the details the club needs for daily life. Everything is optional; fill in what you use.

![The club record](fig:member-record)

<div class="legend" markdown="1">
1. [[ClubMgmt.paysLicenseFee]] – clear this for a member who should not pay the club's licence fee.
2. [[ClubMgmt.memberFeeLabel]] – which membership fee is charged; [[ClubMgmt.memberFeeDefault]] if left alone.
3. [[ClubMgmt.deliveryLabel]] – [[ClubMgmt.deliveryEmail]], [[ClubMgmt.deliveryPost]] or [[ClubMgmt.deliveryHand]].
4. [[ClubMgmt.contacts]] – parents, guardians, emergency contacts.
</div>

It also contains [[ClubMgmt.ssn]], [[ClubMgmt.joinedAt]], two nationalities, [[ClubMgmt.medicalNotes]], [[ClubMgmt.emails]], [[ClubMgmt.phones]], [[ClubMgmt.addresses]], [[ClubMgmt.mediaConsent]] and the [[ClubMgmt.checkups]] dates. Click [[ClubMgmt.saveRecord]] when you are done.

> [!TIP]
> For a child, add the parent under [[ClubMgmt.contacts]] and tick [[ClubMgmt.alsoForFamily|name=the family]] to reuse the same parent for brothers and sisters.

### A member's photo {#member-photo}

The photo is printed on the licence card, so a good photo saves a reprint.

1. Open the member and click [[photoChangeButton]].
2. Drop a picture into the box, click [[photoSelectFileButton]], or click [[photoCameraButton]] and then [[photoCameraCaptureButton]].
3. Use [[photoZoomLabel]] and drag the picture until the face fills the 8:10 frame. The [[photoPreviewTitle]] shows the result.
4. If you like, click [[photoRemoveBackgroundButton]] and pick a colour under [[photoBackgroundColorLabel]].
5. Tick [[photoConsentLabel]].
6. Click [[photoSaveButton]].

> [!TIP]
> A plain wall, good light and a straight look into the camera give the best result. JPEG, PNG and HEIC photos up to 10 MB are accepted.

## Ordering licences {#order-licences}

Every athlete needs a yearly LTF {{licence}}. You order licences for several members at once; the LTF then invoices your club.
{: .lead}

1. In [[navMembers]], tick the members who need a licence.
2. Open [[Common.batchActionsLabel]] and click [[actionOrderLicense]].
3. Choose the [[yearLabel]]. Depending on federation policy you can order for this year or pre-order for next year.
4. Under [[orderLicenseAvailableTypesTitle]], click a licence type marked [[orderLicenseStatusAvailable]].
5. Check [[orderLicenseReviewTitle]]. Members who already have this licence are listed under [[orderLicenseAlreadyLicensedTitle]]; click [[orderLicenseResolveDuplicatesAction]] or [[orderLicenseResolveBlockedAction]] if needed.
6. Click [[orderLicenseButton|year=2026]].

The page shows [[orderLicenseSuccessTitle]]. The licences are [[statusPending]] until the LTF has received your payment and activated them.
{: .result}

![Ordering licences for two members](fig:order-licenses)

> [!NOTE]
> A licence type you cannot choose shows why, for example [[orderLicenseUnavailableReasonWindow]] or [[orderLicenseUnavailableReasonNoPrice]]. Ordering windows and prices are set by the LTF.

The order and its invoice appear in [[navFinance]] › [[navOrders]] and [[navInvoices]]. Pay the federation invoice as explained in [Paying the LTF](#pay-ltf).

## The licences list {#licences}

[[navLicenses]] shows every licence of the club with its status: [[filterActiveTitle]], [[filterPendingTitle]] or [[filterExpiredTitle]]. Search by member, year or status. Tick licences and use [[Common.batchActionsLabel]] › [[actionPrintCards]] to print their cards.

![The licences list](fig:licences)

## Printing licence cards {#print-cards}

1. Tick the members (in [[navMembers]]) or licences (in [[navLicenses]]) whose cards you want.
2. Open [[Common.batchActionsLabel]] and click [[actionPrintCards]]. The page [[quickPrintTitle]] opens.
3. Check the [[quickPrintTemplateLabel]] and [[quickPrintPaperProfileLabel]]. Choose a [[quickPrintPrinterProfileLabel]] if your printer needs an offset.
4. Printing on a sheet that is already partly used? In [[quickPrintSlotPickerTitle]], click the free slots.
5. Click [[quickPrintCreateAction]].
6. Open [[quickPrintOpenHistoryAction]] and click [[printJobDownloadPdfAction]] when the job shows [[printJobStatusSucceeded]]. Print the PDF at 100 % (no “fit to page”).

![Quick print](fig:print-jobs)

> [!TIP]
> If the print sits a few millimetres off, ask the LTF for a printer profile with the right X/Y offset instead of changing the card design.

## Transfers between clubs {#transfers}

A member who moves to another club is **sent** by the old club and **accepted** by the new one. The licence and history move with the member.
{: .lead}

To send a member to another club:
{: .proc}

1. Open [[navTransfers]].
2. Click the member in the left column, then click the destination club on the right. Type in the search boxes to find them faster.
3. Enter a [[transferFeeAmountLabel]] if your club charges one, or leave it at 0 for a free transfer, and add a note.
4. Click [[transferSendRequest]].

![Choosing a member and the new club](fig:transfers)

To answer a request from another club:
{: .proc}

1. Open [[navTransfers]]. Incoming requests are listed under [[transferInboxTitle]] › [[transferIncomingLabel]].
2. Click the request. Read the messages; write one with [[transferSendMessage]] if you have a question.
3. Click [[transferAcceptAction]] or [[transferRejectAction]].

![Answering an incoming transfer](fig:transfers-in)

<div class="legend" markdown="1">
1. Write a message to the other club.
2. [[transferSendMessage]]
3. [[transferAcceptAction]]
4. [[transferRejectAction]]
</div>

> [!NOTE]
> The sending club can cancel its own request until the other club has answered. Only clubs that have a club admin can receive transfers.

# Club admin: money {#club-money}

<p class="roles"><span class="chip">Club admin</span><span class="chip">Club management module</span></p>

Under [[navFinance]] you find the club's books. The tabs across the top are: [[navOrders]], [[navInvoices]], [[navPayments]], [[navBilling]], [[navMembershipFees]], [[navIncome]], [[navExpenses]], [[navBank]], [[navReports]] and [[navSubsidies]].

> [!NOTE]
> The club's books contain two kinds of invoices: **LTF invoices** (licences your club buys from the federation) and **club invoices** (membership fees and shop sales you bill to your members). The [[financeLedgerLabel]] filter on [[navInvoices]] switches between them.

## Who may record payments {#payment-permission}

{{Payments}} and other changes to the club's books need a **current committee office**: [[paymentsRecordDenied]] Make sure the committee is up to date in [[navSettings]] › [[clubSettingsCommitteeTab]] (see [Committee](#committee)).

## Families and rebates {#families}

A {{family}} groups members who live together so they get one invoice and family rebates.

1. Open [[navFamilies]]. Type a [[familyName]] and click [[createFamily]].
2. Open the family and add the members **in rebate order**: rank 1 pays full price, rank 2 gets the second-member rebate, and so on.
3. Under [[receivesTheBill]], choose who receives the bill, or click [[addParentOrGuardian]] for a parent who is not a member.
4. Choose the [[deliveryLabel]]. [[billToDeliveryAuto]] is a safe default.

![Families](fig:families)

Use [[familyInvoicePreview]] to check the amounts before you bill.

## Membership fees {#fees}

[[navMembershipFees]] is the price list. Set it up once; it carries over to the next year.

1. Under [[membershipFee]], type a [[feeName]] (for example “Adults”) and an [[feeAmount]], then click [[saveFee]]. Add one fee per kind of dues, such as children, adults, family.
2. When a price changes, do **not** create a new fee: open the fee, enter the new amount and [[priceFrom]] date and click [[saveNewPrice]].
3. Under [[licenseFeeTitle]], set the amount you charge members for their LTF licence, or leave 0.00.
4. Under [[billingsTitle]], click [[addBilling]] only if you bill the membership fee more than once a year (for example a spring bill). Then choose under [[licenseFeeBilling]] which bill carries the licence fee – see [When the licence fee is charged](#license-fee-season).
5. Under [[rebateRules]], click [[addRebate]] for rank 2, 3… Choose [[rebateKindPercent]] or [[rebateKindAmount]]. Tick [[rebateAppliesToLater]] so that every further child gets the same rebate.

![Membership fees](fig:fees)

> [!NOTE]
> The licence fee is added once per member and season, on the bill chosen under [[licenseFeeBilling]]. Family rebates never reduce it.

## Billing the year {#billing}

Once fees and families are ready, billing the whole club takes a few clicks.
{: .lead}

![Membership billing](fig:billing)

<div class="legend" markdown="1">
1. The [[navBilling]] tab.
2. [[billingYear]] and, if your club bills more than once, the billing.
3. [[printPackAction]] – a PDF of all invoices to post or hand over.
4. [[reviewIssueAction]]
5. [[selectReady]]
6. Status filter.
7. A household marked [[billingBlocked]] – open it to see why.
</div>

1. Open [[navFinance]] › [[navBilling]] and choose the [[billingYear]].
2. Look for households marked [[billingBlocked]]. The reason is shown in the row: usually [[chooseBillRecipient]] (for a child) or a missing membership fee. Fix them in [[navFamilies]] or [[navMembershipFees]].
3. Click [[selectReady]].
4. Click [[reviewIssueAction]], check the totals in the confirmation and click [[issueInvoicesAction]].
5. Email invoices are sent at once. For the rest, click [[printPackAction]] and print the PDF.

The households now show [[billingInvoiced]]. They turn [[billingPaid]] when you record the payment.
{: .result}

> [!NOTE]
> A member with a fee of 0.00 gets a bill of 0,00 marked paid, as proof of membership. This does not replace an LTF licence.

## When the licence fee is charged {#license-fee-season}

The Taekwondo season runs from September to September, like the Luxembourg school year. The {{licence fee}} is normally charged with the **first bill of the season**. In the app, however, billings are counted per calendar year ([[billingYear]]), so the first bill of the season is not always [[billingInstallmentNumber|sequence=1]].
{: .lead}

- **One bill a year** (usually in autumn): it opens the season and carries the licence fee. There is nothing to set.
- **Two bills a year**: the spring bill covers the second half of the running season, and the autumn bill opens the new season. The autumn bill is then the **second** bill of the calendar or financial year, and it is the one that should carry the licence fee.

Example: a club bills in February and in October 2026.

| Bill | In the app | Season | Licence fee? |
|---|---|---|---|
| February 2026 | [[billingInstallmentNumber|sequence=1]], label “Spring” | second half of 2025/26 | no – already charged in October 2025 |
| October 2026 | [[billingInstallmentNumber|sequence=2]], label “Autumn” | start of 2026/27 | yes |

To set this up:
{: .proc}

1. Open [[navFinance]] › [[navMembershipFees]] and pick the [[billingYear]] under [[billingsTitle]].
2. Click [[addBilling]] and enter a [[billingLabel]] for the new bill, for example “Autumn”.
3. Under [[licenseFeeBilling]], choose [[billingInstallmentNumber|sequence=2]].

> [!NOTE]
> The app describes this rule in two places. [[navBilling]] says the licence fee is added “on each member's first bill”; [[navMembershipFees]] says “on the billing chosen for that year”. Both mean the same bill: the one chosen under [[licenseFeeBilling]], which is the first bill of the season. A member who joins after that billing has started pays the licence fee on the next bill. Invoices already issued stay as they are.

## Recording a payment {#record-payment}

1. Open [[navFinance]] › [[navInvoices]] and click [[recordPaymentButton]] next to the invoice.
2. Check the [[paymentDateLabel]]. It defaults to today.
3. [[paymentReferenceLabel]] is pre-filled with the invoice number, so it matches the bank transfer.
4. Choose the [[paymentMethodLabel]] and click [[recordPaymentButton]].

![Recording a payment](fig:record-payment)

> [!TIP]
> Ask parents to put the invoice number in the transfer communication. It makes bank matching (below) almost automatic.

## Paying the LTF {#pay-ltf}

LTF invoices for your licence orders are in [[navInvoices]] with the [[financeLedgerLabel]] filter set to LTF. Pay them by bank transfer with the invoice number as communication. LTF Finance records the payment and activates the licences.

> [!NOTE]
> The [[Common.payNow]] button currently runs **test payments** only. Online payment is not yet used for real payments, and the payment provider for the future has not been decided. Until then, pay by bank transfer.

## Other income and expenses {#income-expenses}

- [[navIncome]]: click [[recordIncomeAction]] for subsidies, donations, sponsoring and other income. Attach a [[receiptLabel]] if you have one.
- [[navExpenses]]: the page for the club's own expenses. Its subtitle reads [[LtfFinance.clubExpensesSubtitle]] Click [[recordExpenseAction]]. The form confirms that the expense goes to your club's accounts, not the federation's: [[LtfFinance.clubExpenseFormSubtitle]] Fill in [[expenseDateLabel]], [[expenseCategoryLabel]], [[expenseDescriptionLabel]], [[expensePayeeLabel]] and [[expenseAmountLabel]]. Tick [[expenseAlreadyPaidLabel]] if the money has left the account and choose the [[paymentMethodLabel]]. You can attach a [[receiptLabel]] (PDF or image).

Wrong entry? Open it and use [[voidIncomeAction]] or [[voidExpenseAction]]. Voided entries stay visible for the auditors.

## Bank reconciliation {#bank}

[[navBank]] compares your bank statement with the books. No bank connection is used: you upload a file.

1. Download a CSV or CAMT.053 statement from your online banking.
2. In [[navBank]], click under [[bankFileLabel]] to choose the file, then click [[importStatementAction]].
3. Open the statement. Match each line to a payment, income or expense, or mark bank-only items such as fees as ignored.

![Bank reconciliation](fig:bank)

## Reports for the general assembly {#reports}

[[navReports]] prepares the income statement, the cash movement and a budget comparison for a [[reportYearLabel]]. Enter the [[openingCashTitle]] once per year and click [[saveOpeningCashAction]]. [[exportExcelAction]] downloads everything as a spreadsheet for the auditors.

![Financial reports](fig:reports)

## Subsidies {#subsidies}

[[navSubsidies]] prepares the yearly MyGuichet file for the ministry and fills extraordinary grant forms. The app does not send anything: you still file the application yourself.
{: .lead}

![The subsidies page](fig:subsidies)

1. Choose the [[subsidiesYear]]. The default filing deadline is 30 September.
2. Work through [[subsidiesChecklist]] until every point is green.
3. Upload the [[subsidiesRibFile]].
4. Under [[subsidiesCoaches]], set each coach's [[subsidiesEqf]] and upload the diploma. Coaches are appointed in [[navSettings]] › [[clubSettingsTrainersTab]].
5. Download the [[subsidiesTrainingList]] and the [[subsidiesTrainersList]]. The president or a delegated committee member certifies them.
6. Under [[subsidiesYouth]], type each child's national number and export the [[subsidiesExportYouth]].
7. Copy the [[subsidiesEffectifs]] table into MyGuichet.
8. After filing, record [[subsidiesSubmittedOn]], and later [[subsidiesPaidOn]] and [[subsidiesPaidAmount]]. The next time a president, vice president, treasurer or secretary opens the page, the amount is added to club income.

The scores are calculated as follows:

| Score | Rule used by the app |
|---|---|
| [[subsidiesVolunteerPoints]] | fewer than 50 licensed members: 150 · 50 to 200: 300 · more than 200: 500 |
| [[subsidiesCoachPoints]] | per coach, by qualification: EQF 1 and 2 = 20 · EQF 2 bis and 3 = 40 · EQF 4 = 60 · EQF 5 and 6 = 100 |
| [[subsidiesQualite]] | €150 per licensed athlete under 16 |

For trips to a championship or an international cup, use [[subsidiesExtraordinary]]: choose the [[subsidiesKind]], add athletes and officials, enter travel, stay and entry costs, click [[subsidiesCreateCase]] and then [[subsidiesDownloadForm]].

# Club admin: training and promotion {#club-training}

<p class="roles"><span class="chip">Club admin</span><span class="chip">Coach</span><span class="chip">Club management module</span></p>

[[navTraining]] has six tabs: [[trainingThisWeek]], [[trainingMonth]], [[trainingYear]], [[trainingTimetable]], [[trainingHolidays]] and [[trainingCoachHours]].

## The week {#training-week}

![The training week](fig:training-week)

<div class="legend" markdown="1">
1. The training tabs.
2. [[trainingAddSession]] – for a class on a school holiday or any extra date.
3. [[trainingOpenRoll]] – see [Taking the roll](#roll).
4. [[trainingCancel]] – for example when the hall is closed. Club admins only.
</div>

## Setting up the timetable {#timetable}

Do this once at the start of the season. Each class then repeats every week until the end date.
{: .lead}

1. Open [[trainingTimetable]].
2. Under [[trainingAddClass]], enter [[trainingClassName]], [[trainingAudience]], [[trainingWeekday]], [[trainingStarts]] and [[trainingEnds]], and the season [[subsidiesFrom]] / [[subsidiesTo]].
3. Keep [[trainingSkipPublic]] and [[trainingSkipSchool]] ticked if the club pauses then.
4. Tick [[trainingCountsUnder16]] for classes that belong on the Qualité+ training list.
5. Choose the [[trainingUsualCoaches]] and the [[trainingRegulars]]. The regulars are pre-selected on every roll.
6. Click [[trainingAddClass]].

![Adding a weekly class](fig:timetable)

## Holidays {#holidays}

[[trainingHolidays]] lists Luxembourg's [[trainingPublicHolidays]] for the year. Add your [[trainingSchoolHolidays]] with [[trainingAddHoliday]]. Classes that skip holidays are left out automatically on those days.

![Public and school holidays](fig:holidays)

## Month and year views {#month-year}

[[trainingMonth]] shows the classes as a calendar; [[trainingYear]] shows one mark per class over the whole season. Open a day to take the roll.

![The month view](fig:month)

## Coach pay {#coach-pay}

[[trainingCoachHours]] adds up what each coach is owed.

1. Set [[trainingPayFrequency]] and the paydays, then click [[trainingSavePaydays]].
2. Under [[trainingPayRateTitle]], choose for each coach [[trainingBasisHourly]] or [[trainingBasisUnit]], enter the [[trainingRateColumn]] and click [[trainingSaveRate]].
3. Under [[trainingOutingsTitle]], add a row for a tournament, fuel or a hotel the club pays.

![Coach pay](fig:coach-pay)

> [!NOTE]
> Only held classes (roll saved) are paid. Every coach listed on a class gets that class in full.

## Promotion rules and belt tests {#promotion}

[[navPromotion]] says how many training hours a student needs before the next grade. Hours are counted from the student's last grade.
{: .lead}

![Promotion rules](fig:promotion)

To set a rule:
{: .proc}

1. Choose the [[trainingNextGrade]].
2. Enter the [[trainingRequiredHours]].
3. Under [[trainingHoursCount]], choose [[trainingHoursAll]] or one kind of class.
4. Click [[trainingSaveRule]].

To run a belt test:
{: .proc}

1. Under [[trainingBeltTests]], enter the name and [[trainingDate]] and click [[trainingAddBeltTest]].
2. Click [[trainingOpenTest]]. Candidates show their [[trainingHoursSoFar]] and whether they are [[trainingReady]] or [[trainingShort]].
3. On the day, click [[trainingPass]] or [[trainingFail]] for each candidate.

A pass records the new grade on the member's [[memberGradesTab]] tab.
{: .result}

![A belt test](fig:belt-test)

# Club admin: the club shop {#shop}

<p class="roles"><span class="chip">Club admin</span><span class="chip">Club management module</span></p>

[[navShop]] sells doboks, belts and protectors at the club desk. It has three tabs: [[shopTabSell]], [[shopTabItems]] and [[shopTabSales]].

## Adding an item {#shop-item}

1. Open [[shopTabItems]] and click [[shopAddItem]].
2. Tap [[shopPhoto]] to take a photo with your phone.
3. Enter [[shopItemName]], [[shopCategory]], [[shopPurchasePrice]] and [[shopSalePrice]].
4. Tick [[shopTrackStock]] if you want the app to stop selling when the shelf is empty.
5. Click [[saveItem]].
6. Under [[shopSizes]], add each size with its own prices and the number [[shopOnShelfNow]]. [[shopWarnBelow]] flags low stock.

![Editing an item with sizes](fig:shop-item)

When a box of goods arrives, open the item and use [[shopGoodsArrived]]. Then [[shopPrintStickersNext]] prints QR stickers on Avery Zweckform L7121-25 sheets.

## Selling at the desk {#shop-sell}

![The desk sale](fig:shop-sell)

<div class="legend" markdown="1">
1. Shop tabs.
2. [[shopScanCamera]] – scan the QR sticker on the item.
3. [[shopBasket]]
</div>

1. Open [[shopTabSell]]. Scan the sticker or tap the item and its size.
2. Under [[shopSoldTo]], search the member, or choose [[shopWalkIn]].
3. Choose [[shopPayCash]], [[shopPayCard]], [[shopPayOther]] or [[shopPayLater]].
4. Click [[shopCompleteSale]].

Unpaid sales wait in [[shopTabSales]] until you click [[shopMarkPaidCash]] or [[shopMarkPaidCard]].

## Counting stock {#shop-count}

Before a stock count, click [[shopPrintCountSheet]] on [[shopTabItems]] and then [[shopTakeCountSheet]]. Tick the printed sheet against the cupboard. [[shopPrintCatalogue]] prints a price list for the notice board.

# Calendar {#calendar}

<p class="roles"><span class="chip">All roles</span><span class="chip">Event calendar module</span></p>

The calendar is shared by the LTF and all clubs. Each event decides who can see it.
{: .lead}

![The calendar](fig:calendar)

<div class="legend" markdown="1">
1. [[Events.calendarNew]]
2. [[Events.calendarPrevMonth]]
3. [[Events.calendarNextMonth]]
4. In the menu, the number counts upcoming events; [[Events.calendarNavNew]] means there are events you have not opened yet.
</div>

## Creating an event {#new-event}

1. Click [[Events.calendarNew]].
2. Enter [[Events.calendarFieldTitle]], [[Events.calendarFieldStart]] and [[Events.calendarFieldEnd]] (or tick [[Events.calendarAllDay]]), [[Events.calendarFieldVenue]] and [[Events.calendarFieldAddress]].
3. Choose the [[Events.calendarFieldKind]]: [[Events.calendarKind_calendar]], [[Events.calendarKind_kyorugi]] or [[Events.calendarKind_poomsae]].
4. Under [[Events.calendarFieldVisibility]], choose who sees it (table below).
5. Click [[Events.calendarSave]].

![A new club event](fig:event-form)

<div class="legend" markdown="1">
1. [[Events.calendarFieldVisibility]] – the description under each choice tells you exactly who will see the event.
</div>

| Choice | Club event: who sees it | LTF event: who sees it |
|---|---|---|
| [[Events.calendarVisibility_public]] | members, admins and coaches of this club, plus LTF Admin | everyone signed in |
| [[Events.calendarVisibility_internal]] | this club's admins and coaches | LTF Admin, LTF Finance, club admins and coaches |
| [[Events.calendarVisibility_private]] | this club's admins only | LTF Admins only |
| [[Events.calendarVisibility_shared]] | LTF and every club's admins and coaches, plus this club's members | LTF and every club's admins and coaches |
| [[Events.calendarVisibility_presidents]] | – | LTF Admins and the current president of each club ticked under [[Events.calendarAudienceClubs]] |

> [!NOTE]
> The descriptions on screen also mention members. Members do not have a login today (see [Roles](#roles)), so in practice an event is seen by the staff listed.

> [!TIP]
> Planning a club tournament? Use [[Events.calendarVisibility_shared]] so other clubs see the date early and avoid clashes.

## Reminders {#reminders}

Open an event, choose a date in [[Events.calendarReminderOn]] and click [[Events.calendarReminderSave]]. On that day a reminder pops up when you are in the app. Click [[Events.calendarReminderSnooze]] or [[Events.calendarReminderGotIt]]. [[Events.calendarReminderClear]] removes it.

# Club admin: club profile, committee and admins {#club-settings}

<p class="roles"><span class="chip">Club admin</span></p>

[[navSettings]] has four tabs.

![Club profile](fig:club-profile)

<div class="legend" markdown="1">
1. [[clubSettingsProfileTab]] – address, email, website, IBAN, language.
2. [[clubSettingsTrainersTab]]
3. [[clubSettingsCommitteeTab]]
4. [[clubSettingsPublicationTab]]
</div>

## Profile {#profile-tab}

Keep the [[clubEmailLabel]], [[clubWebsiteLabel]], [[ibanLabel]] and [[clubLanguageLabel]] correct: they are printed on the invoices you send to members, and the LTF writes to you in that language. Click [[saveClub]].

## Coaches {#coaches-tab}

1. Open [[clubSettingsTrainersTab]].
2. Click a member on the left, then click the [[trainersDropColumn]] box on the right.
3. If the member has no email yet, enter one in [[trainerEmailPlaceholder]] and click [[trainerAdd]]. The coach receives a welcome email to set a password.
4. Tick [[trainerQualite]] for coaches who belong in the Qualité+ file.

![Coaches](fig:club-coaches)

> [!NOTE]
> Coaches must be active adult members of your own club. [[trainerRemove]] removes the coach role; the person stays a member.

## Committee {#committee}

The committee decides who may record payments, and its president receives meetings for club presidents.

1. Open [[clubSettingsCommitteeTab]]. If needed, click [[createCommittee]].
2. Under [[committeeOffices]], choose an office such as President, enter [[committeeStart]] and click [[addMandate]].
3. Click the office, then click the member who holds it.

![The club committee](fig:committee)

> [!WARNING]
> When the treasurer changes, update the committee **before** the next payment run. Without a current office nobody in the club can record payments.

## Publication consent {#consent}

[[clubSettingsPublicationTab]] shows a grid of members and channels (website, print media, Facebook, Instagram…). Each tick is saved immediately. Before posting photos, tick the channels and download [[publicationPdfList]] to get the list of members who must not be shown.

## Club admins {#club-admins}

[[navClubAdmins]] decides who runs the club in the app.

1. Open [[navClubAdmins]]. Click your club on the right to list its members.
2. Click a member, then click the club again.
3. If the member has no login yet, enter an email under [[adminEmailTitle]]. A welcome email with a set-password link is sent.

![Club admins](fig:club-admins)

Under [[adminsCurrentTitle]] you can remove someone who should no longer administer the club. [[adminsLicensedOnly]] limits the list to members with a valid licence.

# The club year at a glance {#club-year}

A checklist for the busy volunteer. Each line links to the section that explains it.
{: .lead}

| When | Task | Section |
|---|---|---|
| Summer | Update committee, coaches, club profile | [Committee](#committee) |
| Before the season | Timetable, holidays, promotion rules | [Timetable](#timetable) |
| September | Fees and family rebates | [Membership fees](#fees) |
| September | Order licences for all athletes | [Ordering licences](#order-licences) |
| September | Pay the LTF invoice | [Paying the LTF](#pay-ltf) |
| Once paid | Print licence cards | [Printing cards](#print-cards) |
| By 30 September | Subsidy file | [Subsidies](#subsidies) |
| October | Bill membership fees | [Billing](#billing) |
| Every class | Take the roll | [Taking the roll](#roll) |
| Monthly | Record payments, import the bank statement | [Bank](#bank) |
| Before a grading | Belt test | [Promotion](#promotion) |
| Year end | Reports for the general assembly | [Reports](#reports) |

# LTF Admin {#ltf-admin}

<p class="roles"><span class="chip">LTF Admin</span></p>

The federation menu ([[Common.navGroupFederation]]) contains [[LtfAdmin.navOverview]], [[LtfAdmin.navClubs]], [[LtfAdmin.navClubAdmins]], [[LtfAdmin.navMemberTransfers]], [[LtfAdmin.navMembers]], [[LtfAdmin.navLicenses]], [[LtfAdmin.navLicenseCards]], [[LtfAdmin.navLicenseCardPrintJobs]], [[LtfAdmin.navLicenseTypes]], [[LtfAdmin.navPrinterProfiles]] and [[LtfAdmin.navSettings]], plus [[LtfAdmin.navCommittee]] and [[LtfAdmin.navCalendar]].

## Federation overview {#ltf-overview}

The overview counts clubs, members and licences, and its action queue lists clubs without an admin, pending transfers with a fee and members waiting for a licence.

![The LTF overview](fig:ltf-overview)

## Clubs and club admins {#ltf-clubs}

[[LtfAdmin.navClubs]] lists all clubs. Open a club to edit its details, upload its logos (for invoices, printing and screens) and see its members.

![A club seen by the LTF](fig:ltf-club)

[[LtfAdmin.navClubAdmins]] works like the club page described in [Club admins](#club-admins), but for every club.

## Members, licences and transfers {#ltf-licences}

- [[LtfAdmin.navMembers]] and [[LtfAdmin.navLicenses]] show all clubs at once; use the club selector to narrow down.
- [[LtfAdmin.navMemberTransfers]] lists recent club changes, transfers with a fee and possible {{club tourists}} – members who changed club unusually often.

![Federation transfers](fig:ltf-transfers)

## Licence cards {#ltf-cards}

[[LtfAdmin.navLicenseCards]] holds the card templates. Open a template in the designer to place the photo, name, grade, licence number and QR code. Publish a version and set it as default: club admins print with it. [[LtfAdmin.navLicenseCardPrintJobs]] shows every print job of every club; [[LtfAdmin.navPrinterProfiles]] stores the X/Y offsets of known printers.

![The card designer](fig:designer)

## Federation settings {#ltf-settings}

[[LtfAdmin.navSettings]] holds the federation address and IBAN, the [[clubTouristThresholdLabel]] and the import option [[importPrefixRewriteLabel]].

![Federation settings](fig:ltf-settings)

# LTF Finance {#ltf-finance}

<p class="roles"><span class="chip">LTF Finance</span></p>

The finance menu contains [[LtfFinance.navOverview]], [[LtfFinance.navOrders]], [[LtfFinance.navInvoices]], [[LtfFinance.navPayments]], [[LtfFinance.navIncome]], [[LtfFinance.navExpenses]], [[LtfFinance.navBank]], [[LtfFinance.navReports]], [[LtfFinance.navAuditLog]] and [[LtfFinance.navLicenseSettings]].

![The finance overview](fig:fin-overview)

## Licence prices and ordering windows {#license-settings}

In [[LtfFinance.navLicenseSettings]], the tab [[settingsTabLicenseTypes]] defines each type and its [[currentYearWindowLabel]] and [[nextYearWindowLabel]]. [[settingsTabLicensePrices]] stores prices with history: a new price applies from its [[priceEffectiveFromLabel]] date.

![Licence settings](fig:fin-settings)

## Club fees {#club-fees}

[[settingsTabClubFees]] lists what the LTF charges clubs (affiliation, insurance…), [[clubFeeCadenceAnnual]], [[clubFeeCadencePerMember]], [[clubFeeCadencePerEvent]] or [[clubFeeCadenceOneOff]]. On the [[settingsTabBilling]] tab, choose the [[clubFeeBillingYearLabel]], the fees and the clubs, and click [[clubFeeBillingSubmitYear|year=2026]]. A club already invoiced for that year is skipped, so you can run it again safely. [[clubFeeBillingRecurringLabel]] repeats the billing monthly or yearly.

![Billing club fees](fig:fin-billing)

## Invoices, payments and credit notes {#ltf-invoices}

1. Open [[LtfFinance.navInvoices]] and click an invoice.
2. When the club's transfer has arrived, click [[recordPaymentButton]]. Paid licences become active.
3. To reduce what a club owes, enter a [[creditNoteAmountLabel]] and [[creditNoteReasonLabel]] and click [[addCreditNoteAction]].
4. To chase an unpaid invoice, click [[sendReminderAction]]. [[lastRemindedAtLabel]] shows when you last did.

![Invoice details with credit notes](fig:fin-invoice)

## Federation books {#ltf-books}

[[LtfFinance.navIncome]], [[LtfFinance.navExpenses]], [[LtfFinance.navBank]] and [[LtfFinance.navReports]] work like the club pages in [Club admin: money](#club-money), for the federation's own accounts. [[LtfFinance.navAuditLog]] records who changed what.

![Federation reports](fig:fin-reports)

# Modules (technical administrator) {#ops}

<p class="roles"><span class="chip">Superuser</span></p>

The technical administrator opens the [[Common.openOpsConsole]]. Under Modules, a signed product code from the LTF is entered and redeemed, and each club is given the modules it may use. The catalogue also lists modules that are not shipped yet, such as federation inventory and tournaments; they cannot be switched on.

![Ops – modules](fig:ops-modules)

# Questions and troubleshooting {#faq}

### I can't sign in.
Check the username (it is not always your email) and the password. If the page says your email isn't verified, see [Verifying your email](#verify-email). If you forgot your password, see [Forgotten password](#forgotten-password).

### Can members or parents sign in?
No. The app is currently a management tool for club and federation staff only. Members and parents have no login; their club keeps their data up to date. Member access may come later.

### A menu item described here is missing.
Your role or your club's modules do not include it. See [Roles](#roles) and [Modules](#modules).

### I see the wrong club.
Choose your club in the club selector at the top of the page.

### “Only the president, vice president, treasurer…” appears when I record a payment.
You do not hold a current committee office. Ask the president to update the [Committee](#committee).

### A household is “Blocked” in billing.
Read the reason in the row. Usually a child needs a bill recipient (see [Families](#families)) or no membership fee is set (see [Membership fees](#fees)).

### I can't choose a licence type when ordering.
The reason is written next to the type: the ordering window is closed, there is no price, or the members already have that licence. Windows and prices are set by LTF Finance.

### The printed card is shifted.
Print at 100 % and use a printer profile with the right offset (see [Printing licence cards](#print-cards)).

### Dates look like mm/dd/yyyy.
Date fields follow your browser's language settings. Set your browser to English (United Kingdom), Luxembourgish, German or French to see day/month/year.

### The roll shows nobody.
On a new class, add students under [[trainingAddStudents]] and save. Next time, set them as [[trainingRegulars]] in the [[trainingTimetable]].

### The calendar menu shows a number.
It is the number of upcoming events you can see. The word [[Events.calendarNavNew]] appears when some of them are new to you.

### Where are my data protection rights?
If you have a login, use the page described in [Privacy and your data](#privacy). Members and parents ask their club or the LTF, who can export or correct their data.

### Can we pay online?
Not yet. The [[Common.payNow]] button runs test payments only. Pay LTF invoices by bank transfer (see [Paying the LTF](#pay-ltf)).
