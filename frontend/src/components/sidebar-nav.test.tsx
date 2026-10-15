import { readFileSync } from "node:fs";
import path from "node:path";

import { render, screen, waitFor } from "@testing-library/react";

import ClubDashboardLayout from "@/app/[locale]/dashboard/club/layout";
import LtfDashboardLayout from "@/app/[locale]/dashboard/ltf/layout";
import { ClubAdminLayout } from "@/components/club-admin/club-admin-layout";
import { LtfAdminLayout } from "@/components/ltf-admin/ltf-admin-layout";

jest.mock("next/navigation", () => ({
  usePathname: () => (globalThis as { __sidebarPath?: string }).__sidebarPath ?? "/en/dashboard/club/members",
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), prefetch: jest.fn() }),
}));

jest.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string) => key,
}));

jest.mock("@/lib/api", () => ({
  apiRequest: jest.fn(async (requestPath: string) => {
    if (requestPath === "/api/auth/me/") {
      return { role: "club_admin", username: "anne.reding", first_name: "Anne", is_superuser: false };
    }
    return [];
  }),
}));

jest.mock("@/lib/modules-api", () => {
  const actual = jest.requireActual("@/lib/modules-api");
  return {
    ...actual,
    getModuleStatus: jest.fn(async () => ({
      entitled: ["club_management", "event_calendar", "preview"],
      modules: [],
      clubs: [{ id: 1, name: "Uelzecht", modules: ["club_management", "event_calendar", "preview"] }],
    })),
  };
});

jest.mock("@/components/club-selection-provider", () => ({
  ALL_CLUBS_SELECT_VALUE: "all",
  allowsAllClubsSelection: () => false,
  persistSelectedClubId: jest.fn(),
  resolveAssignedClubId: () => 1,
  shouldShowClubSelector: () => false,
  useClubSelection: () => ({
    clubs: [{ id: 1, name: "Uelzecht" }],
    selectedClubId: 1,
    setSelectedClubId: jest.fn(),
    isLoading: false,
  }),
}));

jest.mock("@/components/events/use-calendar-attention", () => ({
  useCalendarAttention: () => ({ badgeCount: 4, badgeNew: "new" }),
}));

jest.mock("@/components/club-admin/incoming-transfer-notice", () => ({
  IncomingTransferNotice: () => null,
}));

jest.mock("@/components/events/event-reminder-toasts", () => ({
  EventReminderToasts: () => null,
}));

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  global.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;
});

beforeEach(() => {
  (globalThis as { __sidebarPath?: string }).__sidebarPath = "/en/dashboard/club/members";
});

function boxTokens(className: string) {
  return className
    .split(/\s+/)
    .filter((token) => /^(sidebar-nav-link|p|px|py|pt|pb|h-|min-h|max-h|border|font-|text-sm|text-base|size-|gap-)/.test(token))
    .sort();
}

