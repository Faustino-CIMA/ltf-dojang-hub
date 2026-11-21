import { maskSecretNumber } from "./mask-secret";

describe("maskSecretNumber", () => {
  it("keeps the last four characters and the stored length", () => {
    expect(maskSecretNumber("1971100213046")).toBe("•••••••••3046");
    expect(maskSecretNumber("123456789012")).toBe("••••••••9012");
    expect(maskSecretNumber("65122312345")).toBe("•••••••2345");
    expect(maskSecretNumber("12AB34CD567Z")).toBe("••••••••567Z");
  });

  it("leaves a short or empty value empty", () => {
    expect(maskSecretNumber("")).toBe("");
    expect(maskSecretNumber("123")).toBe("");
  });
});
