"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { persistSelectedClubId } from "@/components/club-selection-provider";
import { LanguageSwitcher } from "@/components/language-switcher";
import { defaultDesk, deskHeaderValue, rememberActiveDesk } from "@/lib/active-desk";
import { login } from "@/lib/auth-api";
import { setToken, type AuthResponse } from "@/lib/auth";
import { AuthApiError } from "@/lib/auth-errors";
import { confirmMfa, beginPasskeyLogin, finishPasskeyLogin, mfaFailureKey } from "@/lib/mfa-api";
import { getPasskey } from "@/lib/webauthn";
import { routeAfterSignIn } from "@/lib/dashboard-routing";
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
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const [pendingMethods, setPendingMethods] = useState<string[]>([]);
  const [useRecovery, setUseRecovery] = useState(false);
  const [showLostHelp, setShowLostHelp] = useState(false);
  const year = new Date().getFullYear();

  const finishSignIn = (response: AuthResponse) => {
    if (!response.token || !response.user) {
      return;
    }
    if (typeof response.recovery_codes_remaining === "number") {
      window.sessionStorage.setItem("ltf_recovery_remaining", String(response.recovery_codes_remaining));
    }
    setToken(response.token);
    const chosen = defaultDesk(
      response.desks ?? [],
      response.last_desk ?? null,
      response.user.role,
      response.user.home_club_id ?? null,
    );
    if (chosen) {
      rememberActiveDesk(deskHeaderValue(chosen));
      persistSelectedClubId(chosen.club_id);
    } else {
      persistSelectedClubId(null);
    }
    router.push(
      routeAfterSignIn(response.user.role, locale, {
        isSuperuser: Boolean(response.user.is_superuser),
        lastDesk: response.last_desk ?? null,
      }) ?? `/${locale}/dashboard`,
    );
  };

  const holdForCode = (response: AuthResponse) => {
    setPendingToken(response.token);
    setPendingMethods(response.mfa_methods ?? []);
    setUseRecovery(false);
    setShowLostHelp(false);
  };

  const startPasskey = async () => {
    setErrorMessage(null);
    setIsSubmitting(true);
    try {
      const started = await beginPasskeyLogin();
      const requestOptions =
        (started.options as { publicKey?: PublicKeyCredentialRequestOptionsJSON }).publicKey ?? started.options;
      const credential = await getPasskey(requestOptions);
      finishSignIn(await finishPasskeyLogin(started.token, credential));
    } catch {
      setErrorMessage(t("mfaPasskeyFailed"));
    } finally {
      setIsSubmitting(false);
    }
  };

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
      nextErrors.username = t("loginIdentifierRequired");
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
      if (response.mfa_pending) {
        holdForCode(response);
        return;
      }
      finishSignIn(response);
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
          <Image src="/brand/ltf-logo-transparent.png" alt="LTF" width={113} height={34} priority className="brand-logo" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">{t("brandTitle")}</span>
            <span className="hidden truncate text-[11px] uppercase tracking-[0.14em] text-[color-mix(in_oklab,var(--brand-on-ink)_62%,transparent)] sm:block">
              {home("kicker")}
            </span>
          </span>
        </Link>
        <Link href={`/${locale}`} className="text-sm text-[color-mix(in_oklab,var(--brand-on-ink)_75%,transparent)]">
          {t("backHome")}
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
          <div className="overflow-hidden rounded-[var(--radius-card)] border border-[color-mix(in_oklab,var(--brand-on-ink)_14%,transparent)] bg-[var(--brand-ink-raised)] shadow-[var(--shadow-float)]">
            <div className="brand-card-edge h-1" />
            <div className="p-6 sm:p-8">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand-text-blue)]">{t("memberArea")}</p>
                <LanguageSwitcher compact />
              </div>
              <h1 className="brand-headline mt-4 text-5xl text-[var(--brand-on-ink)]">{t("loginTitle")}</h1>
              <p className="mt-3 text-sm leading-relaxed text-[color-mix(in_oklab,var(--brand-on-ink)_72%,var(--brand-ink))]">
                {t("loginHint")}
              </p>

              {pendingToken ? (
                <form
                  className="mt-6 space-y-4"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    const code = String(new FormData(event.currentTarget).get("code") || "").replace(/\s+/g, "");
                    if (!code) {
                      setErrorMessage(t("mfaCodeRequired"));
                      return;
                    }
                    setIsSubmitting(true);
                    setErrorMessage(null);
                    try {
                      finishSignIn(await confirmMfa(pendingToken, code));
                    } catch (error) {
                      if (error instanceof AuthApiError && (error.code === "mfa_sign_in_again" || error.code === "mfa_not_pending")) {
                        setErrorMessage(t("mfaSignInAgain"));
                      } else if (error instanceof AuthApiError) {
                        setErrorMessage(error.message);
                      } else {
                        const message = error instanceof Error ? error.message : "";
                        setErrorMessage(t(mfaFailureKey(message)));
                      }
                    } finally {
                      setIsSubmitting(false);
                    }
                  }}
                >
                  <h2 className="text-section text-[var(--brand-on-ink)]">{t("mfaTitle")}</h2>
                  <p className="text-sm text-[color-mix(in_oklab,var(--brand-on-ink)_72%,var(--brand-ink))]">
                    {pendingMethods.includes("email")
                      ? t("mfaEmailHint")
                      : useRecovery
                        ? t("mfaRecoveryLoginHint")
                        : t("mfaHint")}
                  </p>
                  <RequiredForm className="space-y-2">
                    <Label htmlFor="mfa-code" required>
                      {useRecovery ? t("mfaUseRecovery") : t("mfaCode")}
                    </Label>
                    <Input
                      id="mfa-code"
                      name="code"
                      type="text"
                      inputMode={useRecovery ? "text" : "numeric"}
                      autoComplete="one-time-code"
                      required
                    />
                    {pendingMethods.includes("email") ? null : (
                      <p className="text-sm text-[color-mix(in_oklab,var(--brand-on-ink)_72%,var(--brand-ink))]">
                        {t("mfaSameFieldRecovery")}
                      </p>
                    )}
                  </RequiredForm>
                  <ActionNotices error={errorMessage} onDismiss={() => setErrorMessage(null)} />
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="inline-flex h-12 w-full items-center justify-center rounded-full bg-[var(--brand-ltf-red)] text-sm font-semibold text-[var(--brand-on-ink)] disabled:opacity-60"
                  >
                    {isSubmitting ? t("loading") : t("mfaConfirm")}
                  </button>
                  {pendingMethods.includes("email") ? null : (
                    <div className="space-y-2">
                      <button
                        type="button"
                        className="text-sm font-medium text-[var(--brand-text-blue)]"
                        onClick={() => setUseRecovery((current) => !current)}
                      >
                        {useRecovery ? t("mfaUseApp") : t("mfaUseRecovery")}
                      </button>
                      {pendingMethods.includes("webauthn") ? (
                        <button
                          type="button"
                          className="block text-sm font-medium text-[var(--brand-text-blue)]"
                          disabled={isSubmitting}
                          onClick={() => void startPasskey()}
                        >
                          {t("mfaPasskey")}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="block text-sm font-medium text-[var(--brand-text-blue)]"
                        onClick={() => setShowLostHelp((current) => !current)}
                      >
                        {t("mfaCantUse")}
                      </button>
                      {showLostHelp ? (
                        <p className="text-sm text-[color-mix(in_oklab,var(--brand-on-ink)_72%,var(--brand-ink))]">
                          {t("mfaCantUseBody")}
                        </p>
                      ) : null}
                    </div>
                  )}
                </form>
              ) : null}

              <form className={pendingToken ? "hidden" : "mt-6"} onSubmit={onSubmit} noValidate>
                <RequiredForm className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="login-username" required>
                      {t("loginIdentifier")}
                    </Label>
                    <Input
                      id="login-username"
                      name="username"
                      type="text"
                      autoComplete="username"
                      defaultValue={prefillUsername}
                      placeholder={t("loginPlaceholder")}
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

                  <button
                    type="button"
                    className="text-sm font-medium text-[var(--brand-text-blue)]"
                    onClick={() => void startPasskey()}
                  >
                    {t("mfaPasskey")}
                  </button>
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
