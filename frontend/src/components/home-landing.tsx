"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { LanguageSwitcher } from "@/components/language-switcher";
import { apiRequest } from "@/lib/api";
import { clearToken, getToken } from "@/lib/auth";
import { routeAfterSignIn } from "@/lib/dashboard-routing";
import { getPublicStats, type PublicStats } from "@/lib/public-stats";
import { getRoleNavDefs, type RoleNavDef } from "@/lib/role-nav";

const FIND_A_CLUB_URL = "https://www.luxembourgtaekwondo.lu/";

type MeResponse = {
  username: string;
  first_name: string;
  role: string;
  is_superuser?: boolean;
  last_desk?: { desk: string; club_id: number | null } | null;
};

export function HomeLanding() {
  const locale = useLocale();
  const t = useTranslations("Home");
  const common = useTranslations("Common");
  const tClub = useTranslations("ClubAdmin");
  const tLtf = useTranslations("LtfAdmin");
  const tFinance = useTranslations("LtfFinance");
  const tOps = useTranslations("Ops");
  const tMember = useTranslations("Member");
  const [dashboardHref, setDashboardHref] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState<MeResponse | null>(null);
  const [stats, setStats] = useState<PublicStats | null>(null);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      return;
    }
    let cancelled = false;
    const loadMe = async () => {
      try {
        const me = await apiRequest<MeResponse>("/api/auth/me/");
        if (cancelled) {
          return;
        }
        setSignedIn(me);
        setDashboardHref(
          routeAfterSignIn(me.role, locale, {
            isSuperuser: Boolean(me.is_superuser),
            lastDesk: me.last_desk ?? null,
          }) ?? `/${locale}/dashboard`,
        );
      } catch {
        clearToken();
        if (!cancelled) {
          setSignedIn(null);
          setDashboardHref(null);
        }
      }
    };
    void loadMe();
    return () => {
      cancelled = true;
    };
  }, [locale]);

  useEffect(() => {
    let cancelled = false;
    const loadStats = async () => {
      try {
        const payload = await getPublicStats();
        if (!cancelled) {
          setStats(payload);
        }
      } catch {
        if (!cancelled) {
          setStats(null);
        }
      }
    };
    void loadStats();
    return () => {
      cancelled = true;
    };
  }, []);

  const signInHref = dashboardHref ?? `/${locale}/login`;
  const signInLabel = dashboardHref ? t("openDashboard") : t("signIn");

  return (
    <main className="brand-canvas relative min-h-screen overflow-x-hidden">
      <header className="relative z-20 mx-auto flex w-full max-w-[1440px] items-center justify-between gap-4 px-5 py-4 sm:px-10 lg:px-14">
        <Link href={`/${locale}`} className="flex min-w-0 items-center gap-3">
          <Image
            src="/brand/ltf-logo-transparent.png"
            alt="LTF"
            width={113}
            height={34}
            priority
            className="brand-logo"
          />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-[var(--brand-on-ink)] sm:text-base">{common("appTitle")}</span>
            <span className="hidden truncate text-[11px] uppercase tracking-[0.14em] text-[color-mix(in_oklab,var(--brand-on-ink)_62%,transparent)] sm:block">
              {t("kicker")}
            </span>
          </span>
        </Link>
        <nav aria-label={common("navigationLabel")} className="hidden items-center gap-7 text-sm text-[color-mix(in_oklab,var(--brand-on-ink)_78%,transparent)] lg:flex">
          <span>{t("navClubs")}</span>
          <span>{t("navCompetitions")}</span>
          <span>{t("navLicences")}</span>
          <Link className="hover:text-[var(--brand-on-ink)]" href={`/${locale}/about`}>{t("navAbout")}</Link>
        </nav>
        <div className="flex items-center gap-3">
          <div className="hidden sm:block">
            <LanguageSwitcher variant="segment" />
          </div>
          <Link
            href={signInHref}
            className="inline-flex h-10 items-center rounded-full bg-[var(--brand-on-ink)] px-4 text-sm font-semibold text-[var(--brand-ink)]"
          >
            {signInLabel}
          </Link>
        </div>
      </header>

      <div className="relative mx-auto w-full max-w-[1440px]">
        <div className="pointer-events-none absolute right-[-4%] top-0 hidden h-[42rem] w-[58%] sm:block">
          <div className="brand-art brand-art-reveal relative h-full w-full">
            <Image
              src="/brand/kick-roundhouse.jpg"
              alt=""
              fill
              priority
              sizes="60vw"
              className="object-contain object-right-top"
            />
          </div>
        </div>

        <section className="relative z-10 max-w-3xl bg-transparent px-5 pb-8 pt-8 sm:px-10 sm:pt-16 lg:px-14">
          <p className="brand-eyebrow">
            <span>{t("kicker")}</span>
          </p>
          <h1 className="brand-headline brand-slogan mt-6">
            <span className="block text-[var(--brand-text-red)]">{t("headlineOne")}</span>
            <span className="brand-headline-outline mt-1 block">{t("headlineClub")}</span>
            <span className="brand-headline-blue mt-1 block">{t("headlineAthlete")}</span>
          </h1>
          <p className="mt-7 max-w-xl text-base leading-relaxed text-[color-mix(in_oklab,var(--brand-on-ink)_78%,var(--brand-ink))] sm:text-lg">
            {t("subline")}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href={signInHref}
              className="inline-flex h-12 items-center rounded-[var(--radius-card)] bg-[var(--brand-ltf-red)] px-6 text-sm font-semibold text-[var(--brand-on-ink)]"
            >
              {signInLabel}
              <span aria-hidden="true" className="ml-2">→</span>
            </Link>
            <a
              href={FIND_A_CLUB_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-12 items-center rounded-[var(--radius-card)] border border-[color-mix(in_oklab,var(--brand-on-ink)_28%,transparent)] px-6 text-sm font-semibold text-[var(--brand-on-ink)]"
            >
              {t("findClub")}
            </a>
          </div>
          {signedIn && dashboardHref ? (
            <RoleShortcutGrid
              locale={locale}
              role={signedIn.role}
              isSuperuser={Boolean(signedIn.is_superuser)}
              labelFor={(def) => {
                if (def.namespace === "ClubAdmin") return tClub(def.labelKey);
                if (def.namespace === "LtfAdmin") return tLtf(def.labelKey);
                if (def.namespace === "LtfFinance") return tFinance(def.labelKey);
                if (def.namespace === "Ops") return tOps(def.labelKey);
                return tMember(def.labelKey);
              }}
            />
          ) : null}
          {stats ? <StatRow stats={stats} locale={locale} /> : null}
        </section>

        <div className="brand-art brand-art-reveal relative mx-auto h-80 w-full sm:hidden">
          <Image
            src="/brand/kick-roundhouse.jpg"
            alt=""
            fill
            sizes="100vw"
            className="object-contain object-center"
          />
        </div>
      </div>
    </main>
  );
}

