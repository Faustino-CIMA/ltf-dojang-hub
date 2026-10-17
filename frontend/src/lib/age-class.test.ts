import { ageClassOptionLabel, suggestAgeClass } from "@/lib/age-class";

describe("World Taekwondo age labels", () => {
  it("appends the official range to Cadet, Junior, and Senior", () => {
    expect(ageClassOptionLabel("Cadet", "cadet")).toBe("Cadet (12–14)");
    expect(ageClassOptionLabel("Junior", "junior")).toBe("Junior (15–17)");
    expect(ageClassOptionLabel("Senior", "senior")).toBe("Senior (17+)");
    expect(ageClassOptionLabel("Youth (not a WT division)", "youth")).toBe("Youth (not a WT division)");
  });

  it("suggests a class from the birth year and the season year", () => {
    expect(suggestAgeClass("2016-06-01", 2026)).toBe("youth");
    expect(suggestAgeClass("2014-01-01", 2026)).toBe("cadet");
    expect(suggestAgeClass("2012-12-31", 2026)).toBe("cadet");
    expect(suggestAgeClass("2011-01-01", 2026)).toBe("junior");
    expect(suggestAgeClass("2009-08-20", 2026)).toBe("junior");
    expect(suggestAgeClass("2008-01-01", 2026)).toBe("senior");
    expect(suggestAgeClass("", 2026)).toBe("");
    expect(suggestAgeClass(null, 2026)).toBe("");
  });
});
