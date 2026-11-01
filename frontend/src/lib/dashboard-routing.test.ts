import { getDashboardRouteForRole, routeAfterSignIn, showFederationDashboardLink } from "./dashboard-routing";

describe("dashboard routing", () => {
  it("maps member role to member history page", () => {
    expect(getDashboardRouteForRole("member", "en")).toBe("/en/dashboard/member");
  });

  it("maps coach role to club dashboard", () => {
    expect(getDashboardRouteForRole("coach", "lb")).toBe("/lb/dashboard/club");
  });

  it("returns null for unknown role", () => {
    expect(getDashboardRouteForRole("unknown", "en")).toBeNull();
  });

  it("opens the last desk after sign-in and falls back to the role", () => {
    expect(
      routeAfterSignIn("club_admin", "en", { lastDesk: { desk: "ltf_finance", club_id: null } }),
    ).toBe("/en/dashboard/ltf-finance");
    expect(routeAfterSignIn("member", "en", { isSuperuser: true })).toBe("/en/dashboard/ops");
  });

  it("sends superusers to the ops console", () => {
    expect(getDashboardRouteForRole("member", "en", { isSuperuser: true })).toBe(
      "/en/dashboard/ops",
    );
  });

  it("hides the federation link when the desk switcher already opens that dashboard", () => {
    expect(
      showFederationDashboardLink({
        isSuperuser: true,
        onOpsDashboard: true,
        role: "ltf_admin",
        desks: [{ desk: "ops" }, { desk: "ltf_admin" }],
      }),
    ).toBe(false);
    expect(
      showFederationDashboardLink({
        isSuperuser: true,
        onOpsDashboard: true,
        role: "ltf_finance",
        desks: [{ desk: "ops" }, { desk: "ltf_finance" }],
      }),
    ).toBe(false);
    expect(
      showFederationDashboardLink({
        isSuperuser: false,
        onOpsDashboard: true,
        role: "ltf_admin",
        desks: [{ desk: "ops" }],
      }),
    ).toBe(false);
    expect(
      showFederationDashboardLink({
        isSuperuser: true,
        onOpsDashboard: false,
        role: "ltf_admin",
        desks: [{ desk: "ops" }],
      }),
    ).toBe(false);
  });

  it("keeps the federation link for a superuser who has no desk for that dashboard", () => {
    expect(
      showFederationDashboardLink({
        isSuperuser: true,
        onOpsDashboard: true,
        role: "ltf_admin",
        desks: [{ desk: "ops" }],
      }),
    ).toBe(true);
    expect(
      showFederationDashboardLink({
        isSuperuser: true,
        onOpsDashboard: true,
        role: "member",
        desks: [{ desk: "ops" }],
      }),
    ).toBe(true);
  });
});
