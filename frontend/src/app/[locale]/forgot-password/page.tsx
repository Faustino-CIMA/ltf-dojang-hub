"use client";

import { type FormEvent, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { AuthFrame, authPrimaryClass } from "@/components/auth/auth-frame";
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

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setEmailError(null);
    setFormError(null);
    const data = new FormData(event.currentTarget);
    const email = String(data.get("email") ?? "").trim();
    const username = String(data.get("username") ?? "").trim();
    if (!email && !username) {
      setEmailError(t("emailRequired"));
      return;
    }
    setIsSubmitting(true);
    try {
      await resetPasswordRequest({ email, username, locale });
      setSent(true);
    } catch {
      setFormError(t("forgotError"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthFrame backHref={`/${locale}/login`} backLabel={t("backToSignIn")}>
      <p className="brand-eyebrow mt-5">
        <span>{home("kicker")}</span>
      </p>
      <h1 className="mt-4 text-3xl font-semibold text-[var(--brand-on-ink)]">{t("forgotTitle")}</h1>
      <p className="auth-quiet mt-3 text-sm leading-relaxed">{t("forgotHint")}</p>
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
            <div className="space-y-2">
              <Label htmlFor="forgot-username">{t("forgotUsernameLabel")}</Label>
              <Input id="forgot-username" name="username" autoComplete="username" disabled={isSubmitting} />
              <p className="auth-quiet text-sm">{t("forgotUsernameHint")}</p>
            </div>
            <ActionNotices error={formError} onDismiss={() => setFormError(null)} />
            <button type="submit" disabled={isSubmitting} className={authPrimaryClass}>
              {isSubmitting ? t("loading") : t("forgotSubmit")}
            </button>
          </RequiredForm>
        </form>
      )}
    </AuthFrame>
  );
}
