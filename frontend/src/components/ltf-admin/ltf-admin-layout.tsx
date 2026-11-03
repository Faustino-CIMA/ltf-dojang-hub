"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useContext, useEffect, useMemo, useState } from "react";
import {
  ArrowLeftRight,
  Boxes,
  Building2,
  CalendarDays,
  Archive,
  Landmark,
  Medal,
  IdCard,
  LayoutDashboard,
  Layers,
  Printer,
  Settings,
  Sparkles,
  UserCog,
  Users,
} from "lucide-react";

import { AppShell, resolveActiveId, type AppNavItem } from "@/components/app-shell";
import { DashboardHeaderSync, DashboardShellContext, useDashboardPageHeader } from "@/components/dashboard-shell-context";
import { LtfPrintingTabs } from "@/components/ltf-admin/ltf-printing-tabs";
import { ltfSidebarGroup } from "@/lib/sidebar-groups";
import { useCalendarAttention } from "@/components/events/use-calendar-attention";
import {
  CLUB_MANAGEMENT_MODULE_ID,
  EVENT_CALENDAR_MODULE_ID,
  getModuleStatus,
  isInstallEntitled,
  PREVIEW_MODULE_ID,
  type ModuleStatus,
} from "@/lib/modules-api";

type LtfAdminLayoutProps = {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  persistent?: boolean;
};

type NavMatchMode = "exact" | "prefix";

type LtfNavDef = {
  id: string;
  href: (locale: string) => string;
  labelKey:
    | "navOverview"
    | "navClubs"
    | "navModulePurchases"
    | "navClubAdmins"
    | "navMemberTransfers"
    | "navMembers"
    | "navParkedMembers"
    | "navNationalTeam"
    | "navLicenses"
    | "navLicenseCards"
    | "navPrinting"
    | "navLicenseTypes"
    | "navSettings"
    | "navPreview"
    | "navCalendar"
    | "navCommittee";
  matchMode: NavMatchMode;
  icon: AppNavItem["icon"];
};

const LTF_NAV_DEFINITIONS: LtfNavDef[] = [
  { id: "overview", href: (l) => `/${l}/dashboard/ltf`, labelKey: "navOverview", matchMode: "exact", icon: LayoutDashboard },
  { id: "clubs", href: (l) => `/${l}/dashboard/ltf/clubs`, labelKey: "navClubs", matchMode: "prefix", icon: Building2 },
  {
    id: "module-purchases",
    href: (l) => `/${l}/dashboard/ltf/module-purchases`,
    labelKey: "navModulePurchases",
    matchMode: "prefix",
    icon: Boxes,
  },
  { id: "club-admins", href: (l) => `/${l}/dashboard/ltf/club-admins`, labelKey: "navClubAdmins", matchMode: "prefix", icon: UserCog },
  { id: "member-transfers", href: (l) => `/${l}/dashboard/ltf/member-transfers`, labelKey: "navMemberTransfers", matchMode: "prefix", icon: ArrowLeftRight },
  { id: "members", href: (l) => `/${l}/dashboard/ltf/members`, labelKey: "navMembers", matchMode: "prefix", icon: Users },
  { id: "parked-members", href: (l) => `/${l}/dashboard/ltf/parked-members`, labelKey: "navParkedMembers", matchMode: "prefix", icon: Archive },
  { id: "national-team", href: (l) => `/${l}/dashboard/ltf/national-team`, labelKey: "navNationalTeam", matchMode: "prefix", icon: Medal },
  { id: "licenses", href: (l) => `/${l}/dashboard/ltf/licenses`, labelKey: "navLicenses", matchMode: "prefix", icon: IdCard },
  {
    id: "license-cards",
    href: (l) => `/${l}/dashboard/ltf/license-cards`,
    labelKey: "navLicenseCards",
    matchMode: "prefix",
    icon: Sparkles,
  },
  {
    id: "printing",
    href: (l) => `/${l}/dashboard/ltf/license-cards/print-jobs`,
    labelKey: "navPrinting",
    matchMode: "prefix",
    icon: Printer,
  },
  {
    id: "license-types",
    href: (l) => `/${l}/dashboard/ltf/license-types`,
    labelKey: "navLicenseTypes",
    matchMode: "prefix",
    icon: Layers,
  },
  { id: "settings", href: (l) => `/${l}/dashboard/ltf/settings`, labelKey: "navSettings", matchMode: "prefix", icon: Settings },
  { id: "calendar", href: (l) => `/${l}/dashboard/ltf/calendar`, labelKey: "navCalendar", matchMode: "prefix", icon: CalendarDays },
  { id: "committee", href: (l) => `/${l}/dashboard/ltf/committee`, labelKey: "navCommittee", matchMode: "prefix", icon: Landmark },
  { id: "preview", href: (l) => `/${l}/dashboard/ltf/preview`, labelKey: "navPreview", matchMode: "prefix", icon: Sparkles },
];

