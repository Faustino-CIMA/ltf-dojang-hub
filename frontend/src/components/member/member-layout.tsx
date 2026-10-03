"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { CalendarDays, Camera, History } from "lucide-react";

import { AppShell, type AppNavItem } from "@/components/app-shell";
import { useCalendarAttention } from "@/components/events/use-calendar-attention";
import { EVENT_CALENDAR_MODULE_ID, getModuleStatus, isInstallEntitled } from "@/lib/modules-api";

type MemberLayoutProps = {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
};

export function MemberLayout({ title, subtitle, children }: MemberLayoutProps) {
  const t = useTranslations("Member");
  const common = useTranslations("Common");
  const pathname = usePathname();
  const locale = pathname?.split("/")[1] || "en";
  const [calendarEntitled, setCalendarEntitled] = useState(false);
  const calendarAttention = useCalendarAttention({ enabled: calendarEntitled });

  useEffect(() => {
    let cancelled = false;
    getModuleStatus()
      .then((status) => {
        if (!cancelled) setCalendarEntitled(isInstallEntitled(status, EVENT_CALENDAR_MODULE_ID));
      })
      .catch(() => {
        if (!cancelled) setCalendarEntitled(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const navItems = useMemo<AppNavItem[]>(
    () => [
      {
        id: "overview",
        href: `/${locale}/dashboard/member`,
        label: t("navOverview"),
        icon: History,
        matchMode: "exact" as const,
        group: { id: "member", label: common("navGroupMember") },
      },
      {
        id: "photo",
        href: `/${locale}/dashboard/member/photo`,
        label: t("navPhoto"),
        icon: Camera,
        matchMode: "prefix" as const,
        group: { id: "member", label: common("navGroupMember") },
      },
      ...(calendarEntitled
        ? [
            {
              id: "calendar",
              href: `/${locale}/dashboard/member/calendar`,
              label: t("navCalendar"),
              icon: CalendarDays,
              matchMode: "prefix" as const,
              group: { id: "calendar", label: common("navGroupCalendar") },
              ...calendarAttention,
            },
          ]
        : []),
    ],
    [calendarAttention, calendarEntitled, common, locale, t]
  );

  return (
    <AppShell title={title} subtitle={subtitle} navItems={navItems}>
      {children}
    </AppShell>
  );
}
