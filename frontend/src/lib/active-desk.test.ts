import {
  activateOpsDesk,
  clearOpsServerSync,
  defaultDesk,
  fallbackOpenDesk,
  deskHeaderValue,
  displayedDeskHeader,
  grantForPath,
  headerMatchesPath,
  opsServerSyncPending,
  pathNeedsDesk,
  planOpsDeskAlign,
  readActiveDeskHeader,
  shouldAskDeskSwitch,
} from "./active-desk";

const clubs = [
  { desk: "club_admin", level: "full", club_id: 4, club_name: "Vichten" },
  { desk: "club_admin", level: "read_only", club_id: 9, club_name: "Esch" },
];

const withOps = [
  ...clubs,
  { desk: "ltf_admin", level: "full", club_id: null, club_name: "" },
  { desk: "ops", level: "full", club_id: null, club_name: "" },
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
    expect(pathNeedsDesk("/en/dashboard/ops")).toBe("ops");
    expect(pathNeedsDesk("/en/dashboard/ops/users")).toBe("ops");
    expect(headerMatchesPath("club_admin:4", "club")).toBe(true);
    expect(headerMatchesPath("ltf_admin", "ltf_finance")).toBe(false);
    expect(headerMatchesPath("ops", "ops")).toBe(true);
    expect(headerMatchesPath("club_admin:4", "ops")).toBe(false);
    expect(grantForPath(withOps, "ops")?.desk).toBe("ops");
  });

  it("shows Ops as the current desk on the console and does not ask to switch", () => {
    expect(displayedDeskHeader("/en/dashboard/ops", "club_admin:4", withOps)).toBe("ops");
    expect(displayedDeskHeader("/en/dashboard/ops/users", "ops", withOps)).toBe("ops");
    expect(displayedDeskHeader("/en/dashboard/club/members", "club_admin:4", withOps)).toBe("club_admin:4");
    expect(
      shouldAskDeskSwitch({ pathname: "/en/dashboard/ops", header: "club_admin:4", desks: withOps }),
    ).toBe(false);
    expect(
      shouldAskDeskSwitch({ pathname: "/en/dashboard/ltf/clubs", header: "club_admin:4", desks: withOps }),
    ).toBe(true);
  });

  it("records Ops before the console opens and syncs a stale header once", () => {
    clearOpsServerSync();
    window.sessionStorage.clear();
    const dispatched = jest.spyOn(window, "dispatchEvent");
    const ops = activateOpsDesk(withOps);
    expect(ops.desk).toBe("ops");
    expect(readActiveDeskHeader()).toBe("ops");
    expect(opsServerSyncPending()).toBe(true);
    expect(dispatched).not.toHaveBeenCalled();
    dispatched.mockRestore();

    expect(
      planOpsDeskAlign({
        pathname: "/en/dashboard/ops",
        header: "ops",
        activeHeader: "ops",
        desks: withOps,
        serverPending: true,
      }).sync?.desk,
    ).toBe("ops");
    expect(
      planOpsDeskAlign({
        pathname: "/en/dashboard/ops",
        header: "club_admin:4",
        activeHeader: "club_admin:4",
        desks: withOps,
        serverPending: false,
      }),
    ).toEqual({ writeHeader: "ops", nextActiveHeader: "ops", sync: withOps[3] });
    expect(
      planOpsDeskAlign({
        pathname: "/en/dashboard/ops/users",
        header: "ops",
        activeHeader: "ops",
        desks: withOps,
        serverPending: false,
      }).sync,
    ).toBeNull();
    clearOpsServerSync();
  });

  it("opens Ops for a superuser and an open desk for everyone else", () => {
    expect(fallbackOpenDesk({ isSuperuser: true, desks: clubs, role: "club_admin", homeClubId: 4 })?.desk).toBe("ops");
    expect(fallbackOpenDesk({ isSuperuser: true, desks: withOps, role: "ops", homeClubId: null })?.desk).toBe("ops");
    expect(
      fallbackOpenDesk({ isSuperuser: false, desks: clubs, role: "club_admin", homeClubId: 9 })?.club_id,
    ).toBe(9);
    expect(fallbackOpenDesk({ isSuperuser: false, desks: [], role: "member", homeClubId: null })).toBeNull();
  });

  it("prefers the remembered desk and otherwise the home club", () => {
    expect(defaultDesk(clubs, { desk: "club_admin", club_id: 9 }, "club_admin", 4)?.club_id).toBe(9);
    expect(defaultDesk(clubs, null, "club_admin", 4)?.club_id).toBe(4);
    expect(grantForPath(clubs, "ltf_admin")).toBeNull();
    expect(grantForPath(clubs, "club")?.club_id).toBe(4);
  });
});
