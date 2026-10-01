/**
 * Generates docs/LTF-License-Manager-Modular-Extension.docx
 *
 * Requires the `docx` package (npm install docx).
 * Run from the repo root: node docs/generate-modular-extension-docx.mjs
 */
import fs from "fs";
import {
  AlignmentType,
  BookmarkEnd,
  BookmarkStart,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  InternalHyperlink,
  LevelFormat,
  Packer,
  PageBreak,
  PageNumber,
  Paragraph,
  ShadingType,
  TabStopType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  UnderlineType,
  VerticalAlign,
  WidthType,
} from "docx";

const PAGE_W = 11906;
const PAGE_H = 16838;
const MARGIN = 1134;
const CONTENT_W = PAGE_W - MARGIN * 2;

const CYAN = "0B7A9A";
const NAVY = "16324F";
const MUTED = "5B6570";
const RULE = "C5D0D6";
const ALT_BG = "F7FAFB";

const border = { style: BorderStyle.SINGLE, size: 4, color: RULE };
const borders = { top: border, bottom: border, left: border, right: border };

function p(text, opts = {}) {
  return new Paragraph({
    spacing: { after: opts.after ?? 160, before: opts.before ?? 0, line: 276 },
    alignment: opts.align,
    keepNext: opts.keepNext,
    children: [
      new TextRun({
        text,
        font: "Arial",
        size: opts.size ?? 22,
        bold: opts.bold,
        italics: opts.italics,
        color: opts.color ?? "222222",
      }),
    ],
  });
}

let bookmarkSeq = 1;

function markedRun(text, bookmarkId, runOpts) {
  const num = bookmarkSeq++;
  return [new BookmarkStart(bookmarkId, num), new TextRun({ text, ...runOpts }), new BookmarkEnd(num)];
}

function h1(text, bookmarkId) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    keepNext: true,
    border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: CYAN, space: 4 } },
    spacing: { before: 360, after: 200 },
    children: markedRun(text, bookmarkId, { font: "Arial", size: 32, bold: true, color: NAVY }),
  });
}

function h2(text, bookmarkId) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    keepNext: true,
    spacing: { before: 280, after: 140 },
    children: markedRun(text, bookmarkId, { font: "Arial", size: 26, bold: true, color: CYAN }),
  });
}

function h3(text, bookmarkId) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    keepNext: true,
    spacing: { before: 200, after: 100 },
    children: markedRun(text, bookmarkId, { font: "Arial", size: 24, bold: true, color: NAVY }),
  });
}

function bullet(text, ref = "bullets") {
  return new Paragraph({
    numbering: { reference: ref, level: 0 },
    spacing: { after: 80, line: 276 },
    children: [new TextRun({ text, font: "Arial", size: 22, color: "222222" })],
  });
}

function tocEntry(label, anchor, level = 0) {
  return new Paragraph({
    spacing: { after: 60, line: 276 },
    indent: { left: level * 360 },
    children: [
      new InternalHyperlink({
        anchor,
        children: [
          new TextRun({
            text: label,
            font: "Arial",
            size: level === 0 ? 22 : 20,
            bold: level === 0,
            color: level === 0 ? NAVY : CYAN,
            underline: { type: UnderlineType.SINGLE, color: CYAN },
          }),
        ],
      }),
    ],
  });
}

function cell(text, width, opts = {}) {
  return new TableCell({
    borders,
    width: { size: width, type: WidthType.DXA },
    shading: opts.fill ? { fill: opts.fill, type: ShadingType.CLEAR } : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    verticalAlign: VerticalAlign.CENTER,
    children: [
      new Paragraph({
        children: [
          new TextRun({
            text,
            font: "Arial",
            size: opts.size ?? 18,
            bold: opts.bold,
            color: opts.color ?? "222222",
          }),
        ],
      }),
    ],
  });
}

function table(headers, rows, widths) {
  const headerRow = new TableRow({
    tableHeader: true,
    cantSplit: true,
    children: headers.map((h, i) =>
      cell(h, widths[i], { bold: true, color: "FFFFFF", fill: CYAN, size: 18 }),
    ),
  });
  const dataRows = rows.map(
    (row, r) =>
      new TableRow({
        cantSplit: true,
        children: row.map((c, i) =>
          cell(String(c), widths[i], { fill: r % 2 === 1 ? ALT_BG : "FFFFFF", size: 18 }),
        ),
      }),
  );
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: widths,
    rows: [headerRow, ...dataRows],
  });
}

