"use client";

import Image from "next/image";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";

import { LanguageSwitcher } from "@/components/language-switcher";

export const authPrimaryClass =
  "inline-flex h-12 w-full items-center justify-center rounded-full bg-[var(--brand-ltf-red)] text-sm font-semibold text-[var(--brand-on-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-on-ink)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--brand-ink-raised)] disabled:opacity-60";

export function AuthFrame({
  children,
  backHref,
  backLabel,
  showKicker = false,
}: {
  children: React.ReactNode;
  backHref: string;
  backLabel: string;
  showKicker?: boolean;
}) {
  const t = useTranslations("Auth");
  const home = useTranslations("Home");
  const locale = useLocale();
  const year = new Date().getFullYear();

  return (
    <main data-tone="brand" className="brand-canvas flex min-h-screen flex-col overflow-x-hidden">
      <header className="flex items-center justify-between gap-4 px-5 py-5 sm:px-10">
        <Link href={`/${locale}`} className="flex min-w-0 items-center gap-3">
          <Image src="/brand/ltf-logo-transparent.png" alt="LTF" width={113} height={34} priority className="brand-logo" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">{t("brandTitle")}</span>
            {showKicker ? (
              <span className="hidden truncate text-[11px] uppercase tracking-[0.14em] text-[color-mix(in_oklab,var(--brand-on-ink)_62%,transparent)] sm:block">
                {home("kicker")}
              </span>
            ) : null}
          </span>
        </Link>
        <Link href={backHref} className="text-sm text-[color-mix(in_oklab,var(--brand-on-ink)_75%,transparent)]">
          {backLabel}
        </Link>
      </header>

      <div className="auth-split">
        <div className="auth-split-art brand-art brand-art-reveal">
          <Image
            src="/brand/kick-roundhouse.jpg"
            alt=""
            fill
            priority
            sizes="(max-width: 1024px) 0px, 50vw"
            className="object-contain object-center"
          />
        </div>
        <section className="w-full">
          <div
            data-auth-card
            className="w-full overflow-hidden rounded-[var(--radius-card)] border border-[color-mix(in_oklab,var(--brand-on-ink)_14%,transparent)] bg-[var(--brand-ink-raised)] shadow-[var(--shadow-float)]"
          >
            <div className="brand-card-edge h-1" />
            <div className="auth-card-body p-6 sm:p-8">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand-text-blue)]">{t("memberArea")}</p>
                <LanguageSwitcher compact />
              </div>
              {children}
            </div>
          </div>
        </section>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-3 px-5 py-5 text-sm text-[color-mix(in_oklab,var(--brand-on-ink)_55%,transparent)] sm:px-10 lg:px-14">
        <p>{t("copyright", { year })}</p>
        <Link href={`/${locale}/settings/privacy`} className="hover:text-[var(--brand-on-ink)]">
          {t("privacy")}
        </Link>
      </footer>
    </main>
  );
}
