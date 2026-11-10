import { clubAdminGrantChoice, grantFailureKind } from "./club-admin-grant";

describe("club admin grant from a member row", () => {
  it("hides the item when the person cannot grant or the member has no club", () => {
    expect(clubAdminGrantChoice({ canGrant: false, clubId: 4, accountState: "active" })).toBe("hidden");
    expect(clubAdminGrantChoice({ canGrant: true, clubId: null, accountState: "active" })).toBe("hidden");
  });

  it("asks for a login before granting, and marks someone who is already an admin", () => {
    expect(clubAdminGrantChoice({ canGrant: true, clubId: 4, accountState: "none" })).toBe("needs-account");
    expect(clubAdminGrantChoice({ canGrant: true, clubId: 4 })).toBe("needs-account");
    expect(
      clubAdminGrantChoice({ canGrant: true, clubId: 4, accountState: "active", isHomeClubAdmin: true }),
    ).toBe("already");
  });

  it("grants when a login exists and the person is not already an admin", () => {
    expect(clubAdminGrantChoice({ canGrant: true, clubId: 4, accountState: "pending" })).toBe("grant");
    expect(clubAdminGrantChoice({ canGrant: true, clubId: 4, accountState: "active" })).toBe("grant");
    expect(clubAdminGrantChoice({ canGrant: true, clubId: 4, accountState: "disabled" })).toBe("grant");
  });

  it("keeps a real refusal distinct from someone who is already an admin", () => {
    expect(grantFailureKind("Club admin limit reached.")).toBe("limit");
    expect(grantFailureKind("actor_home_club")).toBe("home");
    expect(grantFailureKind("Not allowed.")).toBe("home");
    expect(grantFailureKind("already_admin")).toBe("already");
  });
});