function spacer(after = 200) {
  return new Paragraph({ spacing: { after }, children: [] });
}

function pageBreak() {
  return new Paragraph({ children: [new PageBreak()] });
}

function brandedHeader() {
  return new Header({
    children: [
      new Paragraph({
        border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: CYAN, space: 8 } },
        spacing: { after: 120 },
        children: [
          new TextRun({
            text: "Luxembourg Taekwondo Federation  \u00b7  License Manager",
            font: "Arial",
            size: 18,
            color: MUTED,
          }),
        ],
      }),
    ],
  });
}

function emptyHeader() {
  return new Header({ children: [new Paragraph({ children: [] })] });
}

function brandedFooter() {
  return new Footer({
    children: [
      new Paragraph({
        border: { top: { style: BorderStyle.SINGLE, size: 8, color: RULE, space: 8 } },
        spacing: { before: 80 },
        tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_W }],
        children: [
          new TextRun({
            text: "Modular extension plan  \u00b7  Design only  \u00b7  Confidential",
            font: "Arial",
            size: 16,
            color: MUTED,
          }),
          new TextRun({
            text: "\tPage ",
            font: "Arial",
            size: 16,
            color: MUTED,
          }),
          new TextRun({ children: [PageNumber.CURRENT], font: "Arial", size: 16, color: MUTED }),
          new TextRun({ text: " of ", font: "Arial", size: 16, color: MUTED }),
          new TextRun({ children: [PageNumber.TOTAL_PAGES], font: "Arial", size: 16, color: MUTED }),
        ],
      }),
    ],
  });
}

const wMeta = [2800, CONTENT_W - 2800];
const w2 = [3200, CONTENT_W - 3200];
const w3 = [2200, 3800, CONTENT_W - 6000];
const w4 = [2100, 3200, 1600, CONTENT_W - 6900];
const wMoney = [2600, 2600, CONTENT_W - 5200];
const wBranch = [700, 3900, 3000, CONTENT_W - 7600];
const wIds = [3200, 2200, CONTENT_W - 5400];

const toc = [
  ["1. Purpose", "s1", 0],
  ["2. Baseline (v0.8.0)", "s2", 0],
  ["3. Naming", "s3", 0],
  ["4. Two switches", "s4", 0],
  ["4.1 Install entitlement", "s4-1", 1],
  ["4.2 Club assignment", "s4-2", 1],
  ["4.3 Who turns what on", "s4-3", 1],
  ["5. What stays Core", "s5", 0],
  ["6. Shared engines", "s6", 0],
  ["7. Module catalog", "s7", 0],
  ["7.1 Install-wide", "s7-1", 1],
  ["7.2 Per club", "s7-2", 1],
  ["8. Money flows", "s8", 0],
  ["9. How the domains relate", "s9", 0],
  ["9.1 Event calendar and tournaments", "s9-1", 1],
  ["9.2 Tournaments: one core, two sports", "s9-2", 1],
  ["9.3 Inventory", "s9-3", 1],
  ["10. Ops console \u2014 Modules", "s10", 0],
  ["11. First step \u2014 modular extension capabilities", "s11", 0],
  ["11.1 GitHub branch", "s11-1", 1],
  ["11.2 Version", "s11-2", 1],
  ["11.3 What ships", "s11-3", 1],
  ["11.4 Enforcement", "s11-4", 1],
  ["11.5 Product codes", "s11-5", 1],
  ["12. GitHub branch plan", "s12", 0],
  ["13. Why this delivery order", "s13", 0],
  ["14. Rules on every branch", "s14", 0],
  ["15. Risks to decide later, not in step 0", "s15", 0],
  ["16. Summary", "s16", 0],
];

