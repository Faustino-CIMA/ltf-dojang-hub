import { parseWeightKg } from "./weight-input";

describe("parseWeightKg", () => {
  it("keeps 44, 44.0, and 44.00, and accepts a comma", () => {
    expect(parseWeightKg("44")).toBe("44.0");
    expect(parseWeightKg("44.0")).toBe("44.0");
    expect(parseWeightKg("44.00")).toBe("44.0");
    expect(parseWeightKg("44,5")).toBe("44.5");
    expect(parseWeightKg("44,00")).toBe("44.0");
  });

  it("refuses a word and a weight outside the range", () => {
    expect(parseWeightKg("heavy")).toBeNull();
    expect(parseWeightKg("9")).toBeNull();
    expect(parseWeightKg("1.00", { min: 0, max: 20 })).toBe("1.0");
    expect(parseWeightKg("21", { min: 0, max: 20 })).toBeNull();
  });
});