function RoleShortcutGrid({
  locale,
  role,
  isSuperuser,
  labelFor,
}: {
  locale: string;
  role: string;
  isSuperuser: boolean;
  labelFor: (def: RoleNavDef) => string;
}) {
  const t = useTranslations("Home");
  const common = useTranslations("Common");
  const navDefs = getRoleNavDefs(role, { isSuperuser });
  if (navDefs.length === 0) {
    return null;
  }
  return (
    <nav aria-label={common("navigationLabel")} className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--brand-on-ink)] sm:col-span-2 lg:col-span-3">
        {t("deskShortcuts")}
      </h2>
      {navDefs.map((def) => {
        const Icon = def.icon;
        return (
          <Link
            key={def.id}
            href={def.href(locale)}
            className="flex items-center gap-3 rounded-[var(--radius-card)] border border-border bg-surface px-3 py-3 text-sm font-semibold text-foreground"
          >
            <Icon className="size-4 shrink-0 text-muted" aria-hidden />
            <span>{labelFor(def)}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function StatRow({ stats, locale }: { stats: PublicStats; locale: string }) {
  const t = useTranslations("Home");
  return (
    <dl className="mt-12 flex flex-wrap gap-x-10 gap-y-6">
      <Stat value={stats.clubs} label={t("statClubs")} locale={locale} />
      <Stat value={stats.members} label={t("statMembers")} locale={locale} />
      <Stat value={stats.licences} label={t("statLicences")} locale={locale} />
    </dl>
  );
}

function Stat({ value, label, locale }: { value: number; label: string; locale: string }) {
  const shown = useCountUp(value);
  const formatted = new Intl.NumberFormat(locale === "lb" ? "de-LU" : locale).format(shown);
  return (
    <div>
      <dd className="font-display text-4xl tracking-wide text-[var(--brand-on-ink)] sm:text-5xl">
        {formatted}
      </dd>
      <dt className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-[color-mix(in_oklab,var(--brand-on-ink)_62%,transparent)]">
        {label}
      </dt>
    </div>
  );
}

function useCountUp(target: number) {
  const [shown, setShown] = useState(target);
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setShown(target);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const duration = 800;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - progress) ** 3;
      setShown(Math.round(target * eased));
      if (progress < 1) {
        frame = requestAnimationFrame(tick);
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target]);
  return shown;
}
