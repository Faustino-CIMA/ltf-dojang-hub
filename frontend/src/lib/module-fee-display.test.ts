import { flatMinimumCanApply, visibleMinimumAmount } from "./module-fee-display";

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
