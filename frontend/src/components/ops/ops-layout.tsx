"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  Boxes,
  GitMerge,
  KeyRound,
  Database,
  Languages,
  LayoutDashboard,
  Printer,
  ScrollText,
  ShieldAlert,
  Users,
} from "lucide-react";

import { AppShell, type AppNavItem } from "@/components/app-shell";
import { apiRequest } from "@/lib/api";
import { getDashboardRouteForRole } from "@/lib/dashboard-routing";
import { getSetupStatus } from "@/lib/setup-api";
import { LoadingCardGrid } from "@/components/ui/loading-card";

type OpsLayoutProps = {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
};

type MeResponse = {
  role: string;
  is_superuser?: boolean;
};

const OPS_NAV: Array<{
  id: string;
  href: (locale: string) => string;
  labelKey:
    | "navOverview"
    | "navSecurity"
    | "navUsers"
    | "navQueries"
    | "navTranslations"
    | "navJobs"
    | "navAudit"
    | "navModules"
    | "navDesks"
    | "navMerges";
  matchMode: AppNavItem["matchMode"];
  icon: AppNavItem["icon"];
}> = [
  { id: "overview", href: (l) => `/${l}/dashboard/ops`, labelKey: "navOverview", matchMode: "exact", icon: LayoutDashboard },
  { id: "security", href: (l) => `/${l}/dashboard/ops/security`, labelKey: "navSecurity", matchMode: "prefix", icon: ShieldAlert },
  { id: "users", href: (l) => `/${l}/dashboard/ops/users`, labelKey: "navUsers", matchMode: "prefix", icon: Users },
  { id: "queries", href: (l) => `/${l}/dashboard/ops/queries`, labelKey: "navQueries", matchMode: "prefix", icon: Database },
  { id: "translations", href: (l) => `/${l}/dashboard/ops/translations`, labelKey: "navTranslations", matchMode: "prefix", icon: Languages },
  { id: "jobs", href: (l) => `/${l}/dashboard/ops/jobs`, labelKey: "navJobs", matchMode: "prefix", icon: Printer },
  { id: "modules", href: (l) => `/${l}/dashboard/ops/modules`, labelKey: "navModules", matchMode: "prefix", icon: Boxes },
  { id: "desks", href: (l) => `/${l}/dashboard/ops/desks`, labelKey: "navDesks", matchMode: "prefix", icon: KeyRound },
  { id: "merges", href: (l) => `/${l}/dashboard/ops/merges`, labelKey: "navMerges", matchMode: "prefix", icon: GitMerge },
  { id: "audit", href: (l) => `/${l}/dashboard/ops/audit`, labelKey: "navAudit", matchMode: "prefix", icon: ScrollText },
];

export function OpsLayout({ title, subtitle, children }: OpsLayoutProps) {
  const t = useTranslations("Ops");
  const common = useTranslations("Common");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const setupT = useTranslations("Setup");
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const me = await apiRequest<MeResponse>("/api/auth/me/");
        if (cancelled) return;
        if (!me.is_superuser) {
          const fallback = getDashboardRouteForRole(me.role, locale) ?? `/${locale}/dashboard`;
          router.replace(fallback);
          setAllowed(false);
          return;
        }
        setAllowed(true);
      } catch {
        if (!cancelled) {
          router.replace(`/${locale}/login`);
          setAllowed(false);
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [locale, router]);

  useEffect(() => {
    if (allowed !== true) {
      return;
    }
    let cancelled = false;
    getSetupStatus()
      .then((status) => {
        if (cancelled) return;
        setSetupOpen(status.available);
        if (status.available && pathname === `/${locale}/dashboard/ops`) {
          router.replace(`/${locale}/setup`);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [allowed, locale, pathname, router]);

  const navItems = useMemo<AppNavItem[]>(
    () =>
      OPS_NAV.map((def) => ({
        id: def.id,
        href: def.href(locale),
        label: t(def.labelKey),
        icon: def.icon,
        matchMode: def.matchMode,
        group: { id: "operations", label: common("navGroupOperations") },
      })),
    [common, locale, t],
  );

  if (allowed !== true) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-6">
        <div className="w-full max-w-3xl">
          <LoadingCardGrid title={common("loadingLabel")} description={t("overviewSubtitle")} />
        </div>
      </main>
    );
  }

  return (
    <AppShell title={title} subtitle={subtitle} navItems={navItems}>
      <div className="space-y-3">
        {setupOpen ? (
          <Link
            href={`/${locale}/setup`}
            className="block rounded-[var(--radius-form)] border border-border bg-card px-3 py-2 text-sm text-foreground"
          >
            {setupT("finishSetupBanner")}
          </Link>
        ) : null}
        {children}
      </div>
    </AppShell>
  );
}
