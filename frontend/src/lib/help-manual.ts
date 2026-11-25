/** Turns a user-manual markdown file into searchable sections. */

export type HelpDesk = "club_admin" | "coach" | "ltf_admin" | "ltf_finance" | "ops" | "member";

export type HelpSection = {
  id: string;
  heading: string;
  text: string;
  chapter: string;
  /** Empty means every desk may see it. */
  desks: HelpDesk[];
};

const ALL: HelpDesk[] = [];

const CHAPTER_DESKS: Record<string, HelpDesk[]> = {
  welcome: ALL,
  "getting-started": ALL,
  coaches: ["coach", "club_admin"],
  "club-members": ["club_admin"],
  "club-money": ["club_admin"],
  "club-training": ["club_admin", "coach"],
  "club-teams": ["club_admin", "coach"],
  shop: ["club_admin"],
  calendar: ALL,
  "club-settings": ["club_admin"],
  "club-year": ["club_admin"],
  "ltf-admin": ["ltf_admin"],
  "ltf-finance": ["ltf_finance"],
  ops: ["ops"],
  faq: ALL,
};

export const CHAPTER_ROUTES: Record<string, string> = {
  coaches: "/dashboard/club/training",
  "club-members": "/dashboard/club/members",
  "club-money": "/dashboard/club/invoices",
  "club-training": "/dashboard/club/training",
  "club-teams": "/dashboard/club",
  shop: "/dashboard/club",
  "club-settings": "/dashboard/club/settings",
  "ltf-admin": "/dashboard/ltf",
  "ltf-finance": "/dashboard/ltf-finance",
  ops: "/dashboard/ops",
};

const PATH_CHAPTERS: Array<[string, string]> = [
  ["/dashboard/club/members", "club-members"],
  ["/dashboard/club/invoices", "club-money"],
  ["/dashboard/club/orders", "club-money"],
  ["/dashboard/club/licenses", "club-members"],
  ["/dashboard/club/print-jobs", "club-members"],
  ["/dashboard/club/transfers", "club-members"],
  ["/dashboard/club/data", "club-members"],
  ["/dashboard/club/training", "club-training"],
  ["/dashboard/club/settings", "club-settings"],
  ["/dashboard/ltf-finance", "ltf-finance"],
  ["/dashboard/ltf", "ltf-admin"],
  ["/dashboard/ops", "ops"],
  ["/dashboard/club", "welcome"],
];

export function chapterForPath(pathname: string): string | null {
  const path = pathname.replace(/^\/(en|fr|de|lb)/, "");
  for (const [prefix, chapter] of PATH_CHAPTERS) {
    if (path === prefix || path.startsWith(`${prefix}/`)) {
      return chapter;
    }
  }
  return null;
}

export function sectionVisible(section: HelpSection, desk: string | null): boolean {
  if (section.desks.length === 0) {
    return true;
  }
  if (!desk) {
    return false;
  }
  return section.desks.includes(desk as HelpDesk);
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

/** Same order as the user-manual builder, so a short [[key]] becomes the on-screen words. */
const LABEL_NAMESPACES = [
  "ClubAdmin",
  "ClubMgmt",
  "Events",
  "Member",
  "LtfAdmin",
  "LtfFinance",
  "Import",
  "Common",
  "Auth",
  "Reset",
  "Verify",
  "Ops",
  "Dashboard",
  "Checkout",
  "About",
  "Home",
];

function lookupLabel(key: string, labels: Record<string, string>, params: string): string {
  const namespaced = key.includes(".") ? labels[key] : undefined;
  const bare = key.includes(".")
    ? undefined
    : LABEL_NAMESPACES.map((namespace) => labels[`${namespace}.${key}`]).find((value) => value);
  const template = namespaced || bare || "";
  if (!template) {
    return "";
  }
  if (!params) {
    return template.replace(/\{[^}]+\}/g, "").replace(/\s+/g, " ").trim();
  }
  const filled = params.split(";").reduce((text, pair) => {
    const [name, value] = pair.split("=");
    if (!name || value == null) {
      return text;
    }
    return text.replaceAll(`{${name.trim()}}`, value.trim());
  }, template);
  return filled.replace(/\{[^}]+\}/g, "").replace(/\s+/g, " ").trim();
}

const CAMEL_CASE = /\b[a-z]+[A-Z][A-Za-z0-9]*\b/;

export function sectionSummary(text: string): string {
  const sentence = text.split(/(?<=[.!?])\s/)[0]?.replace(/^\d+\.\s*/, "").trim() ?? "";
  if (sentence.length <= 140) {
    return sentence;
  }
  return `${sentence.slice(0, 137).replace(/\s+\S*$/, "")}…`;
}

export function plainEnough(section: HelpSection): boolean {
  return !CAMEL_CASE.test(`${section.heading} ${section.text}`);
}

export function plainManual(markdown: string, labels: Record<string, string>): string {
  const withoutFront = markdown.replace(/^---[\s\S]*?\n---\n/, "");
  return withoutFront
    .replace(/!\[[^\]]*]\([^)]*\)/g, "")
    .replace(/<p class="roles">[\s\S]*?<\/p>/g, "")
    .replace(/<div class="legend"[\s\S]*?<\/div>/g, "")
    .replace(/\{:\s*\.[a-z]+\}/g, "")
    .replace(/\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]/g, (_, key: string, params: string | undefined) =>
      lookupLabel(key.trim(), labels, params ?? ""),
    )
    .replace(/\{\{([^}|]+)(?:\|([^}]+))?\}\}/g, (_, term: string, shown: string | undefined) => (shown ?? term).trim())
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/^>\s?\[!(?:TIP|WARNING|NOTE)]\s*$/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/[#*_`|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseManual(markdown: string, labels: Record<string, string>): HelpSection[] {
  const body = markdown.replace(/^---[\s\S]*?\n---\n/, "");
  const parts = body.split(/^(?=#{1,3} )/m);
  const sections: HelpSection[] = [];
  let chapter = "welcome";
  let desks: HelpDesk[] = ALL;
  for (const part of parts) {
    const match = part.match(/^(#{1,3})\s+(.+?)\s*$/m);
    if (!match) {
      continue;
    }
    const headingLine = match[2].replace(/\s+\{#([a-z0-9-]+)\}\s*$/, "").trim();
    const anchor = match[2].match(/\{#([a-z0-9-]+)\}/)?.[1] ?? slug(headingLine);
    if (match[1].length === 1) {
      chapter = anchor;
      desks = CHAPTER_DESKS[anchor] ?? ALL;
    }
    const text = plainManual(part.slice(match[0].length), labels);
    sections.push({
      id: anchor,
      heading: headingLine,
      text,
      chapter,
      desks,
    });
  }
  return sections;
}

export function flattenMessages(value: unknown, prefix = ""): Record<string, string> {
  if (typeof value === "string") {
    return prefix ? { [prefix]: value } : {};
  }
  if (!value || typeof value !== "object") {
    return {};
  }
  return Object.entries(value as Record<string, unknown>).reduce<Record<string, string>>((all, [key, child]) => {
    const next = prefix ? `${prefix}.${key}` : key;
    return { ...all, ...flattenMessages(child, next) };
  }, {});
}
