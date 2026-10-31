"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { LucideIcon } from "lucide-react";
import { Menu, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";

import { apiRequest } from "@/lib/api";
import {
  defaultDesk,
  deskHeaderValue,
  grantForPath,
  headerMatchesPath,
  pathNeedsDesk,
  readActiveDeskHeader,
  rememberActiveDesk,
  clearActiveDesk,
  type DeskChoice,
} from "@/lib/active-desk";
import { logout, selectDesk } from "@/lib/auth-api";
import { clearToken, getToken, type MfaStatus } from "@/lib/auth";
import { MfaSecurityPanel } from "@/components/mfa-security-panel";
import { presentAuthError } from "@/lib/auth-errors";
import { getDashboardRouteForRole, routeForDesk } from "@/lib/dashboard-routing";
import { isLeavingDeepLink, showLegacyClubPicker } from "@/lib/desk-switch";
import { DeskSwitchAsk, DeskSwitcher, deskLabel } from "@/components/desk-switcher";
import {
  ALL_CLUBS_SELECT_VALUE,
  allowsAllClubsSelection,
  persistSelectedClubId,
  resolveAssignedClubId,
  shouldShowClubSelector,
  useClubSelection,
} from "@/components/club-selection-provider";
import { AppVersionLink } from "@/components/app-version-link";
import { ClubSwitcher } from "@/components/club-switcher";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { PageNotice } from "@/components/ui/list-page-chrome";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";

export type AppNavGroup = {
  id: string;
  label: string;
};

export type AppNavItem = {
  id: string;
  href: string;
  label: string;
  icon: LucideIcon;
  matchMode: "exact" | "prefix";
  extraMatchHrefs?: string[];
  group?: AppNavGroup;
  badgeCount?: number;
  badgeNew?: string;
};

const SIDEBAR_COLLAPSED_KEY = "ltf-sidebar-collapsed";

type AppShellProps = {
  title: string;
  subtitle?: string;
  navItems: AppNavItem[];
  children: React.ReactNode;
  variant?: "default" | "workspace";
  tone?: "default" | "brand" | "overview";
};

type AuthMeResponse = {
  username: string;
  first_name: string;
  role: string;
  is_superuser?: boolean;
  demo_mode?: boolean;
  home_club_id?: number | null;
  desks?: DeskChoice[];
  last_desk?: { desk: string; level: string; club_id: number | null } | null;
  mfa?: MfaStatus;
};

function SwitchRefusal({
  message,
  setupLabel,
  onSetup,
}: {
  message: string;
  setupLabel: string;
  onSetup: () => void;
}) {
  const shown = presentAuthError(message);
  const offerSetup = shown.code === "mfa_enrol_required" || shown.code === "mfa_required" || shown.code === "mfa_recovery_required";
  return (
    <div className="space-y-3">
      <PageNotice tone={shown.tone}>{shown.text}</PageNotice>
      {offerSetup ? (
        <Button type="button" variant="primary" onClick={onSetup}>
          {setupLabel}
        </Button>
      ) : null}
    </div>
  );
}

function daysUntil(until: string): number {
  const end = new Date(`${until.slice(0, 10)}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((end.getTime() - today.getTime()) / 86400000));
}

function pathMatches(pathname: string, href: string, matchMode: AppNavItem["matchMode"]) {
  if (matchMode === "exact") {
    return pathname === href;
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

function itemMatches(pathname: string, item: AppNavItem) {
  if (pathMatches(pathname, item.href, item.matchMode)) {
    return true;
  }
  return (item.extraMatchHrefs ?? []).some((href) => pathMatches(pathname, href, "prefix"));
}

export function resolveActiveId(pathname: string | null, items: AppNavItem[]) {
  if (!pathname) {
    return null;
  }
  let best: AppNavItem | null = null;
  for (const item of items) {
    if (!itemMatches(pathname, item)) {
      continue;
    }
    const score = Math.max(
      item.href.length,
      ...(item.extraMatchHrefs ?? []).map((href) => href.length),
    );
    if (!best || score > Math.max(best.href.length, ...(best.extraMatchHrefs ?? []).map((href) => href.length))) {
      best = item;
    }
  }
  return best?.id ?? null;
}

export function AppShell({ title, subtitle, navItems, children, variant = "default", tone = "default" }: AppShellProps) {
  const t = useTranslations("Common");
  const authCopy = useTranslations("Auth");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [navOpen, setNavOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [collapseReady, setCollapseReady] = useState(false);
  const [me, setMe] = useState<AuthMeResponse | null>(null);
  const [activeHeader, setActiveHeader] = useState<string | null>(null);
  const [pendingDesk, setPendingDesk] = useState<DeskChoice | null>(null);
  const [securityOpen, setSecurityOpen] = useState(false);
  const [switchNotice, setSwitchNotice] = useState<string | null>(null);
  const suppressAsk = useRef(false);
  const { clubs, selectedClubId, setSelectedClubId } = useClubSelection();
  const allowAllClubs = allowsAllClubsSelection(pathname);
  const visibleClubId = resolveAssignedClubId(clubs, selectedClubId);
  const showClubSelector = clubs.length > 0 && shouldShowClubSelector(pathname);
  const clubSelectValue = allowAllClubs
    ? selectedClubId && clubs.some((club) => club.id === selectedClubId)
      ? String(selectedClubId)
      : ALL_CLUBS_SELECT_VALUE
    : visibleClubId
      ? String(visibleClubId)
      : undefined;

  const activeId = useMemo(() => resolveActiveId(pathname, navItems), [pathname, navItems]);

  useEffect(() => {
    if (allowAllClubs) {
      return;
    }
    if (visibleClubId && visibleClubId !== selectedClubId) {
      setSelectedClubId(visibleClubId);
    }
  }, [allowAllClubs, visibleClubId, selectedClubId, setSelectedClubId]);

  useEffect(() => {
    setCollapsed(window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1");
    setCollapseReady(true);
  }, []);

  useEffect(() => {
    if (!collapseReady) {
      return;
    }
    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? "1" : "0");
  }, [collapseReady, collapsed]);

  useEffect(() => {
    if (!getToken()) {
      return;
    }
    let cancelled = false;
    const loadMe = async () => {
      try {
        const response = await apiRequest<AuthMeResponse>("/api/auth/me/");
        if (!cancelled) {
          setMe(response);
          const desks = response.desks ?? [];
          if (!readActiveDeskHeader()) {
            const chosen = defaultDesk(desks, response.last_desk ?? null, response.role, response.home_club_id ?? null);
            if (chosen) {
              rememberActiveDesk(deskHeaderValue(chosen));
              if (chosen.club_id) {
                persistSelectedClubId(chosen.club_id);
              }
            }
          }
          setActiveHeader(readActiveDeskHeader());
        }
      } catch {
        if (!cancelled) {
          setMe(null);
        }
      }
    };
    void loadMe();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSignOut = async () => {
    await logout();
    clearToken();
    clearActiveDesk();
    persistSelectedClubId(null);
    setMe(null);
    router.push(`/${locale}/login`);
  };

  const desks = me?.desks ?? [];
  const activeDesk = desks.find((desk) => deskHeaderValue(desk) === (activeHeader ?? readActiveDeskHeader())) ?? null;
  const needed = pathNeedsDesk(pathname);
  const neededGrant = grantForPath(desks, needed);
  const askToSwitch =
    desks.length > 1 &&
    neededGrant != null &&
    !headerMatchesPath(activeHeader ?? readActiveDeskHeader(), needed);

  useEffect(() => {
    if (suppressAsk.current) {
      suppressAsk.current = false;
      return;
    }
    setPendingDesk(askToSwitch ? neededGrant : null);
  }, [askToSwitch, neededGrant]);

  useEffect(() => {
    if (desks.length < 2 || !activeDesk?.club_id || activeDesk.club_id === selectedClubId) {
      return;
    }
    setSelectedClubId(activeDesk.club_id);
  }, [activeDesk, desks.length, selectedClubId, setSelectedClubId]);

  const deskNames: Record<string, string> = {
    ltf_admin: t("roleLtfAdmin"),
    ltf_finance: t("roleLtfFinance"),
    club_admin: t("roleClubAdmin"),
    coach: t("roleCoach"),
    member: t("roleMember"),
    ops: t("roleSuperuser"),
  };

  const applySwitch = async (desk: DeskChoice) => {
    suppressAsk.current = true;
    setSwitchNotice(null);
    try {
      const saved = await selectDesk(desk);
      const header = deskHeaderValue(saved);
      if (saved.club_id) {
        persistSelectedClubId(saved.club_id);
        setSelectedClubId(saved.club_id);
      }
      rememberActiveDesk(header);
      setActiveHeader(header);
      const route = routeForDesk(saved.desk, locale);
      if (route && pathname !== route) {
        router.push(route);
      }
      setPendingDesk(null);
      const response = await apiRequest<AuthMeResponse>("/api/auth/me/");
      setMe(response);
    } catch (error) {
      suppressAsk.current = false;
      setSwitchNotice(error instanceof Error ? error.message : "");
    }
  };

  const requestSwitch = (desk: DeskChoice) => {
    if (activeDesk && isLeavingDeepLink(pathname, activeDesk.desk, locale)) {
      setPendingDesk(desk);
      return;
    }
    void applySwitch(desk);
  };

  const displayName = me?.first_name?.trim() || me?.username || t("welcomeFallbackName");
  const roleLabel = me
    ? me.is_superuser
      ? t("roleSuperuser")
      : ({
          ltf_admin: t("roleLtfAdmin"),
          ltf_finance: t("roleLtfFinance"),
          club_admin: t("roleClubAdmin"),
          coach: t("roleCoach"),
          member: t("roleMember"),
        }[me.role] ?? me.role)
    : "";
  const roleTone = me?.is_superuser
    ? "danger"
    : me?.role === "ltf_finance"
      ? "warning"
      : me?.role === "club_admin"
        ? "success"
        : "info";

  const isOpsDashboard = (pathname || "").includes("/dashboard/ops");
  const federationHref = me
    ? getDashboardRouteForRole(me.role, locale)
    : null;
  const showOpsConsoleButton = Boolean(me?.is_superuser && !isOpsDashboard);
  const showFederationDashboardButton = Boolean(
    me?.is_superuser &&
      isOpsDashboard &&
      federationHref &&
      !federationHref.includes("/dashboard/ops"),
  );

  const renderSidebar = (iconOnly: boolean, showCollapse: boolean) => {
    const blocks: Array<{ key: string; group: AppNavGroup | null; items: AppNavItem[] }> = [];
    for (const item of navItems) {
      const groupId = item.group?.id ?? "";
      const last = blocks[blocks.length - 1];
      if (last && (last.group?.id ?? "") === groupId) {
        last.items.push(item);
      } else {
        blocks.push({ key: groupId || `plain-${item.id}`, group: item.group ?? null, items: [item] });
      }
    }

    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className={cn("flex items-center gap-2 py-3", iconOnly ? "justify-center px-2" : "px-3")}>
          <Image
            src="/brand/ltf-logo-transparent.png"
            alt="LTF"
            width={113}
            height={34}
            className={iconOnly ? "brand-logo-compact" : "brand-logo-sidebar"}
          />
          {iconOnly ? null : (
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold leading-tight text-foreground">{t("appTitle")}</p>
              <p className="text-meta leading-tight">{t("appTagline")}</p>
            </div>
          )}
        </div>
        <nav aria-label={t("navigationLabel")} className={cn("sidebar-scroll flex min-h-0 flex-1 flex-col gap-1 pb-4", iconOnly ? "px-2" : "px-3")}>
          {blocks.map((block, index) => (
            <div key={block.key} className="flex flex-col gap-1">
              {index > 0 ? (
                <div className={cn("mx-2 border-t border-border", iconOnly ? "my-1" : "mt-3")} role="presentation" />
              ) : null}
              {block.group && !iconOnly ? (
                <p className={cn("sidebar-group-label px-3 pb-1 text-center text-sm italic uppercase tracking-wide text-muted", index === 0 ? "pt-1" : "pt-3")}>
                  {block.group.label}
                </p>
              ) : null}
              {block.group && iconOnly ? <p className="sr-only">{block.group.label}</p> : null}
              {block.items.map((item) => {
                const Icon = item.icon;
                const isActive = item.id === activeId;
                const countLabel = item.badgeCount ? (item.badgeCount > 99 ? "99+" : String(item.badgeCount)) : "";
                const attentionLabel = [item.badgeNew, countLabel].filter(Boolean).join(" ");
                const accessibleName = attentionLabel ? `${item.label}, ${attentionLabel}` : undefined;
                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    title={iconOnly ? accessibleName ?? item.label : undefined}
                    aria-label={accessibleName}
                    aria-current={isActive ? "page" : undefined}
                    data-has-badge={item.badgeCount || item.badgeNew ? "true" : undefined}
                    onClick={() => setNavOpen(false)}
                    className={cn(
                      "sidebar-nav-link relative transition-colors",
                      iconOnly && "sidebar-nav-link-icon",
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "text-muted hover:bg-secondary hover:text-foreground"
                    )}
                  >
                    {item.badgeNew ? (
                      <span
                        className={cn(
                          "pointer-events-none absolute left-1/2 top-0.5 -translate-x-1/2 text-xs font-semibold leading-none",
                          isActive ? "text-primary-foreground" : "text-primary"
                        )}
                      >
                        {item.badgeNew}
                      </span>
                    ) : null}
                    {countLabel ? (
                      <span
                        className={cn(
                          "pointer-events-none absolute right-1 top-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-[var(--radius-chip)] px-1.5 text-xs font-semibold",
                          isActive ? "bg-surface text-primary" : "bg-primary text-primary-foreground"
                        )}
                      >
                        {countLabel}
                      </span>
                    ) : null}
                    <Icon className="sidebar-nav-icon size-4 shrink-0" aria-hidden />
                    <span className={cn("truncate", iconOnly && "sr-only")}>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <div className={cn("mt-auto flex border-t border-border", iconOnly ? "flex-col items-center gap-1 px-2 py-2" : "items-center gap-2 px-3 py-3")}>
          {showCollapse ? (
            <button
              type="button"
              className="inline-flex size-[var(--control-height)] shrink-0 items-center justify-center rounded-[var(--radius-control)] text-muted hover:bg-secondary hover:text-foreground"
              aria-pressed={iconOnly}
              aria-label={iconOnly ? t("sidebarExpand") : t("sidebarCollapse")}
              onClick={() => setCollapsed((current) => !current)}
            >
              {iconOnly ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
            </button>
          ) : null}
          <AppVersionLink className={iconOnly ? "sr-only" : "min-w-0"} />
        </div>
      </div>
    );
  };

  const isWorkspace = variant === "workspace";

  return (
    <div
      data-tone={tone === "brand" ? "brand" : undefined}
      className={cn("bg-background text-foreground", isWorkspace ? "flex h-screen overflow-hidden" : "min-h-screen lg:flex")}
    >
      {isWorkspace ? null : (
        <aside
          className={cn(
            "sticky top-0 hidden h-screen shrink-0 overflow-hidden border-r border-border bg-surface transition-[width] duration-200 lg:block",
            collapsed ? "w-[var(--sidebar-width-collapsed)]" : "w-[var(--sidebar-width)]"
          )}
        >
          {renderSidebar(collapsed, true)}
        </aside>
      )}

      {navOpen && !isWorkspace ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-[var(--modal-backdrop)]"
            aria-label={t("navClose")}
            onClick={() => setNavOpen(false)}
          />
          <aside className="relative h-full w-[min(var(--sidebar-width),86vw)] bg-surface shadow-[var(--shadow-float)]">
            <button
              type="button"
              className="absolute right-3 top-3 inline-flex size-[var(--control-height)] items-center justify-center rounded-[var(--radius-control)] text-muted hover:bg-secondary hover:text-foreground"
              onClick={() => setNavOpen(false)}
              aria-label={t("navClose")}
            >
              <X className="size-5" />
            </button>
            {renderSidebar(false, false)}
          </aside>
        </div>
      ) : null}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="z-40 shrink-0 border-b border-border/80 bg-surface/90 backdrop-blur-md">
          <div
            className={cn(
              "flex min-h-[var(--topbar-height)] flex-wrap items-center justify-between gap-3",
              isWorkspace ? "px-3 py-1.5" : "px-[var(--page-padding-x)] py-1.5"
            )}
          >
            <div className="flex min-w-0 items-center gap-3">
              {isWorkspace ? null : (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="lg:hidden"
                  onClick={() => setNavOpen(true)}
                  aria-label={t("navOpen")}
                >
                  <Menu className="size-4" />
                </Button>
              )}
              <div className="min-w-0">
                {tone === "brand" || tone === "overview" ? (
                  <h1 className="sr-only">{title}</h1>
                ) : (
                  <h1 className="text-title truncate text-foreground">{title}</h1>
                )}
                {subtitle && !isWorkspace && tone !== "brand" && tone !== "overview" ? <p className="mt-0.5 truncate text-meta">{subtitle}</p> : null}
                {activeDesk?.level === "read_only" ? (
                  <p className="mt-0.5 text-meta text-muted">{t("deskViewOnly")}</p>
                ) : null}
              </div>
            </div>

            <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-3">
              {showLegacyClubPicker(desks.length) && showClubSelector ? (
                <ClubSwitcher
                  clubs={clubs}
                  value={clubSelectValue}
                  onValueChange={(value) =>
                    setSelectedClubId(value === ALL_CLUBS_SELECT_VALUE ? null : Number(value))
                  }
                  allowAllClubs={allowAllClubs}
                  allClubsLabel={t("allClubsOption")}
                  placeholder={t("selectedClubPlaceholder")}
                  ariaLabel={t("selectedClubLabel")}
                  searchPlaceholder={t("clubSearchPlaceholder")}
                  emptyMessage={t("clubSearchEmpty")}
                />
              ) : null}

              {me?.demo_mode ? (
                <p className="rounded-[var(--radius-control)] border border-border bg-secondary px-2.5 py-1 text-meta text-foreground">
                  {t("demoBadge")}
                </p>
              ) : null}

              {desks.length > 1 ? (
                <DeskSwitcher
                  desks={desks}
                  active={activeDesk}
                  names={deskNames}
                  viewOnlyLabel={t("deskViewOnly")}
                  menuLabel={t("deskSwitcherLabel")}
                  onSelect={requestSwitch}
                />
              ) : null}

              {me ? (
                <div className="hidden items-center gap-2 sm:flex">
                  <div className="min-w-0 text-right">
                    <p className="truncate text-sm font-medium text-foreground">{displayName}</p>
                    <p className="truncate text-meta">{me.username}</p>
                  </div>
                  <StatusBadge label={roleLabel} tone={roleTone} />
                </div>
              ) : null}

              {showOpsConsoleButton ? (
                <Button asChild variant="outline">
                  <Link href={`/${locale}/dashboard/ops`}>{t("openOpsConsole")}</Link>
                </Button>
              ) : null}
              {showFederationDashboardButton && federationHref ? (
                <Button asChild variant="outline">
                  <Link href={federationHref}>{t("openFederationDashboard")}</Link>
                </Button>
              ) : null}
              <ThemeToggle />
              <LanguageSwitcher compact />
              <Button variant="outline" onClick={() => setSecurityOpen(true)}>
                {authCopy("mfaSecurity")}
              </Button>
              <Button variant="outline" onClick={handleSignOut}>
                {t("signOut")}
              </Button>
            </div>
          </div>
        </header>

        {me?.mfa?.grace && me.mfa.grace_until && !me.mfa.desk_block && !me.mfa.blocked ? (
          <div className="flex flex-wrap items-center gap-3 border-b border-border px-[var(--page-padding-x)] py-2">
            <PageNotice tone="info">{authCopy("mfaEnrolGrace", { days: daysUntil(me.mfa.grace_until) })}</PageNotice>
            <Button type="button" variant="primary" onClick={() => setSecurityOpen(true)}>
              {authCopy("mfaEnrolAction")}
            </Button>
          </div>
        ) : null}
        <MfaSecurityPanel
          open={securityOpen}
          status={me?.mfa ?? null}
          onClose={() => setSecurityOpen(false)}
          onChanged={(next) => setMe((current) => (current ? { ...current, mfa: next } : current))}
        />
        <main
          className={cn(
            "min-w-0 flex-1",
            isWorkspace
              ? "flex min-h-0 flex-col overflow-hidden p-0"
              : "px-[var(--page-padding-x)] py-[var(--page-padding-y)]"
          )}
        >
          {pendingDesk ? (
            <DeskSwitchAsk
              title={t("deskSwitchTitle")}
              message={
                pendingDesk.desk === "ltf_admin"
                  ? t("deskSwitchAskAdmin")
                  : t("deskSwitchAsk", { desk: deskLabel(pendingDesk, deskNames) })
              }
              confirmLabel={t("deskSwitchConfirm")}
              stayLabel={t("deskSwitchStay")}
              onConfirm={() => void applySwitch(pendingDesk)}
              onStay={() => {
                const home = activeDesk ? routeForDesk(activeDesk.desk, locale) : getDashboardRouteForRole(me?.role ?? "", locale);
                setPendingDesk(null);
                if (home && pathname !== home) {
                  router.push(home);
                }
              }}
            />
          ) : me?.mfa?.blocked || me?.mfa?.desk_block ? (
            <div className="mx-auto max-w-xl space-y-3 py-8">
              <PageNotice tone="info">
                {me?.mfa?.desk_block === "mfa_required"
                  ? authCopy("mfaSessionNotice")
                  : me?.mfa?.desk_block === "mfa_recovery_required"
                    ? authCopy("mfaRecoveryNotice")
                    : me?.mfa?.grace && me?.mfa?.grace_until
                      ? authCopy("mfaEnrolGrace", { days: daysUntil(me?.mfa?.grace_until ?? "") })
                      : authCopy("mfaEnrolClosed")}
              </PageNotice>
              <Button type="button" variant="primary" onClick={() => setSecurityOpen(true)}>
                {authCopy("mfaEnrolAction")}
              </Button>
            </div>
          ) : isWorkspace ? (
            <div className="flex min-h-0 flex-1 flex-col">
              {switchNotice ? (
                <div className="p-3">
                  <SwitchRefusal message={switchNotice} setupLabel={authCopy("mfaEnrolAction")} onSetup={() => setSecurityOpen(true)} />
                </div>
              ) : null}
              {children}
            </div>
          ) : (
            <div className="w-full space-y-3">
              {switchNotice ? (
                <SwitchRefusal message={switchNotice} setupLabel={authCopy("mfaEnrolAction")} onSetup={() => setSecurityOpen(true)} />
              ) : null}
              {children}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
