"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { AuthFrame, authPrimaryClass } from "@/components/auth/auth-frame";
import { persistSelectedClubId } from "@/components/club-selection-provider";
import { defaultDesk, deskHeaderValue, rememberActiveDesk } from "@/lib/active-desk";
import { login } from "@/lib/auth-api";
import { setToken, type AuthResponse } from "@/lib/auth";
import { AuthApiError, presentAuthError } from "@/lib/auth-errors";
import { confirmMfa, beginPasskeyLogin, finishPasskeyLogin, mfaFailureKey } from "@/lib/mfa-api";
import { getPasskey } from "@/lib/webauthn";
import { routeAfterSignIn } from "@/lib/dashboard-routing";
import { ActionNotices } from "@/components/ui/list-page-chrome";
import { Input } from "@/components/ui/input";
import { Label, RequiredForm } from "@/components/ui/label";

const PASSWORD_MIN = 8;

export default function LoginPage() {
  const t = useTranslations("Auth");
  const router = useRouter();
  const locale = useLocale();
  const searchParams = useSearchParams();
  const prefillUsername = (searchParams.get("username") ?? "").trim();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [signedOutNote, setSignedOutNote] = useState<string | null>(null);
  const [showVerifyLink, setShowVerifyLink] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ username?: string; password?: string }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const [pendingMethods, setPendingMethods] = useState<string[]>([]);
  const [useRecovery, setUseRecovery] = useState(false);
  const [showLostHelp, setShowLostHelp] = useState(false);

  useEffect(() => {
    if (window.sessionStorage.getItem("ltf_signed_out_reason") !== "account_unavailable") {
      return;
    }
    window.sessionStorage.removeItem("ltf_signed_out_reason");
    setSignedOutNote(presentAuthError("account_unavailable").text);
  }, []);

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
    const desks = response.desks ?? [];
    router.push(
      routeAfterSignIn(response.user.role, locale, {
        isSuperuser: Boolean(response.user.is_superuser),
        lastDesk: chosen ?? response.last_desk ?? null,
        desks,
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
    <AuthFrame backHref={`/${locale}`} backLabel={t("backHome")} showKicker>
      {signedOutNote ? (
        <p className="mt-4 text-sm text-[var(--brand-text-blue)]" role="status">
          {signedOutNote}
        </p>
      ) : null}
      <h1 className="brand-headline mt-4 text-5xl text-[var(--brand-on-ink)]">{t("loginTitle")}</h1>
      <p className="auth-quiet mt-3 text-sm leading-relaxed">
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
          <p className="auth-quiet text-sm">
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
              <p className="auth-quiet text-sm">
                {t("mfaSameFieldRecovery")}
              </p>
            )}
          </RequiredForm>
          <ActionNotices error={errorMessage} onDismiss={() => setErrorMessage(null)} />
          <button type="submit" disabled={isSubmitting} className={authPrimaryClass}>
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
                <p className="auth-quiet text-sm">
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

          <button type="submit" disabled={isSubmitting} className={authPrimaryClass}>
            {isSubmitting ? t("loading") : t("signInAction")}
            <span aria-hidden="true" className="ml-2">→</span>
          </button>
        </RequiredForm>
      </form>

      <p className="auth-quiet mt-5 text-sm">
        {t("noAccount")}
      </p>
    </AuthFrame>
  );
}
