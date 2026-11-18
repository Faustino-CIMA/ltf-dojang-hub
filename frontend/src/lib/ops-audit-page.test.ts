import { opsAuditActionLabel, opsAuditPageNumbers, opsAuditPageSizeKey } from "./ops-audit-page";

describe("ops audit pages", () => {
  it("remembers the page size for one user", () => {
    expect(opsAuditPageSizeKey(7)).toBe("ops-audit-page-size:7");
    expect(opsAuditPageSizeKey(8)).not.toBe(opsAuditPageSizeKey(7));
  });

  it("shows page numbers around the current page", () => {
    expect(opsAuditPageNumbers(1, 1)).toEqual([1]);
    expect(opsAuditPageNumbers(1, 10)).toEqual([1, 2, 3, 4, 5]);
    expect(opsAuditPageNumbers(10, 10)).toEqual([6, 7, 8, 9, 10]);
    expect(opsAuditPageNumbers(4, 10)).toEqual([2, 3, 4, 5, 6]);
  });

  it("names a card check and leaves other actions as stored", () => {
    const labels = { verify: "Member verified", unlock: "Member unlocked" };
    expect(opsAuditActionLabel("member_verification.verify", labels)).toBe("Member verified");
    expect(opsAuditActionLabel("member_verification.unlock", labels)).toBe("Member unlocked");
    expect(opsAuditActionLabel("query_run", labels)).toBe("query_run");
  });
});