function LtfAdminShell({ title = "", subtitle, children }: LtfAdminLayoutProps) {
  const pageHeader = useDashboardPageHeader({ title, subtitle });
  const t = useTranslations("LtfAdmin");
  const common = useTranslations("Common");
  const pathname = usePathname();
  const locale = pathname?.split("/")[1] || "en";
  const [modules, setModules] = useState<ModuleStatus | null>(null);
  const isDesignerWorkspace = /\/dashboard\/ltf\/license-cards\/[^/]+\/designer(?:\/|$)/.test(
    pathname || ""
  );
  const isPrinting =
    pathname?.includes("/dashboard/ltf/license-cards/print-jobs") ||
    pathname?.includes("/dashboard/ltf/printer-profiles");

  useEffect(() => {
    let cancelled = false;
    getModuleStatus()
      .then((status) => {
        if (!cancelled) setModules(status);
      })
      .catch(() => {
        if (!cancelled) setModules(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const previewEntitled = isInstallEntitled(modules, PREVIEW_MODULE_ID);
  const calendarEntitled = isInstallEntitled(modules, EVENT_CALENDAR_MODULE_ID);
  const clubMgmtEntitled = isInstallEntitled(modules, CLUB_MANAGEMENT_MODULE_ID);
  const calendarAttention = useCalendarAttention({
    enabled: calendarEntitled,
    scope: "federation",
  });

  const navItems = useMemo<AppNavItem[]>(
    () =>
      LTF_NAV_DEFINITIONS.filter((def) => {
        if (def.id === "preview") return previewEntitled;
        if (def.id === "calendar") return calendarEntitled;
        if (def.id === "committee") return clubMgmtEntitled;
        return true;
      }).map((def, index) => ({
        index,
        item: {
          id: def.id,
          href: def.href(locale),
          label: t(def.labelKey),
          icon: def.icon,
          matchMode: def.matchMode,
          group: {
            id: ltfSidebarGroup(def.id).id,
            label: common(ltfSidebarGroup(def.id).labelKey),
          },
          ...(def.id === "calendar" ? calendarAttention : {}),
          ...(def.id === "printing"
            ? { extraMatchHrefs: [`/${locale}/dashboard/ltf/printer-profiles`] }
            : {}),
        },
      }))
      .sort((left, right) => {
        const rank = (id: string) => (id === "calendar" ? 1 : id === "preview" ? 2 : 0);
        return rank(left.item.group?.id ?? "") - rank(right.item.group?.id ?? "") || left.index - right.index;
      })
      .map((entry) => entry.item),
    [calendarAttention, calendarEntitled, clubMgmtEntitled, common, locale, previewEntitled, t]
  );

  const activeLabel = navItems.find((item) => item.id === resolveActiveId(pathname, navItems))?.label ?? "";
  const titleText = pageHeader.title || activeLabel;
  const isWelcome = pathname === `/${locale}/dashboard/ltf`;

  return (
    <DashboardShellContext.Provider value={pageHeader.shell}>
      <AppShell
        title={titleText}
        subtitle={pageHeader.subtitle}
        navItems={navItems}
        variant={isDesignerWorkspace ? "workspace" : "default"}
        tone={isWelcome ? "overview" : "default"}
      >
        {isPrinting ? (
          <div className="space-y-3">
            <LtfPrintingTabs />
            {children}
          </div>
        ) : (
          children
        )}
      </AppShell>
    </DashboardShellContext.Provider>
  );
}

export function LtfAdminLayout({ title = "", subtitle, children, persistent = false }: LtfAdminLayoutProps) {
  const shell = useContext(DashboardShellContext);
  if (persistent || !shell) {
    return (
      <LtfAdminShell title={title} subtitle={subtitle}>
        {children}
      </LtfAdminShell>
    );
  }
  return (
    <DashboardHeaderSync title={title} subtitle={subtitle}>
      {children}
    </DashboardHeaderSync>
  );
}
