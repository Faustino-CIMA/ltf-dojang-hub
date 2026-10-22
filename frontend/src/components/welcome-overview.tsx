"use client";

import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { ActionNotices } from "@/components/ui/list-page-chrome";

export type WelcomeTile = {
  id: string;
  label: string;
  value: string;
  unit: string;
  hint?: string;
};

export type WelcomeAttention = {
  id: string;
  label: string;
  detail?: string;
  href: string;
};

type WelcomeOverviewProps = {
  eyebrow: string;
  firstName: string;
  dateLabel: string;
  tiles: WelcomeTile[];
  attention: WelcomeAttention[];
  isLoading: boolean;
  errorMessage: string | null;
  onDismissError: () => void;
};

export function WelcomeOverview({
  eyebrow,
  firstName,
  dateLabel,
  tiles,
  attention,
  isLoading,
  errorMessage,
  onDismissError,
}: WelcomeOverviewProps) {
  const t = useTranslations("Home");
  const common = useTranslations("Common");

  return (
    <div className="space-y-4">
      <ActionNotices error={errorMessage} onDismiss={onDismissError} />
      <section className="brand-canvas-quiet relative overflow-hidden rounded-[var(--radius-card)] border border-border px-5 py-7 sm:px-8">
        <div className="pointer-events-none absolute inset-y-0 right-0 w-[min(46%,28rem)] opacity-80">
          <div className="brand-art relative h-full min-h-48">
            <Image
              src="/brand/kick-roundhouse.jpg"
              alt=""
              fill
              priority
              sizes="480px"
              className="object-cover object-right"
            />
          </div>
        </div>
        <div className="relative max-w-3xl">
          {eyebrow ? (
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--brand-text-blue)]">{eyebrow}</p>
          ) : null}
          <h1 className="brand-headline mt-3 max-w-[18ch] text-[clamp(2.4rem,5vw,4.6rem)] text-[var(--brand-on-ink)]">
            {t("welcomeLead")}{" "}
            <span className="text-[var(--brand-text-blue)]">{firstName}.</span>
          </h1>
          {dateLabel ? <p className="mt-4 text-sm text-[var(--muted)]">{dateLabel}</p> : null}
        </div>
      </section>

      {isLoading ? (
        <p className="text-sm text-muted">{common("loadingLabel")}</p>
      ) : (
        <>
          {tiles.length > 0 ? (
            <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {tiles.map((tile) => (
                <article key={tile.id} className="rounded-[var(--radius-card)] border border-border bg-surface p-4">
                  <h2 className="text-sm font-medium text-muted">{tile.label}</h2>
                  <p className="mt-2 font-display text-5xl tracking-wide text-foreground">{tile.value}</p>
                  <p className="text-sm text-muted">{tile.unit}</p>
                  {tile.hint ? <p className="mt-3 text-sm text-foreground">{tile.hint}</p> : null}
                </article>
              ))}
            </section>
          ) : null}

          <section className="rounded-[var(--radius-card)] border border-border bg-surface p-4">
            <h2 className="text-base font-semibold text-foreground">{t("welcomeAttention")}</h2>
            {attention.length === 0 ? (
              <p className="mt-3 text-sm text-muted">{t("welcomeAllClear")}</p>
            ) : (
              <ul className="mt-3 divide-y divide-border">
                {attention.map((item) => (
                  <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{item.label}</p>
                      {item.detail ? <p className="mt-1 text-sm text-muted">{item.detail}</p> : null}
                    </div>
                    <Link
                      href={item.href}
                      className="inline-flex h-[var(--control-height)] items-center rounded-[var(--radius-control)] border border-border px-3 text-sm font-semibold text-foreground"
                    >
                      {t("welcomeOpen")}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

export function formatWelcomeDate(locale: string, value: Date = new Date()) {
  const tag = locale === "lb" ? "de-LU" : locale === "en" ? "en-GB" : locale;
  return new Intl.DateTimeFormat(tag, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(value);
}

export function formatWelcomeShortDate(locale: string, isoDate: string) {
  const parsed = parseIsoDate(isoDate);
  if (!parsed) {
    return isoDate;
  }
  const tag = locale === "lb" ? "de-LU" : locale === "en" ? "en-GB" : locale;
  return new Intl.DateTimeFormat(tag, { day: "numeric", month: "short" }).format(parsed);
}

export function parseIsoDate(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) {
    return null;
  }
  return new Date(year, month - 1, day);
}
