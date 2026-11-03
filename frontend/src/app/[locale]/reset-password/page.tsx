"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

import { AuthResultCard } from "@/components/auth/auth-result-card";
import { Celebration } from "@/components/auth/celebration";
import { Button } from "@/components/ui/button";
import { ActionNotices } from "@/components/ui/list-page-chrome";
import { Input } from "@/components/ui/input";
import { Label, RequiredForm } from "@/components/ui/label";
import { recallPasswordReady, rememberPasswordReady, signInHref } from "@/lib/auth-outcome";
import { resetPasswordConfirm } from "@/lib/auth-api";

const DEAD_LINK = "Invalid or expired reset link.";

export default function ResetPasswordPage() {
  const t = useTranslations("Reset");
  const common = useTranslations("Common");
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
    <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-10 sm:px-6 sm:py-12">
      <Celebration active={phase === "success"} />
      {phase === "form" || phase === "loading" ? (
        <div className="space-y-2 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-link">{common("appTitle")}</p>
          <h1 className="text-3xl font-semibold text-foreground">{t("title")}</h1>
          <p className="text-sm text-muted">{t("subtitle")}</p>
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
            <form className="space-y-4" onSubmit={handleSubmit} autoComplete="on">
              {username ? (
                <div className="space-y-2">
                  <Label htmlFor="reset-username">{t("usernameLabel")}</Label>
                  <Input id="reset-username" name="username" type="text" value={username} readOnly autoComplete="username" />
                  <p className="text-xs text-muted">{t("usernameHint")}</p>
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
              <Button type="submit" variant="primary" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? t("submitting") : t("submit")}
              </Button>
            </form>
          </RequiredForm>
          <div className="text-center text-sm text-muted">
            <Link className="text-foreground hover:underline" href={loginHref}>
              {t("backToLogin")}
            </Link>
          </div>
        </>
      ) : null}
    </div>
  );
}
