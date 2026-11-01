import { accountBadgeTone, canBulkCreateAccounts, clubMemberRowActionKeys } from "./member-accounts";
import { togglePageSelection } from "./row-selection";

describe("member account helpers", () => {
  it("keeps the menu order and the badge tones", () => {
    expect(clubMemberRowActionKeys("none", false)).toEqual(["edit", "create", "delete"]);
    expect(accountBadgeTone("pending")).toBe("warning");
    expect(accountBadgeTone("disabled")).toBe("neutral");
    const kept = togglePageSelection(togglePageSelection([], [1, 2]), [3]);
    expect(canBulkCreateAccounts(kept, [{ id: 3, account_state: "none" }])).toBe(true);
  });
});
