import { isValidRcsNumber, normalizeRcsNumber } from "@/lib/rcs-number";

describe("RCS number", () => {
  it("uppercases and drops spaces", () => {
    expect(normalizeRcsNumber(" b 123456 ")).toBe("B123456");
  });

  it("accepts a blank value and one letter plus up to six digits", () => {
    expect(isValidRcsNumber("")).toBe(true);
    expect(isValidRcsNumber("F42")).toBe(true);
    expect(isValidRcsNumber("12B")).toBe(false);
    expect(isValidRcsNumber("AB1")).toBe(false);
    expect(isValidRcsNumber("B1234567")).toBe(false);
  });
});
