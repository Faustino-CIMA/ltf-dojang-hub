import {
  defaultDesk,
  deskHeaderValue,
  grantForPath,
  headerMatchesPath,
  pathNeedsDesk,
} from "./active-desk";

const clubs = [
  { desk: "club_admin", level: "full", club_id: 4, club_name: "Vichten" },
  { desk: "club_admin", level: "read_only", club_id: 9, club_name: "Esch" },
];

describe("active desk", () => {
  it("names a club desk with its club id", () => {
    expect(deskHeaderValue(clubs[0])).toBe("club_admin:4");
    expect(deskHeaderValue({ desk: "ltf_admin", level: "full", club_id: null })).toBe("ltf_admin");
  });

  it("reads the desk a path needs", () => {
    expect(pathNeedsDesk("/en/dashboard/ltf-finance/invoices")).toBe("ltf_finance");
    expect(pathNeedsDesk("/en/dashboard/ltf/clubs")).toBe("ltf_admin");
    expect(pathNeedsDesk("/lb/dashboard/club/members")).toBe("club");
    expect(headerMatchesPath("club_admin:4", "club")).toBe(true);
    expect(headerMatchesPath("ltf_admin", "ltf_finance")).toBe(false);
  });

  it("prefers the remembered desk and otherwise the home club", () => {
    expect(defaultDesk(clubs, { desk: "club_admin", club_id: 9 }, "club_admin", 4)?.club_id).toBe(9);
    expect(defaultDesk(clubs, null, "club_admin", 4)?.club_id).toBe(4);
    expect(grantForPath(clubs, "ltf_admin")).toBeNull();
    expect(grantForPath(clubs, "club")?.club_id).toBe(4);
  });
});
