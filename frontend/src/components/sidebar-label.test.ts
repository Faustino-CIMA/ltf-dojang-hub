import { shouldShowLabelTip } from "./sidebar-label";

describe("sidebar label tip", () => {
  it("shows the full name only when the label is cut off", () => {
    expect(shouldShowLabelTip(false, 180, 120)).toBe(true);
    expect(shouldShowLabelTip(false, 120, 120)).toBe(false);
    expect(shouldShowLabelTip(false, 121, 120)).toBe(false);
    expect(shouldShowLabelTip(false, 40, 0)).toBe(false);
  });

  it("shows the name for a collapsed icon even when there is no visible text", () => {
    expect(shouldShowLabelTip(true, 0, 0)).toBe(true);
  });
});
