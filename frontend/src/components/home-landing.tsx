"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { LanguageSwitcher } from "@/components/language-switcher";
import { apiRequest } from "@/lib/api";
import { clearToken, getToken } from "@/lib/auth";
import { getDashboardRouteForRole } from "@/lib/dashboard-routing";
import { getPublicStats, type PublicStats } from "@/lib/public-stats";

const FIND_A_CLUB_URL = "https://www.luxembourgtaekwondo.lu/";

type MeResponse = {
  username: string;
  first_name: string;
  role: string;
  is_superuser?: boolean;
};

export function HomeLanding() {
  const locale = useLocale();
  const t = useTranslations("Home");
  const common = useTranslations("Common");
  const [dashboardHref, setDashboardHref] = useState<string | null>(null);
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
        setDashboardHref(
          getDashboardRouteForRole(me.role, locale, { isSuperuser: Boolean(me.is_superuser) }) ??
            `/${locale}/dashboard`
        );
      } catch {
        clearToken();
        if (!cancelled) {
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
      <header className="relative z-20 mx-auto flex w-full max-w-[1440px] flex-wrap items-center justify-between gap-x-6 gap-y-3 px-5 py-5 sm:px-10 lg:px-14">
        <Link href={`/${locale}`} className="flex min-w-0 items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-control)] bg-[var(--brand-ltf-red)]">
            <Image src="/ltf-logo.svg" alt="" width={80} height={24} className="h-5 w-auto" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-[var(--brand-on-ink)]">{common("appTitle")}</span>
            <span className="block truncate text-[11px] uppercase tracking-[0.14em] text-[color-mix(in_oklab,var(--brand-on-ink)_62%,transparent)]">
              {t("kicker")}
            </span>
          </span>
        </Link>
        <nav aria-label={common("navigationLabel")} className="order-3 flex w-full flex-wrap gap-x-5 gap-y-2 text-sm text-[color-mix(in_oklab,var(--brand-on-ink)_78%,transparent)] lg:order-none lg:w-auto">
          <a className="hover:text-[var(--brand-on-ink)]" href="#clubs">{t("navClubs")}</a>
          <a className="hover:text-[var(--brand-on-ink)]" href="#competitions">{t("navCompetitions")}</a>
          <a className="hover:text-[var(--brand-on-ink)]" href="#licences">{t("navLicences")}</a>
          <Link className="hover:text-[var(--brand-on-ink)]" href={`/${locale}/about`}>{t("navAbout")}</Link>
        </nav>
        <div className="flex items-center gap-3">
          <LanguageSwitcher variant="segment" />
          <Link
            href={signInHref}
            className="inline-flex h-10 items-center rounded-full bg-[var(--brand-on-ink)] px-4 text-sm font-semibold text-[var(--brand-ink)]"
          >
            {signInLabel}
          </Link>
        </div>
      </header>

      <section className="relative mx-auto grid min-h-[calc(100vh-9rem)] w-full max-w-[1440px] items-end px-5 pb-8 sm:px-10 lg:px-14">
        <div className="pointer-events-none absolute inset-x-0 bottom-0 top-0 sm:inset-y-[-4rem] sm:left-[34%] sm:right-[-6%]">
          <div className="brand-art brand-art-reveal relative h-full min-h-[22rem] w-full">
            <Image
              src="/brand/kick-roundhouse.jpg"
              alt=""
              fill
              priority
              sizes="(max-width: 768px) 100vw, 60vw"
              className="object-contain object-right-bottom"
            />
          </div>
        </div>
        <div className="brand-scrim pointer-events-none absolute inset-0 hidden sm:block" />
        <div className="brand-scrim-mobile pointer-events-none absolute inset-0 sm:hidden" />

        <div className="relative z-10 max-w-3xl pb-6 pt-16 sm:pt-8">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color-mix(in_oklab,var(--brand-on-ink)_70%,transparent)]">
            <span className="mr-3 inline-block h-px w-8 align-middle bg-[var(--brand-ltf-red)]" />
            {t("kicker")}
          </p>
          <h1 className="brand-headline mt-5 text-[clamp(2.35rem,6.8vw,6.5rem)]">
            <span className="block text-[var(--brand-text-red)]">{t("headlineOne")}</span>
            <span className="brand-headline-outline mt-1 block">{t("headlineClub")}</span>
            <span className="brand-headline-blue mt-1 block">{t("headlineAthlete")}</span>
          </h1>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-[color-mix(in_oklab,var(--brand-on-ink)_78%,var(--brand-ink))] sm:text-lg">
            {t("subline")}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href={signInHref}
              className="inline-flex h-12 items-center rounded-full bg-[var(--brand-ltf-red)] px-6 text-sm font-semibold text-[var(--brand-on-ink)]"
            >
              {signInLabel}
              <span aria-hidden="true" className="ml-2">→</span>
            </Link>
            <a
              href={FIND_A_CLUB_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-12 items-center rounded-full border border-[color-mix(in_oklab,var(--brand-on-ink)_40%,transparent)] px-6 text-sm font-semibold text-[var(--brand-on-ink)]"
            >
              {t("findClub")}
            </a>
          </div>
          {stats ? <StatRow stats={stats} locale={locale} /> : null}
        </div>
      </section>

      <section className="relative z-10 mx-auto grid w-full max-w-[1440px] gap-4 px-5 pb-12 sm:px-10 md:grid-cols-3 lg:px-14">
        <FeatureCard id="clubs" index="01" title={t("featureClubsTitle")} body={t("featureClubsBody")} />
        <FeatureCard id="licences" index="02" title={t("featureLicencesTitle")} body={t("featureLicencesBody")} />
        <FeatureCard id="competitions" index="03" title={t("featureCompetitionsTitle")} body={t("featureCompetitionsBody")} />
      </section>
    </main>
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

function FeatureCard({ id, index, title, body }: { id: string; index: string; title: string; body: string }) {
  return (
    <article
      id={id}
      className="rounded-[var(--radius-card)] border border-[color-mix(in_oklab,var(--brand-on-ink)_14%,transparent)] bg-[color-mix(in_oklab,var(--brand-on-ink)_5%,transparent)] p-5"
    >
      <p className="text-sm font-semibold text-[var(--brand-text-blue)]">{index}</p>
      <h2 className="mt-3 text-lg font-semibold text-[var(--brand-on-ink)]">{title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-[color-mix(in_oklab,var(--brand-on-ink)_72%,var(--brand-ink))]">{body}</p>
    </article>
  );
}
