import { AGE_CLASS_ORDER, ageClassOptionLabel, formatAgeClassLabel, suggestAgeClass } from "@/lib/age-class";

const t = (key: string) => key;

describe("Age class labels", () => {
  it("lists Pupils and Minimes before the World Taekwondo classes, and Youth last", () => {
    expect(AGE_CLASS_ORDER).toEqual(["pupils", "minimes", "cadet", "junior", "senior", "youth"]);
  });

  it("shows the range and marks the regional classes", () => {
    expect(ageClassOptionLabel("Pupils", "pupils", "not a WT division")).toBe("Pupils (7–8, not a WT division)");
    expect(ageClassOptionLabel("Minimes", "minimes", "not a WT division")).toBe("Minimes (9–11, not a WT division)");
    expect(ageClassOptionLabel("Cadet", "cadet")).toBe("Cadet (12–14)");
    expect(ageClassOptionLabel("Junior", "junior")).toBe("Junior (15–17)");
    expect(ageClassOptionLabel("Senior", "senior")).toBe("Senior (17+)");
    expect(formatAgeClassLabel(t, "youth")).toBe("nationalTeamAgeYouth");
    expect(formatAgeClassLabel(t, "pupils")).toBe("nationalTeamAgePupils (7–8, nationalTeamAgeRegional)");
  });

  it("suggests a class from the birth year, and moves up in the last year except Pupils", () => {
    expect(suggestAgeClass("2021-06-01", 2027)).toBe("youth");
    expect(suggestAgeClass("2020-01-01", 2027)).toBe("pupils");
    expect(suggestAgeClass("2019-12-31", 2027)).toBe("pupils");
    expect(suggestAgeClass("2018-01-01", 2027)).toBe("minimes");
    expect(suggestAgeClass("2017-01-01", 2027)).toBe("minimes");
    expect(suggestAgeClass("2016-01-01", 2027)).toBe("cadet");
    expect(suggestAgeClass("2015-01-01", 2027)).toBe("cadet");
    expect(suggestAgeClass("2014-01-01", 2027)).toBe("cadet");
    expect(suggestAgeClass("2013-01-01", 2027)).toBe("junior");
    expect(suggestAgeClass("2012-01-01", 2027)).toBe("junior");
    expect(suggestAgeClass("2011-01-01", 2027)).toBe("junior");
    expect(suggestAgeClass("2010-01-01", 2027)).toBe("senior");
    expect(suggestAgeClass("2009-01-01", 2027)).toBe("senior");
    expect(suggestAgeClass("", 2027)).toBe("");
    expect(suggestAgeClass(null, 2027)).toBe("");
  });
});