const doc = new Document({
  title: "LTF License Manager \u2014 Modular extension of the application",
  creator: "Luxembourg Taekwondo Federation",
  description:
    "Architecture and delivery plan for modular entitlements, product modules, per-club assignment, and GitHub branches.",
  subject: "Modular extension plan",
  keywords: "LTF, modules, entitlements, product code, kyorugi, poomsae, inventory",
  styles: {
    default: { document: { run: { font: "Arial", size: 22 } } },
    paragraphStyles: [
      {
        id: "Heading1",
        name: "Heading 1",
        basedOn: "Normal",
        next: "Normal",
        quickFormat: true,
        run: { size: 32, bold: true, font: "Arial", color: NAVY },
        paragraph: { spacing: { before: 360, after: 200 }, outlineLevel: 0 },
      },
      {
        id: "Heading2",
        name: "Heading 2",
        basedOn: "Normal",
        next: "Normal",
        quickFormat: true,
        run: { size: 26, bold: true, font: "Arial", color: CYAN },
        paragraph: { spacing: { before: 280, after: 140 }, outlineLevel: 1 },
      },
      {
        id: "Heading3",
        name: "Heading 3",
        basedOn: "Normal",
        next: "Normal",
        quickFormat: true,
        run: { size: 24, bold: true, font: "Arial", color: NAVY },
        paragraph: { spacing: { before: 200, after: 100 }, outlineLevel: 2 },
      },
    ],
    characterStyles: [
      {
        id: "Hyperlink",
        name: "Hyperlink",
        basedOn: "DefaultParagraphFont",
        run: { color: CYAN, underline: { type: UnderlineType.SINGLE } },
      },
    ],
  },
  numbering: {
    config: [
      {
        reference: "bullets",
        levels: [
          {
            level: 0,
            format: LevelFormat.BULLET,
            text: "\u2022",
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } },
          },
        ],
      },
      {
        reference: "rules",
        levels: [
          {
            level: 0,
            format: LevelFormat.BULLET,
            text: "\u2022",
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } },
          },
        ],
      },
      {
        reference: "order",
        levels: [
          {
            level: 0,
            format: LevelFormat.BULLET,
            text: "\u2022",
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } },
          },
        ],
      },
    ],
  },
  sections: [
    {
      properties: {
        titlePage: true,
        page: {
          size: { width: PAGE_W, height: PAGE_H },
          margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN },
        },
      },
      headers: {
        first: emptyHeader(),
        default: brandedHeader(),
      },
      footers: {
        first: brandedFooter(),
        default: brandedFooter(),
      },
      children: [
        p("LUXEMBOURG TAEKWONDO FEDERATION", { size: 20, color: CYAN, bold: true, after: 80 }),
        new Paragraph({
          spacing: { after: 80 },
          border: { bottom: { style: BorderStyle.SINGLE, size: 18, color: CYAN, space: 8 } },
          children: [
            new TextRun({
              text: "Modular extension of the application",
              font: "Arial",
              size: 48,
              bold: true,
              color: NAVY,
            }),
          ],
        }),
        p(
          "Platform, product modules, per-club assignment, and GitHub branch plan. Includes the first step: modular extension capabilities.",
          { size: 24, color: MUTED, after: 280, before: 160 },
        ),
        table(
          ["Field", "Value"],
          [
            ["Document type", "Architecture and delivery plan"],
            ["Application", "LTF License Manager"],
            ["Baseline", "v0.8.0 on feature/ui-refresh-and-designer"],
            ["First platform release", "v0.9.0 \u2014 module entitlements"],
            ["Date", "6 September 2026"],
            ["Status", "Design only \u2014 no implementation in this document"],
            ["Audience", "Superuser, product owner, implementer"],
          ],
          wMeta,
        ),
        spacer(280),
        p(
          "Do not call a software entitlement a \u201clicense.\u201d That word already means a member\u2019s yearly LTF license. In the ops UI use Modules and product code.",
          { italics: true, color: MUTED, after: 200 },
        ),
        p(
          "Implementation starts only when requested, beginning with feature/module-entitlements. Do not merge to main unless asked.",
          { italics: true, color: MUTED, after: 200 },
        ),

        pageBreak(),

        new Paragraph({
          spacing: { after: 200 },
          border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: CYAN, space: 4 } },
          children: [
            new TextRun({
              text: "Contents",
              font: "Arial",
              size: 32,
              bold: true,
              color: NAVY,
            }),
          ],
        }),
        p("Click a heading to jump to that section.", { size: 20, color: MUTED, after: 200 }),
        ...toc.map(([label, anchor, level]) => tocEntry(label, anchor, level)),

        pageBreak(),

        h1("1. Purpose", "s1"),
        p(
          "This document describes how LTF License Manager can grow as a platform with named modules, without turning Core into a plugin marketplace. Superuser operations (the ops console shipped in v0.8.0) remain the unlock desk. Federation work (LTF Admin, Club Admin) stays separate from product entitlements.",
        ),
        p(
          "The first delivery is not a calendar, shop, or tournament. It is the modular capability itself: product codes, install entitlements, per-club assignment, API enforcement, and hidden navigation. Every later module is developed on its own GitHub branch.",
        ),

        h1("2. Baseline (v0.8.0)", "s2"),
        p("Core already includes:"),
        bullet("Members, clubs, LTF licenses and cards, print."),
        bullet("LTF Finance: orders, invoices, payments, club fees billed from the federation to clubs."),
        bullet(
          "Member transfers, club-admin assignment by LTF Admin, Club Admin rubber-band assignment of home-club members.",
        ),
        bullet("Ops console for Django superusers: sessions, health, security, users, queries, translations, jobs, audit."),
        p(
          "New work must never activate an LTF license unless the line is a real license. Club-fee invoices already follow that rule; module invoices must as well.",
        ),

        h1("3. Naming", "s3"),
        p(
          "Do not call a software entitlement a \u201clicense.\u201d That word already means a member\u2019s yearly LTF license.",
        ),
        table(
          ["Use", "Do not use"],
          [
            ["Module", "Software license"],
            ["Entitlement / product code", "License key (ambiguous)"],
            ["Unlock / assign to club", "License the club"],
          ],
          w2,
        ),
        spacer(160),
        p("In the ops UI: Modules and product code. Never \u201csoftware licenses.\u201d"),

        h1("4. Two switches", "s4"),
        h2("4.1 Install entitlement", "s4-1"),
        p(
          "The superuser pastes a signed product code on ops. The payload lists modules, expiry, optional caps, and an install identifier. If this running copy did not buy Kyorugi, nobody \u2014 no club, no LTF user \u2014 can open it.",
        ),
        h2("4.2 Club assignment", "s4-2"),
        p(
          "After the install is entitled, Superuser (later optionally LTF Admin) turns the module on or off for named clubs. Example: Club management is entitled for the federation, on for Club A, off for Club B. Club B keeps today\u2019s LTF license flow only.",
        ),
        p(
          "APIs return 403 when a module is locked. Navigation and routes hide locked modules. Federation roles still decide who may act inside an unlocked module. Unlocking Club management does not grant LTF Admin powers.",
        ),
        h2("4.3 Who turns what on", "s4-3"),
        bullet("Superuser: paste product code; see module status; assign modules to clubs."),
        bullet(
          "LTF Admin (if delegated): assign already-entitled modules to clubs. Cannot invent a module the install did not buy.",
        ),
        bullet(
          "Club Admin: sees Event calendar, Club management, shop, or \u201chost this tournament\u201d only if that club is assigned. Never enters product codes.",
        ),

        h1("5. What stays Core", "s5"),
        p("Not a paid module:"),
        bullet("Auth, members, clubs, LTF licenses and cards, print."),
        bullet("LTF Finance books and federation club fees (federation invoices clubs)."),
        bullet("Transfers and existing club-admin assignment."),
        bullet("Ops console (always available to is_superuser)."),
        p("Modules add capabilities beside Core. They do not replace it."),

        h1("6. Shared engines", "s6"),
        p(
          "Some capabilities are libraries other modules sit on. They are not sold alone. They ship on the same branch as the first module that needs them, or on a thin core branch merged first.",
        ),
        table(
          ["Engine", "Used by"],
          [
            ["Event", "Federation calendar, club calendar, Kyorugi, Poomsae"],
            ["Inventory / shop", "Federation inventory, Club inventory"],
            [
              "Tournament core",
              "Kyorugi and Poomsae packs: registration, categories, fees, accreditation, results, external participants",
            ],
          ],
          w2,
        ),
        spacer(160),
        p(
          "Kyorugi and Poomsae are separate entitlements on one tournament spine. Federation shop and club shop are two faces of one inventory engine. Do not copy-paste two full apps.",
        ),

        h1("7. Module catalog", "s7"),
        h2("7.1 Install-wide", "s7-1"),
        p("A product code unlocks the copy. There is no per-club row, except host flags later."),
        table(
          ["Module", "Purpose", "Per club", "Notes"],
          [
            ["Federation inventory", "LTF sells goods to clubs; federation stock", "No", "Install-wide shop"],
            [
              "Event calendar (federation)",
              "Federation-published dates",
              "No",
              "On whenever calendar is entitled",
            ],
            ["Tournament core", "Shared tournament spine", "No", "Implied if either sport pack is entitled"],
            [
              "Kyorugi tournament",
              "WT kyorugi: weights, weigh-in, brackets, scoring, protests, external registration",
              "Host clubs only",
              "Visitors are external, not Club Admins",
            ],
            [
              "Poomsae tournament",
              "WT poomsae: recognized / freestyle, pair / team, draws, cutoff, scoring",
              "Host clubs only",
              "Same hosting model as Kyorugi",
            ],
          ],
          w4,
        ),
        spacer(200),
        h2("7.2 Per club", "s7-2"),
        p("Entitled at install, then on or off per club."),
        table(
          ["Module", "Purpose", "Who uses it"],
          [
            [
              "Club management",
              "Club \u2192 member: membership, dues invoices (not LTF licenses)",
              "Club Admin of assigned clubs",
            ],
            ["Club calendar", "That club\u2019s events on the shared Event engine", "Club Admin of assigned clubs"],
            ["Club inventory", "Club sells goods to members; club-held stock", "Club Admin; members buy"],
            [
              "Host Kyorugi / Host Poomsae",
              "Only clubs that organize a tournament",
              "Host club + LTF as organizer",
            ],
          ],
          w3,
        ),
        spacer(160),
        p(
          "External clubs and fighters register as external participants. They do not need Club management or Club inventory. Only the host (LTF or a host club) needs the tournament module.",
        ),

        h1("8. Money flows", "s8"),
        p(
          "Keep these invoice stories distinct. Same Order / Invoice / Payment plumbing is acceptable if every line has an explicit type.",
        ),
        table(
          ["Flow", "Seller \u2192 buyer", "Activates LTF license?"],
          [
            ["LTF licenses", "Federation \u2192 member", "Yes, when that is the product"],
            ["Club fees (Core today)", "Federation \u2192 club", "No"],
            ["Club management membership", "Club \u2192 member", "No"],
            ["Federation inventory", "Federation \u2192 club (goods)", "No"],
            ["Club inventory", "Club \u2192 member (goods)", "No"],
            [
              "Tournament entry",
              "Organizer \u2192 registrant",
              "No (fee, not a SKU unless merch is sold later)",
            ],
          ],
          wMoney,
        ),
        spacer(160),
        p(
          "Merchant of record: federation shop uses LTF banking / Stripe / Payconiq; club shop uses that club\u2019s account where IBAN already exists. Decide this before implementing shops.",
        ),
        p(
          "SKU and license type must stay different objects. Club management is membership; club inventory is goods. Toggles stay independent.",
        ),

        h1("9. How the domains relate", "s9"),
        h2("9.1 Event calendar and tournaments", "s9-1"),
        p(
          "Event calendar is the light layer: dates, venue, visibility, optional \u201cthis event is a tournament.\u201d Tournament modules are heavy events on that calendar: categories, registration, payments, brackets or poomsae draws, operations, results.",
        ),
        p(
          "One Event record with type calendar / kyorugi / poomsae. Do not build two calendars and two registration desks.",
        ),
        h2("9.2 Tournaments: one core, two sports", "s9-2"),
        p(
          "Shared: event, venue, timetable, organizer (LTF or host club), registration windows, fees, categories, accreditation, officials, results, audit.",
        ),
        p(
          "External registration: public or token flow for clubs and fighters not in this install \u2014 lightweight external club and athlete, documents, category entry, payment. Do not force Club Admin. After the event they can stay external or be invited into Core as members.",
        ),
        p(
          "Kyorugi (WT): weight classes, weigh-in / random weigh-in, seeding, single-elim / repechage / best-of, electronic scoring hooks, penalties, video replay, protests, medical.",
        ),
        p(
          "Poomsae (WT): recognized vs freestyle, individual / pair / team, compulsory poomsae draw, cutoff / semi / final, accuracy vs presentation, non-weight divisions.",
        ),
        p(
          "World Taekwondo rules change. Put rule packs (categories, scoring, round structure) in versioned data, not only in hard-coded branches.",
        ),
        h2("9.3 Inventory", "s9-3"),
        p("One stock-and-sales engine, two sellers:"),
        bullet("Catalog: item, SKU, variant (size/color), unit, tax."),
        bullet("Stock: on-hand, reserved, location (federation warehouse vs club storeroom)."),
        bullet("Documents: simple sale plus stock movement first; delivery notes later if needed."),
        p(
          "Federation inventory: LTF Finance catalog; clubs place orders; stock in federation locations. Club inventory: Club Admin catalog for that club only; members buy; no cross-club stock unless consignment is added later. Do not start with consignment.",
        ),
        p(
          "Inventory can attach to events later (kits, merch). First version is a standalone shop. A tournament fee stays a registration fee, not a SKU, unless merch is sold next to entry on purpose.",
        ),

        h1("10. Ops console \u2014 Modules", "s10"),
        p("New area on /{locale}/dashboard/ops:"),
        bullet("List of modules: on/off, expiry, last validated."),
        bullet("Enter product code (signed payload)."),
        bullet("Club matrix for every per-club module."),
        bullet("Every change in the ops audit log."),
        p(
          "Show status (active / expired / invalid) without displaying the secret. Codes live in the database, are rotatable, and are not a magic string in .env.",
        ),

        h1("11. First step \u2014 modular extension capabilities", "s11"),
        p(
          "This is the whole \u201ccan we extend the app?\u201d layer. Nothing user-facing except ops. Until this is merged, do not start calendar, shops, or tournaments on a branch that assumes flags exist.",
        ),
        h2("11.1 GitHub branch", "s11-1"),
        p("feature/module-entitlements"),
        p(
          "Branch from the current release line (v0.8.0 / feature/ui-refresh-and-designer, or main only if 0.8.0 is merged first). Do not pile this onto unrelated UI work.",
        ),
        h2("11.2 Version", "s11-2"),
        p("v0.9.0 \u2014 platform release, not a sport or shop release."),
        h2("11.3 What ships", "s11-3"),
        bullet(
          "Registry of stable module ids, for example: club_management, event_calendar, inventory_federation, inventory_club, tournament_kyorugi, tournament_poomsae.",
        ),
        bullet("Install entitlements from a signed product code (modules, expiry, optional caps, install fingerprint)."),
        bullet("Per-club assignment rows."),
        bullet("IsModuleEntitled and club-scoped checks on APIs."),
        bullet("Frontend: entitlements from /api/auth/me/ or a small /api/modules/."),
        bullet("Ops: Modules page, club matrix, audit."),
        bullet("Prove hide/show with a dummy or \u201ccoming soon\u201d module. No calendar, shop, or tournament yet."),
        spacer(80),
        table(
          ["Module id", "Scope", "Sold as"],
          [
            ["club_management", "Per club", "Club management"],
            ["event_calendar", "Install + per-club calendar", "Event calendar"],
            ["inventory_federation", "Install-wide", "Federation inventory"],
            ["inventory_club", "Per club", "Club inventory"],
            ["tournament_kyorugi", "Install; host clubs", "Kyorugi tournament"],
            ["tournament_poomsae", "Install; host clubs", "Poomsae tournament"],
          ],
          wIds,
        ),
        spacer(160),
        h2("11.4 Enforcement", "s11-4"),
        p(
          "API 403 plus hidden nav. A club with Club management off must not hit club-membership invoice endpoints even with a crafted URL. Public tournament registration URLs must check that the event exists and the host module is on.",
        ),
        h2("11.5 Product codes", "s11-5"),
        p(
          "Signed tokens verified offline are enough for a private federation app. Optional later: check for revocation. Bind to hostname or a generated instance id so a code cannot be copied to a second install without intent.",
        ),

        h1("12. GitHub branch plan", "s12"),
        p("One GitHub branch per step, including the first step. Own PR, changelog, tests. Do not merge to main unless asked."),
        spacer(120),
        table(
          ["#", "Branch", "Ships", "Depends on"],
          [
            [
              "0",
              "feature/module-entitlements",
              "Modular capabilities: codes, entitlements, club matrix, 403, hidden nav. Version 0.9.0.",
              "v0.8.0 ops console",
            ],
            [
              "1",
              "feature/module-event-calendar",
              "Event engine + federation calendar + per-club club calendar",
              "Branch 0",
            ],
            [
              "2",
              "feature/module-club-management",
              "Club membership / dues (club \u2192 member invoices)",
              "Branch 0; invoice types from Core",
            ],
            [
              "3",
              "feature/module-inventory-federation",
              "Inventory engine + federation shop (LTF \u2192 clubs)",
              "Branch 0",
            ],
            [
              "4",
              "feature/module-inventory-club",
              "Club shop face + per-club stock",
              "Branch 0 and 3 (same engine)",
            ],
            [
              "5",
              "feature/module-tournament-core",
              "Tournament core + external club/fighter registration",
              "Branch 0 and 1 (events)",
            ],
            ["6", "feature/module-tournament-kyorugi", "WT kyorugi pack", "Branch 5"],
            ["7", "feature/module-tournament-poomsae", "WT poomsae pack", "Branch 5"],
          ],
          wBranch,
        ),
        spacer(160),
        p("After branch 0, later branches register their module id. The module stays locked until a product code says otherwise."),
        p(
          "Fewer PRs if needed: branches 3 and 4 can be one feature/module-inventory with federation first and club shop behind the per-club flag. Branches 6 and 7 stay separate entitlements even if developed in series.",
        ),

        h1("13. Why this delivery order", "s13"),
        bullet("0 \u2014 Entitlements: you cannot sell or hide anything without it.", "order"),
        bullet("1 \u2014 Calendar: smallest new domain; tournaments hang off Event.", "order"),
        bullet("2 \u2014 Club management: money; reuse invoices carefully.", "order"),
        bullet("3 \u2014 Federation shop: you already invoice clubs.", "order"),
        bullet("4 \u2014 Club shop: member checkout and per-club stock.", "order"),
        bullet("5 \u2014 Tournament core and external registration.", "order"),
        bullet("6 then 7 \u2014 Kyorugi, then Poomsae (rule packs as data).", "order"),
        p(
          "You can sell calendar plus club management without waiting for full WT tournament software, and still grow into Kyorugi and Poomsae without a second architecture.",
        ),

        h1("14. Rules on every branch", "s14"),
        bullet("Superuser is not LTF Admin is not module entitlement.", "rules"),
        bullet("Club-on modules: Club A can have Club management; Club B cannot.", "rules"),
        bullet("Visitors to a tournament are external; they are not granted Club Admin.", "rules"),
        bullet("Goods and dues never activate LTF licenses.", "rules"),
        bullet("SKU is not a license type.", "rules"),
        bullet("No plugin folder drop-ins; LTF owns every module.", "rules"),
        bullet("GDPR for external fighters (minors, photos) is a tournament-core concern, not shop v1.", "rules"),
        bullet("Live scoring hardware (for example DAEDO) is a later integration, not v1 of Kyorugi.", "rules"),
        bullet(
          "VAT on goods versus sporting services, if needed in Luxembourg: a tax code on the item, not a new app.",
          "rules",
        ),

        h1("15. Risks to decide later, not in step 0", "s15"),
        bullet("Payments: who is the merchant \u2014 club or federation \u2014 for club shop and club dues."),
        bullet("Negative stock: deny versus allow-backorder, per seller."),
        bullet("Club-level tournament hosting versus LTF-only organizers."),
        bullet("Whether LTF Admin may assign modules without Superuser."),
        bullet("Consignment of federation stock to clubs."),

        h1("16. Summary", "s16"),
        p(
          "Extend the project as a platform: v0.9.0 on feature/module-entitlements delivers modular capabilities (product codes, install entitlements, per-club matrix, API and UI enforcement). Then one GitHub branch per module: event calendar, club management, federation inventory, club inventory, tournament core, Kyorugi, Poomsae.",
        ),
        p(
          "Calendar, club management, two inventory faces, and two WT tournament packs sit on a shared Event, Inventory, and Tournament spine. Superuser ops remains the unlock desk. This document is design only; implementation starts when that work is requested, beginning with feature/module-entitlements.",
        ),
      ],
    },
  ],
});

const out = new URL("./LTF-License-Manager-Modular-Extension.docx", import.meta.url);
const buf = await Packer.toBuffer(doc);
fs.writeFileSync(out, buf);
console.log("Wrote", out.pathname);
