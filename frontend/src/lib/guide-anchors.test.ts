import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import de from "../messages/de.json";
import en from "../messages/en.json";
import fr from "../messages/fr.json";
import lb from "../messages/lb.json";

import { flattenMessages } from "./i18n-coverage";

const ADVANCES = new Set(["click", "value", "route", "dialog", "success", "manual"]);
const PLACEHOLDER = /\{[a-zA-Z0-9_]+(?:,[^}]*)?\}/g;

type GuideStep = {
  id: string;
  anchor: string;
  titleKey: string;
  bodyKey: string;
  advance: string;
};

type GuideFile = {
  id: string;
  titleKey: string;
  manual: string;
  steps: GuideStep[];
};

function sourceFiles(dir: string): Array<{ file: string; source: string }> {
  const found: Array<{ file: string; source: string }> = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "content") {
        continue;
      }
      found.push(...sourceFiles(full));
      continue;
    }
    if (full.endsWith(".ts") || full.endsWith(".tsx")) {
      found.push({ file: full, source: readFileSync(full, "utf8") });
    }
  }
  return found;
}

function hookedAnchors(sources: string[]): Set<string> {
  const found = new Set<string>();
  const menuWiresHooks = sources.some(
    (source) => source.includes("data-guide={guide}") && source.includes("data-guide={action.guide}"),
  );
  for (const source of sources) {
    for (const match of source.matchAll(/data-guide="([^"]+)"/g)) {
      found.add(match[1]);
    }
    if (!menuWiresHooks) {
      continue;
    }
    for (const match of source.matchAll(/guide(?::\s*|\s*=\s*)"([^"]+)"/g)) {
      found.add(match[1]);
    }
  }
  return found;
}

describe("guide anchors", () => {
  const root = path.join(process.cwd(), "src");
  const guideDir = path.join(root, "content/guides");
  const guides = readdirSync(guideDir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => JSON.parse(readFileSync(path.join(guideDir, name), "utf8")) as GuideFile);
  const files = sourceFiles(root);
  const sources = files.map((file) => file.source);
  const hooks = hookedAnchors(sources);
  const catalogs = { en: flattenMessages(en), fr: flattenMessages(fr), de: flattenMessages(de), lb: flattenMessages(lb) };
  const pack = JSON.parse(readFileSync(path.join(root, "content/help-pack.json"), "utf8")) as {
    en: Array<{ id: string }>;
  };

  it("finds every hook in the frontend source", () => {
    const missing = guides.flatMap((guide) =>
      guide.steps.filter((step) => !hooks.has(step.anchor)).map((step) => `${guide.id}:${step.anchor}`),
    );
    expect(missing).toEqual([]);
  });

  it("keeps guide copy in all four languages, with the same placeholders", () => {
    const keys = guides.flatMap((guide) => [guide.titleKey, ...guide.steps.flatMap((step) => [step.titleKey, step.bodyKey])]);
    for (const [locale, messages] of Object.entries(catalogs)) {
      const missing = keys.filter((key) => !messages[key]?.trim());
      expect({ locale, missing }).toEqual({ locale, missing: [] });
    }
    for (const key of keys) {
      const english = catalogs.en[key].match(PLACEHOLDER) ?? [];
      expect(catalogs.fr[key].toLowerCase()).not.toContain("license");
      for (const locale of ["fr", "de", "lb"] as const) {
        expect(catalogs[locale][key].match(PLACEHOLDER) ?? []).toEqual(english);
      }
    }
    expect(catalogs.en["Guide.orderLicenseTitle"]).toContain("license");
    expect(catalogs.fr["Guide.orderLicenseTitle"]).toContain("licence");
  });

  it("names a manual section and a known way to finish each step", () => {
    const sectionIds = new Set(pack.en.map((section) => section.id));
    for (const guide of guides) {
      expect(sectionIds.has(guide.manual)).toBe(true);
      for (const step of guide.steps) {
        expect(ADVANCES.has(step.advance)).toBe(true);
      }
    }
  });

  it("keeps the guide file out of the shell", () => {
    const shell = files.find((file) => file.file.endsWith(`${path.sep}app-shell.tsx`));
    expect(shell?.source).not.toContain("content/guides");
    expect(shell?.source).not.toContain('from "@/components/help/guide-layer"');
    expect(shell?.source).toContain('import("@/components/help/guide-layer")');
  });
});
