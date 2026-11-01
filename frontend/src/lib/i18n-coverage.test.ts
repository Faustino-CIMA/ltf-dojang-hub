import de from "../messages/de.json";
import en from "../messages/en.json";
import fr from "../messages/fr.json";
import lb from "../messages/lb.json";

import { coverageByArea, flattenMessages, formatCoverage } from "./i18n-coverage";

const PLACEHOLDER = /\{[a-zA-Z0-9_]+\}/g;

describe("translation coverage", () => {
  it("reports missing keys for each locale and area", () => {
    const report = [
      formatCoverage("fr", coverageByArea(en, fr)),
      formatCoverage("de", coverageByArea(en, de)),
      formatCoverage("lb", coverageByArea(en, lb)),
    ].join("\n");
    expect(report).toContain("ClubAdmin:");
    expect(report).toContain("fr");
    expect(report).toContain("missing 0");
  });

  it("keeps every Club Admin string in French and German, with the same placeholders", () => {
    const english = flattenMessages(en);
    for (const catalog of [fr, de]) {
      const translated = flattenMessages(catalog);
      const clubKeys = Object.keys(english).filter((key) => key.startsWith("ClubAdmin."));
      const missing = clubKeys.filter((key) => !(key in translated) || !translated[key].trim());
      expect(missing).toEqual([]);
      for (const key of clubKeys) {
        expect(translated[key].match(PLACEHOLDER) ?? []).toEqual(english[key].match(PLACEHOLDER) ?? []);
        expect(translated[key].split("#").length).toBe(english[key].split("#").length);
      }
    }
  });
});