describe("sidebar navigation", () => {
  it("keeps the club shell mounted and the menu intact when the page changes", async () => {
    function MembersPage() {
      return (
        <ClubAdminLayout title="Members" subtitle="Roster">
          <p>Members body</p>
        </ClubAdminLayout>
      );
    }
    function LicensesPage() {
      return (
        <ClubAdminLayout title="Licenses" subtitle="Cards">
          <p>Licenses body</p>
        </ClubAdminLayout>
      );
    }

    const { rerender } = render(
      <ClubDashboardLayout>
        <MembersPage />
      </ClubDashboardLayout>
    );

    expect(await screen.findByRole("heading", { name: "Members" })).toBeInTheDocument();
    expect(screen.getAllByRole("navigation")).toHaveLength(1);
    await waitFor(() => {
      expect(screen.getByText("navGroupClubManagement")).toBeInTheDocument();
    });

    const nav = screen.getByRole("navigation");
    nav.scrollTop = 80;
    (globalThis as { __sidebarPath?: string }).__sidebarPath = "/en/dashboard/club/licenses";
    rerender(
      <ClubDashboardLayout>
        <LicensesPage />
      </ClubDashboardLayout>
    );

    expect(screen.getByRole("navigation")).toBe(nav);
    expect(nav.scrollTop).toBe(80);
    expect(screen.getByRole("heading", { name: "Licenses" })).toBeInTheDocument();
    expect(screen.getByText("navGroupClubManagement")).toBeInTheDocument();
    expect(screen.getByText("navGroupCalendar")).toBeInTheDocument();
    expect(screen.queryByText("navOrders")).not.toBeInTheDocument();
  });

  it("gives active, idle, and badge links the same box classes", async () => {
    render(
      <ClubDashboardLayout>
        <ClubAdminLayout title="Members" subtitle="Roster">
          <p>Members body</p>
        </ClubAdminLayout>
      </ClubDashboardLayout>
    );

    const members = await screen.findByRole("link", { name: "navMembers" });
    const overview = screen.getByRole("link", { name: "navOverview" });
    const calendar = await screen.findByRole("link", { name: /navCalendar/ });

    expect(members).toHaveAttribute("aria-current", "page");
    expect(overview).not.toHaveAttribute("aria-current");
    expect(boxTokens(members.className)).toEqual(boxTokens(overview.className));
    expect(boxTokens(calendar.className)).toEqual(boxTokens(overview.className));
    expect(members.className).toContain("sidebar-nav-link");
    expect(members.className).not.toMatch(/font-semibold|font-bold|pt-3|border-2/);
    expect(overview.className).not.toMatch(/font-semibold|font-bold|pt-3|border-2/);
    expect(members.querySelector("svg")?.getAttribute("class")).toContain("sidebar-nav-icon");
    expect(overview.querySelector("svg")?.getAttribute("class")).toContain("sidebar-nav-icon");
    expect(screen.getByRole("navigation").className).toContain("sidebar-scroll");
  });

  it("keeps a single LTF sidebar when the page component changes", async () => {
    (globalThis as { __sidebarPath?: string }).__sidebarPath = "/en/dashboard/ltf";
    function OverviewPage() {
      return (
        <LtfAdminLayout title="LTF overview" subtitle="Desk">
          <p>Overview body</p>
        </LtfAdminLayout>
      );
    }
    function ClubsPage() {
      return (
        <LtfAdminLayout title="Clubs" subtitle="Register">
          <p>Clubs body</p>
        </LtfAdminLayout>
      );
    }

    const { rerender } = render(
      <LtfDashboardLayout>
        <OverviewPage />
      </LtfDashboardLayout>
    );

    expect(await screen.findByRole("heading", { name: "LTF overview" })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("navCommittee")).toBeInTheDocument();
    });
    const nav = screen.getByRole("navigation");
    nav.scrollTop = 36;

    (globalThis as { __sidebarPath?: string }).__sidebarPath = "/en/dashboard/ltf/clubs";
    rerender(
      <LtfDashboardLayout>
        <ClubsPage />
      </LtfDashboardLayout>
    );

    expect(screen.getAllByRole("navigation")).toHaveLength(1);
    expect(screen.getByRole("navigation")).toBe(nav);
    expect(nav.scrollTop).toBe(36);
    expect(screen.getByRole("heading", { name: "Clubs" })).toBeInTheDocument();
    expect(screen.getByText("navGroupLtfManagement")).toBeInTheDocument();
    expect(screen.getByText("navCommittee")).toBeInTheDocument();
    expect(screen.getByText("navGroupCalendar")).toBeInTheDocument();
  });

  it("locks sidebar item metrics to theme tokens", () => {
    const css = readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8");
    const theme = readFileSync(path.join(process.cwd(), "src/themes/ltf_theme.css"), "utf8");
    expect(theme).toContain("--sidebar-item-height: var(--control-height);");
    expect(theme).toContain("--sidebar-item-font-weight: 500;");
    expect(theme).toContain("--sidebar-item-icon-size: 1rem;");
    expect(theme).toContain("--sidebar-item-padding-x: 0.75rem;");
    expect(css).toContain("height: var(--sidebar-item-height);");
    expect(css).toContain("font-weight: var(--sidebar-item-font-weight);");
    expect(css).toContain("padding: 0 var(--sidebar-item-padding-x);");
    expect(css).toContain("width: var(--sidebar-item-icon-size);");
    expect(css).toContain("scrollbar-gutter: stable;");
    expect(css).not.toMatch(/\.sidebar-nav-link:hover[\s\S]*font-weight/);
    expect(css).not.toMatch(/\.sidebar-nav-link\[aria-current="page"\]/);
  });
});
