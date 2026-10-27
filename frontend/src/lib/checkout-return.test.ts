import {
  checkoutReturnLabelKey,
  dashboardPathForArea,
  readCheckoutReturn,
  rememberCheckoutReturn,
  resolveCheckoutDashboardHref,
  sanitizeCheckoutReturnPath,
} from "./checkout-return";

describe("checkout return paths", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("collapses a club invoice page to the club dashboard and keeps the current locale", () => {
    expect(sanitizeCheckoutReturnPath("/en/dashboard/club/invoices/12", "en")).toBe(
      "/en/dashboard/club",
    );
    expect(sanitizeCheckoutReturnPath("/en/dashboard/club/invoices/12", "lb")).toBe(
      "/lb/dashboard/club",
    );
  });

  it("keeps finance, LTF, member, and ops areas", () => {
    expect(sanitizeCheckoutReturnPath("/lb/dashboard/ltf-finance/payments", "lb")).toBe(
      "/lb/dashboard/ltf-finance",
    );
    expect(dashboardPathForArea("ltf", "en")).toBe("/en/dashboard/ltf");
    expect(dashboardPathForArea("member", "en")).toBe("/en/dashboard/member");
    expect(dashboardPathForArea("ops", "lb")).toBe("/lb/dashboard/ops");
  });

  it("rejects open redirects and path tricks", () => {
    const rejected = [
      "https://evil.example/en/dashboard/club",
      "//evil.example/en/dashboard/club",
      "/en/dashboard/club/../../../etc/passwd",
      "/\\en/dashboard/club",
      "/en/dashboard/club?next=https://evil.example",
      "/en/dashboard/club#https://evil.example",
      "/%2e%2e/en/dashboard/club",
      "/en/dashboard/../admin",
      "/fr/dashboard/club",
      "javascript:alert(1)",
      "/en/dashboard/club/\n",
    ];
    for (const value of rejected) {
      expect(sanitizeCheckoutReturnPath(value, "en")).toBeNull();
    }
    expect(dashboardPathForArea("https://evil.example", "en")).toBeNull();
    expect(dashboardPathForArea("../ops", "en")).toBeNull();
  });

  it("prefers the stored club path over a superuser ops fallback", () => {
    rememberCheckoutReturn("/en/dashboard/club/invoices", "en");
    expect(readCheckoutReturn("en")).toBe("/en/dashboard/club");
    expect(
      resolveCheckoutDashboardHref({
        locale: "en",
        storedPath: readCheckoutReturn("en"),
        orderArea: "ltf",
        roleHref: "/en/dashboard/ops",
      }),
    ).toBe("/en/dashboard/club");
  });

  it("uses the order area when nothing safe was stored", () => {
    rememberCheckoutReturn("https://evil.example", "en");
    expect(readCheckoutReturn("en")).toBeNull();
    expect(
      resolveCheckoutDashboardHref({
        locale: "en",
        storedPath: "https://evil.example/en/dashboard/club",
        orderArea: "club",
        roleHref: "/en/dashboard/ops",
      }),
    ).toBe("/en/dashboard/club");
  });

  it("uses the role path only as a fallback", () => {
    expect(
      resolveCheckoutDashboardHref({
        locale: "en",
        storedPath: null,
        orderArea: "",
        roleHref: "/en/dashboard/ops",
      }),
    ).toBe("/en/dashboard/ops");
    expect(
      resolveCheckoutDashboardHref({
        locale: "lb",
        storedPath: null,
        orderArea: null,
        roleHref: null,
      }),
    ).toBe("/lb/dashboard");
  });

  it("names the button for the area it opens", () => {
    expect(checkoutReturnLabelKey("/en/dashboard/club", "en")).toBe("returnClub");
    expect(checkoutReturnLabelKey("/en/dashboard/ltf", "en")).toBe("returnLtf");
    expect(checkoutReturnLabelKey("/en/dashboard/ltf-finance", "en")).toBe("returnFinance");
    expect(checkoutReturnLabelKey("/lb/dashboard/member", "lb")).toBe("returnMember");
    expect(checkoutReturnLabelKey("/en/dashboard/ops", "en")).toBe("returnOps");
    expect(checkoutReturnLabelKey("/en/dashboard", "en")).toBe("returnDashboard");
  });
});
