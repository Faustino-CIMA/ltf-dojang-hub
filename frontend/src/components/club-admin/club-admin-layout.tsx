"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";

import { apiRequest } from "@/lib/api";
import {
  ArrowLeftRight,
  CalendarDays,
  Award,
  Timer,
  UsersRound,
  FileText,
  IdCard,
  LayoutDashboard,
  Printer,
  Settings,
  Package,
  ShoppingCart,
  Sparkles,
  UserCog,
  Users,
  Wallet,
} from "lucide-react";

import { IncomingTransferNotice } from "@/components/club-admin/incoming-transfer-notice";
import { ClubPrintingTabs } from "@/components/club-admin/club-printing-tabs";
import { ClubTrainingTabs } from "@/components/club-admin/club-training-tabs";
import { useClubSelection } from "@/components/club-selection-provider";
import { AppShell, type AppNavItem } from "@/components/app-shell";
import {
  CLUB_MANAGEMENT_MODULE_ID,
  EVENT_CALENDAR_MODULE_ID,
  getModuleStatus,
  isClubModuleAssigned,
  PREVIEW_MODULE_ID,
  type ModuleStatus,
} from "@/lib/modules-api";

type ClubAdminLayoutProps = {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
};

type NavMatchMode = "exact" | "prefix";

type ClubNavDef = Readonly<{
  id: string;
  routePath: string;
  labelKey:
    | "navOverview"
    | "navMembers"
    | "navLicenses"
    | "navPrintJobs"
    | "navPrinting"
    | "navOrders"
    | "navInvoices"
    | "navFinance"
    | "navTransfers"
    | "navAdmins"
    | "navPrinterProfiles"
    | "navSettings"
    | "navPreview"
    | "navCalendar"
    | "navFamilies"
    | "navShop"
    | "navTraining"
    | "navPromotion";
  matchMode: NavMatchMode;
  icon: AppNavItem["icon"];
}>;

const CLUB_NAV_DEFINITIONS: readonly ClubNavDef[] = Object.freeze([
  Object.freeze({
    id: "overview",
    routePath: "dashboard/club",
    labelKey: "navOverview",
    matchMode: "exact",
    icon: LayoutDashboard,
  } satisfies ClubNavDef),
  Object.freeze({
    id: "members",
    routePath: "dashboard/club/members",
    labelKey: "navMembers",
    matchMode: "prefix",
    icon: Users,
  } satisfies ClubNavDef),
  Object.freeze({
    id: "licenses",
    routePath: "dashboard/club/licenses",
    labelKey: "navLicenses",
    matchMode: "prefix",
    icon: IdCard,
  } satisfies ClubNavDef),
  Object.freeze({
    id: "printing",
    routePath: "dashboard/club/print-jobs",
    labelKey: "navPrinting",
    matchMode: "prefix",
    icon: Printer,
  } satisfies ClubNavDef),
  Object.freeze({
    id: "finance",
    routePath: "dashboard/club/invoices",
    labelKey: "navFinance",
    matchMode: "prefix",
    icon: Wallet,
  } satisfies ClubNavDef),
  Object.freeze({
    id: "orders",
    routePath: "dashboard/club/orders",
    labelKey: "navOrders",
    matchMode: "prefix",
    icon: ShoppingCart,
  } satisfies ClubNavDef),
  Object.freeze({
    id: "invoices",
    routePath: "dashboard/club/invoices",
    labelKey: "navInvoices",
    matchMode: "prefix",
    icon: FileText,
  } satisfies ClubNavDef),
  Object.freeze({
    id: "transfers",
    routePath: "dashboard/club/transfers",
    labelKey: "navTransfers",
    matchMode: "prefix",
    icon: ArrowLeftRight,
  } satisfies ClubNavDef),
  Object.freeze({
    id: "calendar",
    routePath: "dashboard/club/calendar",
    labelKey: "navCalendar",
    matchMode: "prefix",
    icon: CalendarDays,
  } satisfies ClubNavDef),
  Object.freeze({
    id: "families",
    routePath: "dashboard/club/families",
    labelKey: "navFamilies",
    matchMode: "prefix",
    icon: UsersRound,
  } satisfies ClubNavDef),
  Object.freeze({
    id: "training",
    routePath: "dashboard/club/training",
    labelKey: "navTraining",
    matchMode: "prefix",
    icon: Timer,
  } satisfies ClubNavDef),
  Object.freeze({
    id: "promotion",
    routePath: "dashboard/club/promotion",
    labelKey: "navPromotion",
    matchMode: "prefix",
    icon: Award,
  } satisfies ClubNavDef),
  Object.freeze({
    id: "shop",
    routePath: "dashboard/club/shop",
    labelKey: "navShop",
    matchMode: "prefix",
    icon: Package,
  } satisfies ClubNavDef),
  Object.freeze({
    id: "preview",
    routePath: "dashboard/club/preview",
    labelKey: "navPreview",
    matchMode: "prefix",
    icon: Sparkles,
  } satisfies ClubNavDef),
  Object.freeze({
    id: "admins",
    routePath: "dashboard/club/admins",
    labelKey: "navAdmins",
    matchMode: "prefix",
    icon: UserCog,
  } satisfies ClubNavDef),
  Object.freeze({
    id: "settings",
    routePath: "dashboard/club/settings",
    labelKey: "navSettings",
    matchMode: "prefix",
    icon: Settings,
  } satisfies ClubNavDef),
]);

