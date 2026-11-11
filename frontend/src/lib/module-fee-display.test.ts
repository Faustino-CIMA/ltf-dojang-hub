import { flatMinimumCanApply, visibleMaximumAmount, visibleMinimumAmount } from "./module-fee-display";

describe("flat minimum display", () => {
  it("hides a minimum that cannot raise a flat price", () => {
    expect(flatMinimumCanApply("flat", "50.00", "5.00")).toBe(false);
    expect(visibleMinimumAmount("flat", "50.00", "5.00")).toBeNull();
    expect(flatMinimumCanApply("flat", "50.00", "50.00")).toBe(false);
  });

  it("keeps a minimum that is higher than the flat price", () => {
    expect(visibleMinimumAmount("flat", "4.00", "5.00")).toBe("5.00");
  });

  it("keeps a per-member minimum", () => {
    expect(visibleMinimumAmount("per_active_member", "2.00", "20.00")).toBe("20.00");
  });
});

describe("flat maximum display", () => {
  it("hides a maximum that cannot lower a flat price", () => {
    expect(visibleMaximumAmount("flat", "80.00", "100.00")).toBeNull();
    expect(visibleMaximumAmount("flat", "80.00", "80.00")).toBeNull();
    expect(visibleMaximumAmount("flat", "80.00", "")).toBeNull();
  });

  it("keeps a maximum that is lower than the flat price", () => {
    expect(visibleMaximumAmount("flat", "80.00", "40.00")).toBe("40.00");
  });

  it("keeps a per-member maximum", () => {
    expect(visibleMaximumAmount("per_active_member", "10.00", "300.00")).toBe("300.00");
  });
});
