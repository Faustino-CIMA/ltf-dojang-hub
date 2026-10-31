import { isLeavingDeepLink, pathIsDeskHome, showLegacyClubPicker } from "./desk-switch";

describe("desk switch", () => {
  it("asks before leaving a page under the current desk", () => {
    expect(isLeavingDeepLink("/en/dashboard/club/members/4", "club_admin", "en")).toBe(true);
    expect(isLeavingDeepLink("/en/dashboard/club", "club_admin", "en")).toBe(false);
    expect(isLeavingDeepLink("/en/dashboard/ltf-finance", "ltf_finance", "en")).toBe(false);
  });

  it("does not treat the finance desk as the admin desk", () => {
    expect(pathIsDeskHome("/en/dashboard/ltf-finance", "ltf_admin", "en")).toBe(false);
    expect(pathIsDeskHome("/en/dashboard/ltf", "ltf_admin", "en")).toBe(true);
    expect(pathIsDeskHome("/en/dashboard/ltf/members", "ltf_admin", "en")).toBe(false);
  });

  it("hides the old club picker only when more than one desk is open", () => {
    expect(showLegacyClubPicker(1)).toBe(true);
    expect(showLegacyClubPicker(4)).toBe(false);
  });
});