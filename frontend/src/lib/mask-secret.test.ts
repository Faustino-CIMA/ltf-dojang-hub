import { MASKED_SECRET_NUMBER, isMaskedSecretNumber, maskSecretNumber } from "./mask-secret";

describe("maskSecretNumber", () => {
  it("uses one fixed mask and keeps every digit hidden", () => {
    for (const value of ["1971100213046", "123456789012", "65122312345", "12AB34CD567Z", "123"]) {
      expect(maskSecretNumber(value)).toBe(MASKED_SECRET_NUMBER);
      expect(maskSecretNumber(value)).toHaveLength(13);
      expect(maskSecretNumber(value)).not.toMatch(/\d/);
      expect(value.split("").some((character) => maskSecretNumber(value).includes(character))).toBe(false);
    }
  });

  it("leaves an empty value empty", () => {
    expect(maskSecretNumber("")).toBe("");
    expect(isMaskedSecretNumber("")).toBe(false);
    expect(isMaskedSecretNumber(MASKED_SECRET_NUMBER)).toBe(true);
  });
});
