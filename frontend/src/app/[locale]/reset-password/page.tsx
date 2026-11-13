"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

import { AuthFrame, authPrimaryClass } from "@/components/auth/auth-frame";
import { AuthResultCard } from "@/components/auth/auth-result-card";
import { Celebration } from "@/components/auth/celebration";
import { ActionNotices } from "@/components/ui/list-page-chrome";
import { Input } from "@/components/ui/input";
import { Label, RequiredForm } from "@/components/ui/label";
import { recallPasswordReady, rememberPasswordReady, signInHref } from "@/lib/auth-outcome";
import { resetPasswordConfirm } from "@/lib/auth-api";

const DEAD_LINK = "Invalid or expired reset link.";

export default function ResetPasswordPage() {
  const t = useTranslations("Reset");
  const locale = useLocale();
  const params = useSearchParams();
  const uid = params.get("uid") || "";
  const token = params.get("token") || "";
  const username = (params.get("username") ?? "").trim();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [phase, setPhase] = useState<"loading" | "form" | "success" | "invalid">(!uid || !token ? "invalid" : "loading");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!uid || !token) {
      setPhase("invalid");
      return;
    }
    setPhase(recallPasswordReady(`${uid}:${token}`) ? "success" : "form");
  }, [uid, token]);

  const loginHref = signInHref(locale, username);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMessage(null);

    if (!uid || !token) {
      setPhase("invalid");
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage(t("passwordMismatch"));
      return;
    }

    try {
      setIsSubmitting(true);
      await resetPasswordConfirm({ uid, token, password });
      rememberPasswordReady({ token: `${uid}:${token}`, username, email: "" });
      setPhase("success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message === DEAD_LINK) {
        setPhase("invalid");
        return;
      }
      setErrorMessage(message || t("resetFailed"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthFrame backHref={loginHref} backLabel={t("backToLogin")}>
      <Celebration active={phase === "success"} />
      {phase === "form" || phase === "loading" ? (
        <div className="mt-4 space-y-2">
          <h1 className="text-3xl font-semibold text-[var(--brand-on-ink)]">{t("title")}</h1>
          <p className="auth-quiet text-sm">{t("subtitle")}</p>
        </div>
      ) : null}

      {phase === "success" ? (
        <AuthResultCard
          tone="success"
          title={t("successTitle")}
          body={username ? t("successBody", { username }) : t("successBodyNoUser")}
          live={t("successLive")}
          action={{ href: loginHref, label: t("signInNow") }}
        />
      ) : null}
      {phase === "invalid" ? (
        <AuthResultCard
          tone="warning"
          title={t("invalidTitle")}
          body={t("invalidBody")}
          live={t("invalidLive")}
          action={{ href: loginHref, label: t("signInNow") }}
        />
      ) : null}

      {phase === "form" ? (
        <>
          <ActionNotices error={errorMessage} onDismiss={() => setErrorMessage(null)} />
          <RequiredForm>
            <form className="mt-6 space-y-4" onSubmit={handleSubmit} autoComplete="on">
              {username ? (
                <div className="space-y-2">
                  <Label htmlFor="reset-username">{t("usernameLabel")}</Label>
                  <Input id="reset-username" name="username" type="text" value={username} readOnly autoComplete="username" />
                  <p className="auth-quiet text-xs">{t("usernameHint")}</p>
                </div>
              ) : null}
              <div className="space-y-2">
                <Label htmlFor="reset-password" required>
                  {t("passwordLabel")}
                </Label>
                <Input
                  id="reset-password"
                  name="new-password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reset-password-confirm" required>
                  {t("confirmPasswordLabel")}
                </Label>
                <Input
                  id="reset-password-confirm"
                  name="new-password-confirm"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  required
                />
              </div>
              <button type="submit" className={authPrimaryClass} disabled={isSubmitting}>
                {isSubmitting ? t("submitting") : t("submit")}
              </button>
            </form>
          </RequiredForm>
        </>
      ) : null}
    </AuthFrame>
  );
}
