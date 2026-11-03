"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useContext, useEffect, useMemo, useState } from "react";
import { BadgeDollarSign, Banknote, CircleDollarSign, FileText, HandCoins, Landmark, LayoutDashboard, Medal, Scale, ScrollText, Wallet } from "lucide-react";

import { AppShell, resolveActiveId, type AppNavItem } from "@/components/app-shell";
import { EmptyState } from "@/components/club-admin/empty-state";
import { DashboardHeaderSync, DashboardShellContext, useDashboardPageHeader } from "@/components/dashboard-shell-context";
import { LtfAdminLayout } from "@/components/ltf-admin/ltf-admin-layout";
import { apiRequest } from "@/lib/api";
import { ltfFinanceSidebarGroup } from "@/lib/sidebar-groups";

type LtfFinanceLayoutProps = {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  persistent?: boolean;
};

type NavMatchMode = "exact" | "prefix";

type LtfFinanceNavDef = {
  id: string;
  href: (locale: string) => string;
  labelKey:
    | "navOverview"
    | "navOrders"
    | "navInvoices"
    | "navPayments"
    | "navIncome"
    | "navExpenses"
    | "navBank"
    | "navReports"
    | "navAuditLog"
    | "navLicenseSettings"
    | "navNationalTeam";
  matchMode: NavMatchMode;
  icon: AppNavItem["icon"];
};

const LTF_FINANCE_NAV_DEFINITIONS: LtfFinanceNavDef[] = [
  {
    id: "overview",
    href: (l) => `/${l}/dashboard/ltf-finance`,
    labelKey: "navOverview",
    matchMode: "exact",
    icon: LayoutDashboard,
  },
  { id: "orders", href: (l) => `/${l}/dashboard/ltf-finance/orders`, labelKey: "navOrders", matchMode: "prefix", icon: Wallet },
  {
    id: "invoices",
    href: (l) => `/${l}/dashboard/ltf-finance/invoices`,
    labelKey: "navInvoices",
    matchMode: "prefix",
    icon: FileText,
  },
  {
    id: "payments",
    href: (l) => `/${l}/dashboard/ltf-finance/payments`,
    labelKey: "navPayments",
    matchMode: "prefix",
    icon: BadgeDollarSign,
  },
  {
    id: "income",
    href: (l) => `/${l}/dashboard/ltf-finance/income`,
    labelKey: "navIncome",
    matchMode: "prefix",
    icon: HandCoins,
  },
  {
    id: "expenses",
    href: (l) => `/${l}/dashboard/ltf-finance/expenses`,
    labelKey: "navExpenses",
    matchMode: "prefix",
    icon: Banknote,
  },
  {
    id: "bank",
    href: (l) => `/${l}/dashboard/ltf-finance/bank`,
    labelKey: "navBank",
    matchMode: "prefix",
    icon: Landmark,
  },
  {
    id: "reports",
    href: (l) => `/${l}/dashboard/ltf-finance/reports`,
    labelKey: "navReports",
    matchMode: "prefix",
    icon: Scale,
  },
  {
    id: "audit-log",
    href: (l) => `/${l}/dashboard/ltf-finance/audit-log`,
    labelKey: "navAuditLog",
    matchMode: "prefix",
    icon: ScrollText,
  },
  {
    id: "license-settings",
    href: (l) => `/${l}/dashboard/ltf-finance/license-settings`,
    labelKey: "navLicenseSettings",
    matchMode: "prefix",
    icon: CircleDollarSign,
  },
  {
    id: "national-team",
    href: (l) => `/${l}/dashboard/ltf-finance/national-team`,
    labelKey: "navNationalTeam",
    matchMode: "prefix",
    icon: Medal,
  },
];

function LtfFinanceShell({ title = "", subtitle, children }: LtfFinanceLayoutProps) {
  const pageHeader = useDashboardPageHeader({ title, subtitle });
  const t = useTranslations("LtfFinance");
  const common = useTranslations("Common");
  const pathname = usePathname();
  const locale = pathname?.split("/")[1] || "en";
  const [access, setAccess] = useState<"loading" | "allowed" | "denied">("loading");

  useEffect(() => {
    let cancelled = false;
    apiRequest<{ role: string; desks?: Array<{ desk: string }> }>("/api/auth/me/")
      .then((me) => {
        const granted = (me.desks ?? []).some((desk) => desk.desk === "ltf_finance");
        if (!cancelled) setAccess(me.role === "ltf_finance" || granted ? "allowed" : "denied");
      })
      .catch(() => {
        if (!cancelled) setAccess("denied");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const navItems = useMemo<AppNavItem[]>(
    () =>
      LTF_FINANCE_NAV_DEFINITIONS.map((def) => ({
        id: def.id,
        href: def.href(locale),
        label: t(def.labelKey),
        icon: def.icon,
        matchMode: def.matchMode,
        group: {
          id: ltfFinanceSidebarGroup().id,
          label: common(ltfFinanceSidebarGroup().labelKey),
        },
      })),
    [common, locale, t]
  );

  const activeLabel = navItems.find((item) => item.id === resolveActiveId(pathname, navItems))?.label ?? "";
  const titleText = pageHeader.title || activeLabel;

  if (access !== "allowed") {
    return (
      <LtfAdminLayout persistent title={access === "denied" ? t("roleDeniedTitle") : t("overviewTitle")}>
        <EmptyState
          title={access === "denied" ? t("roleDeniedTitle") : t("overviewTitle")}
          description={access === "denied" ? t("roleDeniedBody") : undefined}
          loading={access === "loading"}
        />
      </LtfAdminLayout>
    );
  }

  return (
    <DashboardShellContext.Provider value={pageHeader.shell}>
      <AppShell title={titleText} subtitle={pageHeader.subtitle} navItems={navItems}>
        <div className="space-y-3">{children}</div>
      </AppShell>
    </DashboardShellContext.Provider>
  );
}

export function LtfFinanceLayout({ title = "", subtitle, children, persistent = false }: LtfFinanceLayoutProps) {
  const shell = useContext(DashboardShellContext);
  if (persistent || !shell) {
    return (
      <LtfFinanceShell title={title} subtitle={subtitle}>
        {children}
      </LtfFinanceShell>
    );
  }
  return (
    <DashboardHeaderSync title={title} subtitle={subtitle}>
      {children}
    </DashboardHeaderSync>
  );
}