export function ClubAdminLayout({ title, subtitle, children }: ClubAdminLayoutProps) {
  const t = useTranslations("ClubAdmin");
  const pathname = usePathname();
  const locale = pathname?.split("/")[1] || "en";
  const { selectedClubId } = useClubSelection();
  const [role, setRole] = useState<string | null>(null);
  const [modules, setModules] = useState<ModuleStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiRequest<{ role: string }>("/api/auth/me/")
      .then((me) => {
        if (!cancelled) setRole(me.role);
      })
      .catch(() => {
        if (!cancelled) setRole(null);
      });
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

  const previewAssigned = isClubModuleAssigned(modules, PREVIEW_MODULE_ID, selectedClubId);
  const calendarAssigned = isClubModuleAssigned(modules, EVENT_CALENDAR_MODULE_ID, selectedClubId);
  const clubMgmtAssigned = isClubModuleAssigned(modules, CLUB_MANAGEMENT_MODULE_ID, selectedClubId);

  const navItems = useMemo<AppNavItem[]>(
    () =>
      CLUB_NAV_DEFINITIONS.filter((def) => {
        if (def.id === "admins") return role === "club_admin";
        if (def.id === "preview") return role === "club_admin" && previewAssigned;
        if (def.id === "calendar") return calendarAssigned;
        if (def.id === "families" || def.id === "shop") return role === "club_admin" && clubMgmtAssigned;
        if (def.id === "training" || def.id === "promotion") return (role === "club_admin" || role === "coach") && clubMgmtAssigned;
        if (def.id === "finance") return role === "club_admin" && clubMgmtAssigned;
        if (def.id === "orders" || def.id === "invoices") return !clubMgmtAssigned;
        return true;
      }).map((def) => ({
        id: def.id,
        href: `/${locale}/${def.routePath}`,
        label: t(def.labelKey),
        icon: def.icon,
        matchMode: def.matchMode,
        extraMatchHrefs:
          def.id === "finance"
            ? [
                `/${locale}/dashboard/club/orders`,
                `/${locale}/dashboard/club/invoices`,
                `/${locale}/dashboard/club/payments`,
                `/${locale}/dashboard/club/income`,
                `/${locale}/dashboard/club/expenses`,
                `/${locale}/dashboard/club/reports`,
              ]
            : def.id === "printing"
              ? [`/${locale}/dashboard/club/printer-profiles`]
              : undefined,
      })),
    [calendarAssigned, clubMgmtAssigned, locale, previewAssigned, role, t]
  );

  const isPrinting =
    pathname?.includes("/dashboard/club/print-jobs") || pathname?.includes("/dashboard/club/printer-profiles");
  const isTraining = pathname?.includes("/dashboard/club/training");

  return (
    <AppShell title={title} subtitle={subtitle} navItems={navItems}>
      <IncomingTransferNotice />
      {isPrinting || isTraining ? (
        <div className="space-y-6">
          {isPrinting ? <ClubPrintingTabs /> : null}
          {isTraining ? <ClubTrainingTabs /> : null}
          {children}
        </div>
      ) : (
        children
      )}
    </AppShell>
  );
}
