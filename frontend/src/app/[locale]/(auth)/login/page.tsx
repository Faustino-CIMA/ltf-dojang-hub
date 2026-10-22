"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { persistSelectedClubId } from "@/components/club-selection-provider";
import { LanguageSwitcher } from "@/components/language-switcher";
import { login } from "@/lib/auth-api";
import { setToken } from "@/lib/auth";
import { ActionNotices } from "@/components/ui/list-page-chrome";
import { Input } from "@/components/ui/input";
import { Label, RequiredForm } from "@/components/ui/label";

const PASSWORD_MIN = 8;

export default function LoginPage() {
  const t = useTranslations("Auth");
  const home = useTranslations("Home");
  const router = useRouter();
  const locale = useLocale();
  const searchParams = useSearchParams();
  const prefillUsername = (searchParams.get("username") ?? "").trim();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showVerifyLink, setShowVerifyLink] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ username?: string; password?: string }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const year = new Date().getFullYear();

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    setShowVerifyLink(false);
    setFieldErrors({});

    const form = event.currentTarget;
    const data = new FormData(form);
    const username = String(data.get("username") ?? "").trim();
    const password = String(data.get("password") ?? "");

    const nextErrors: { username?: string; password?: string } = {};
    if (!username) {
      nextErrors.username = t("emailRequired");
    }
    if (!password) {
      nextErrors.password = t("passwordRequired");
    } else if (password.length < PASSWORD_MIN) {
      nextErrors.password = t("passwordTooShort", { min: PASSWORD_MIN });
    }
    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await login({ username, password });
      setToken(response.token);
      persistSelectedClubId(null);
      router.push(`/${locale}/dashboard`);
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : "";
      const normalized = rawMessage.toLowerCase();
      if (normalized.includes("not verified")) {
        setErrorMessage(t("emailNotVerified"));
        setShowVerifyLink(true);
      } else if (normalized.includes("invalid credentials")) {
        setErrorMessage(t("invalidCredentials"));
      } else {
        setErrorMessage(t("loginFailed"));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main data-tone="brand" className="brand-canvas flex min-h-screen flex-col overflow-x-hidden">
      <header className="flex items-center justify-between gap-4 px-5 py-5 sm:px-10">
        <Link href={`/${locale}`} className="flex min-w-0 items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-control)] bg-[var(--brand-ltf-red)]">
            <Image src="/ltf-logo.svg" alt="" width={80} height={24} className="h-5 w-auto" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">{t("brandTitle")}</span>
            <span className="block truncate text-[11px] uppercase tracking-[0.14em] text-[color-mix(in_oklab,var(--brand-on-ink)_62%,transparent)]">
              {home("kicker")}
            </span>
          </span>
        </Link>
        <Link href={`/${locale}`} className="text-sm text-[color-mix(in_oklab,var(--brand-on-ink)_75%,transparent)]">
          {t("backHome")}
        </Link>
      </header>

      <div className="mx-auto grid w-full max-w-[1440px] flex-1 items-center gap-8 px-5 pb-8 sm:px-10 lg:grid-cols-2 lg:px-14">
        <section className="relative min-h-[16rem] overflow-hidden lg:min-h-[32rem]">
          <div className="brand-art brand-art-reveal absolute inset-0">
            <Image
              src="/brand/kick-roundhouse.jpg"
              alt=""
              fill
              priority
              sizes="(max-width: 1024px) 100vw, 50vw"
              className="object-contain object-left-bottom"
            />
          </div>
          <div className="brand-scrim-bottom pointer-events-none absolute inset-x-0 bottom-0 h-3/4" />
          <div className="relative z-10 flex h-full flex-col justify-end pb-4 pt-40 lg:pt-64">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[color-mix(in_oklab,var(--brand-on-ink)_70%,transparent)]">
              <span className="mr-3 inline-block h-px w-8 align-middle bg-[var(--brand-ltf-red)]" />
              {home("kicker")}
            </p>
            <h1 className="brand-headline mt-4 text-[clamp(2.6rem,5vw,4.8rem)]">
              <span className="block text-[var(--brand-on-ink)]">{t("headlineWelcome")}</span>
              <span className="mt-1 block text-[var(--brand-text-red)]">{t("headlineDojang")}</span>
            </h1>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-[color-mix(in_oklab,var(--brand-on-ink)_78%,var(--brand-ink))] sm:text-base">
              {t("loginSubline")}
            </p>
          </div>
        </section>

        <section className="mx-auto w-full max-w-md">
          <div className="overflow-hidden rounded-[var(--radius-card)] border border-[color-mix(in_oklab,var(--brand-on-ink)_14%,transparent)] bg-[var(--brand-ink-raised)] shadow-[var(--shadow-float)]">
            <div className="brand-card-edge h-1" />
            <div className="p-6 sm:p-8">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand-text-blue)]">{t("memberArea")}</p>
                <LanguageSwitcher compact />
              </div>
              <h2 className="brand-headline mt-4 text-5xl text-[var(--brand-on-ink)]">{t("loginTitle")}</h2>
              <p className="mt-3 text-sm leading-relaxed text-[color-mix(in_oklab,var(--brand-on-ink)_72%,var(--brand-ink))]">
                {t("loginHint")}
              </p>

              <form className="mt-6" onSubmit={onSubmit} noValidate>
                <RequiredForm className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="login-username" required>
                      {t("email")}
                    </Label>
                    <Input
                      id="login-username"
                      name="username"
                      autoComplete="username"
                      defaultValue={prefillUsername}
                      placeholder={t("emailPlaceholder")}
                      disabled={isSubmitting}
                      autoFocus={!prefillUsername}
                      aria-invalid={fieldErrors.username ? true : undefined}
                    />
                    {fieldErrors.username ? <p className="text-sm text-[var(--brand-text-red)]">{fieldErrors.username}</p> : null}
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <Label htmlFor="login-password" required>
                        {t("password")}
                      </Label>
                      <Link href={`/${locale}/forgot-password`} className="text-sm text-[var(--brand-text-blue)]">
                        {t("forgotPassword")}
                      </Link>
                    </div>
                    <div className="relative">
                      <Input
                        id="login-password"
                        name="password"
                        type={showPassword ? "text" : "password"}
                        autoComplete="current-password"
                        disabled={isSubmitting}
                        autoFocus={Boolean(prefillUsername)}
                        aria-invalid={fieldErrors.password ? true : undefined}
                        className="pr-12"
                      />
                      <button
                        type="button"
                        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted"
                        aria-label={showPassword ? t("hidePassword") : t("showPassword")}
                        aria-pressed={showPassword}
                        onClick={() => setShowPassword((current) => !current)}
                      >
                        {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      </button>
                    </div>
                    {fieldErrors.password ? <p className="text-sm text-[var(--brand-text-red)]">{fieldErrors.password}</p> : null}
                  </div>

                  <ActionNotices error={errorMessage} onDismiss={() => setErrorMessage(null)} />
                  {showVerifyLink ? (
                    <p className="text-sm text-muted">
                      {t("verifyPrompt")}{" "}
                      <Link className="font-medium text-[var(--brand-text-blue)]" href={`/${locale}/verify-email`}>
                        {t("verifyLink")}
                      </Link>
                    </p>
                  ) : null}

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="inline-flex h-12 w-full items-center justify-center rounded-full bg-[var(--brand-ltf-red)] text-sm font-semibold text-[var(--brand-on-ink)] disabled:opacity-60"
                  >
                    {isSubmitting ? t("loading") : t("signInAction")}
                    <span aria-hidden="true" className="ml-2">→</span>
                  </button>
                </RequiredForm>
              </form>

              <p className="mt-5 text-sm text-[color-mix(in_oklab,var(--brand-on-ink)_70%,var(--brand-ink))]">
                {t("noAccount")}
              </p>
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
