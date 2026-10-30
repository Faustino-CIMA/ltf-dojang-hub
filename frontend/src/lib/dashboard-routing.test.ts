import { getDashboardRouteForRole, routeAfterSignIn } from "./dashboard-routing";

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
});
