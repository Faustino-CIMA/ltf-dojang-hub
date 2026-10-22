"use client";

import Image from "next/image";
import Link from "next/link";
import { type FormEvent, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { LanguageSwitcher } from "@/components/language-switcher";
import { resetPasswordRequest } from "@/lib/auth-api";
import { ActionNotices } from "@/components/ui/list-page-chrome";
import { Input } from "@/components/ui/input";
import { Label, RequiredForm } from "@/components/ui/label";

export default function ForgotPasswordPage() {
  const t = useTranslations("Auth");
  const home = useTranslations("Home");
  const locale = useLocale();
  const [emailError, setEmailError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const year = new Date().getFullYear();

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setEmailError(null);
    setFormError(null);
    const data = new FormData(event.currentTarget);
    const email = String(data.get("email") ?? "").trim();
    if (!email) {
      setEmailError(t("emailRequired"));
      return;
    }
    setIsSubmitting(true);
    try {
      await resetPasswordRequest({ email, locale });
      setSent(true);
    } catch {
      setFormError(t("forgotError"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main data-tone="brand" className="brand-canvas flex min-h-screen flex-col overflow-x-hidden">
      <header className="flex items-center justify-between gap-4 px-5 py-5 sm:px-10">
        <Link href={`/${locale}`} className="flex min-w-0 items-center gap-3">
          <Image src="/brand/ltf-logo-transparent.png" alt="LTF" width={113} height={34} priority className="brand-logo" />
          <span className="truncate text-sm font-semibold">{t("brandTitle")}</span>
        </Link>
        <Link href={`/${locale}/login`} className="text-sm text-[color-mix(in_oklab,var(--brand-on-ink)_75%,transparent)]">
          {t("backToSignIn")}
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
          <div className="w-full overflow-hidden rounded-[var(--radius-card)] border border-[color-mix(in_oklab,var(--brand-on-ink)_14%,transparent)] bg-[var(--brand-ink-raised)]">
          <div className="brand-card-edge h-1" />
          <div className="p-6 sm:p-8">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand-text-blue)]">{t("memberArea")}</p>
              <LanguageSwitcher compact />
            </div>
            <p className="brand-eyebrow mt-5">
              <span>{home("kicker")}</span>
            </p>
            <h1 className="mt-4 text-3xl font-semibold text-[var(--brand-on-ink)]">{t("forgotTitle")}</h1>
            <p className="mt-3 text-sm leading-relaxed text-[color-mix(in_oklab,var(--brand-on-ink)_72%,var(--brand-ink))]">
              {t("forgotHint")}
            </p>
            {sent ? (
              <p className="mt-6 text-sm text-[var(--brand-on-ink)]" role="status">
                {t("forgotSent")}
              </p>
            ) : (
              <form className="mt-6" onSubmit={onSubmit} noValidate>
                <RequiredForm className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="forgot-email" required>
                      {t("email")}
                    </Label>
                    <Input
                      id="forgot-email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      placeholder={t("emailPlaceholder")}
                      disabled={isSubmitting}
                      aria-invalid={emailError ? true : undefined}
                    />
                    {emailError ? <p className="text-sm text-[var(--brand-text-red)]">{emailError}</p> : null}
                  </div>
                  <ActionNotices error={formError} onDismiss={() => setFormError(null)} />
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="inline-flex h-12 w-full items-center justify-center rounded-full bg-[var(--brand-ltf-red)] text-sm font-semibold text-[var(--brand-on-ink)] disabled:opacity-60"
                  >
                    {isSubmitting ? t("loading") : t("forgotSubmit")}
                  </button>
                </RequiredForm>
              </form>
            )}
          </div>
        </div>
        </section>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-3 px-5 py-5 text-sm text-[color-mix(in_oklab,var(--brand-on-ink)_55%,transparent)] sm:px-10">
        <p>{t("copyright", { year })}</p>
        <Link href={`/${locale}/settings/privacy`}>{t("privacy")}</Link>
      </footer>
    </main>
  );
}
