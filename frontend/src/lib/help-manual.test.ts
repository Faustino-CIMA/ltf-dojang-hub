import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import pack from "@/content/help-pack.json";

import { chapterForPath, flattenMessages, parseManual, plainEnough, sectionSummary, sectionVisible, type HelpSection } from "./help-manual";
import { searchHelp } from "./help-search";

const sample = `---
title: Sample
---
# Club admin: members and licenses {#club-members}

Order a license from the list.
{: .proc}

Type the date as [[Common.welcomeNext|name=Ada;date=29.11.2026]].
Click [[actionOrderLicense]].

## Signing in {#sign-in}

Hello {{username}}.
`;

describe("parseManual", () => {
  it("keeps the chapter desk and fills a label", () => {
    const sections = parseManual(sample, {
      "Common.welcomeNext": "{name} · {date}",
      "ClubAdmin.actionOrderLicense": "Order license",
    });
    expect(sections.map((section) => section.id)).toEqual(["club-members", "sign-in"]);
    expect(sections[0].desks).toEqual(["club_admin"]);
    expect(sections[0].text).toContain("Ada · 29.11.2026");
    expect(sections[0].text).toContain("Order license");
    expect(sections[0].text).not.toContain("actionOrderLicense");
    expect(sections[1].text).toContain("Hello username");
    expect(sections[1].desks).toEqual(["club_admin"]);
  });
});

describe("chapterForPath", () => {
  it("picks the chapter for the open page", () => {
    expect(chapterForPath("/en/dashboard/club/members")).toBe("club-members");
    expect(chapterForPath("/fr/dashboard/club")).toBe("welcome");
    expect(chapterForPath("/de/dashboard/ltf-finance/invoices")).toBe("ltf-finance");
    expect(chapterForPath("/lb/dashboard/ltf")).toBe("ltf-admin");
  });
});

describe("sectionVisible", () => {
  const money: HelpSection = { id: "fees", heading: "Fees", text: "Invoices", chapter: "club-money", desks: ["club_admin"] };
  const start: HelpSection = { id: "sign-in", heading: "Signing in", text: "Password", chapter: "getting-started", desks: [] };

  it("hides a club chapter from a coach and shows a shared chapter", () => {
    expect(sectionVisible(money, "coach")).toBe(false);
    expect(sectionVisible(money, "club_admin")).toBe(true);
    expect(sectionVisible(start, "member")).toBe(true);
  });
});

describe("searchHelp", () => {
  const sections: HelpSection[] = [
    { id: "order", heading: "Order a license", text: "Choose the license type.", chapter: "club-members", desks: ["club_admin"] },
    { id: "roll", heading: "Take the roll", text: "Mark who came.", chapter: "coaches", desks: ["coach", "club_admin"] },
  ];

  it("tolerates a typo and stays inside the desk", () => {
    expect(searchHelp(sections, "licenze", "club_admin").map((section) => section.id)).toEqual(["order"]);
    expect(searchHelp(sections, "licenze", "coach")).toEqual([]);
  });
});

describe("help pack", () => {
  it("matches the four manuals", () => {
    const root = resolve(__dirname, "../../..");
    const english = flattenMessages(JSON.parse(readFileSync(resolve(root, "frontend/src/messages/en.json"), "utf8")));
    const luxembourgish = flattenMessages(JSON.parse(readFileSync(resolve(root, "frontend/src/messages/lb.json"), "utf8")));
    const files = {
      en: ["en.md", english],
      fr: ["fr.md", english],
      de: ["de.md", english],
      lb: ["lb.md", luxembourgish],
    } as const;
    for (const [locale, [file, labels]] of Object.entries(files)) {
      const markdown = readFileSync(resolve(root, "docs/user-manual/content", file), "utf8");
      const parsed = parseManual(markdown, labels);
      const packed = (pack as Record<string, HelpSection[]>)[locale];
      expect(parsed.map((section) => section.id)).toEqual(packed.map((section) => section.id));
    }
    expect(JSON.stringify(pack)).not.toContain("[[");
    const ordering = (pack as Record<string, HelpSection[]>).en.find((section) => section.id === "order-licences");
    expect(ordering?.text).toContain("Order license");
    expect(ordering?.text).not.toContain("actionOrderLicense");
    expect(sectionSummary(ordering?.text ?? "")).toBe("Every athlete needs a yearly LTF license.");
    expect((pack as Record<string, HelpSection[]>).en.filter((section) => !plainEnough(section))).toEqual([]);
  });
});
