import { parseWeightKg } from "./weight-input";

describe("parseWeightKg", () => {
  it("stores two decimals and accepts a comma", () => {
    expect(parseWeightKg("44")).toBe("44.00");
    expect(parseWeightKg("44.0")).toBe("44.00");
    expect(parseWeightKg("44.00")).toBe("44.00");
    expect(parseWeightKg("44,5")).toBe("44.50");
    expect(parseWeightKg("44.555")).toBe("44.56");
    expect(parseWeightKg("150")).toBe("150.00");
  });

  it("refuses a word and a weight above 150 kg", () => {
    expect(parseWeightKg("heavy")).toBeNull();
    expect(parseWeightKg("9")).toBeNull();
    expect(parseWeightKg("150.01")).toBeNull();
    expect(parseWeightKg("151")).toBeNull();
    expect(parseWeightKg("1.00", { min: 0, max: 20 })).toBe("1.00");
    expect(parseWeightKg("21", { min: 0, max: 20 })).toBeNull();
  });
});