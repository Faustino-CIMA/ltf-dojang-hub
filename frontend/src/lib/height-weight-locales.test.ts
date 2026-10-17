import de from "../messages/de.json";
import en from "../messages/en.json";
import fr from "../messages/fr.json";
import lb from "../messages/lb.json";

const KEYS = [
  "heightWeightTitle",
  "heightWeightHint",
  "heightWeightAdd",
  "heightWeightEdit",
  "heightWeightKind",
  "heightWeightKindWeight",
  "heightWeightKindHeight",
  "heightWeightKindBoth",
  "heightWeightDate",
  "heightWeightWeight",
  "heightWeightHeight",
  "heightWeightNote",
  "heightWeightSave",
  "heightWeightEmptyTitle",
  "heightWeightChartEmpty",
  "heightWeightSuggestion",
  "heightWeightRangeError",
  "heightWeightRequired",
  "heightWeightLatestWeight",
  "heightWeightLatestHeight",
  "heightWeightKg",
  "heightWeightCm",
] as const;

describe("Height and weight copy", () => {
  it.each([
    ["en", en],
    ["fr", fr],
    ["de", de],
    ["lb", lb],
  ])("has the measurement strings in %s", (_locale, messages) => {
    const club = messages.ClubAdmin as Record<string, string>;
    for (const key of KEYS) {
      expect(club[key]?.trim()).toBeTruthy();
    }
    expect(club.heightWeightSuggestion).toContain("{category}");
    expect(club.heightWeightSuggestion).toContain("{ageClass}");
    expect(club.heightWeightRangeError).toMatch(/10/);
    expect(club.heightWeightRangeError).toMatch(/250/);
    expect(club.heightWeightRangeError).toMatch(/80/);
    expect(club.heightWeightRangeError).toMatch(/230/);
  });
});
