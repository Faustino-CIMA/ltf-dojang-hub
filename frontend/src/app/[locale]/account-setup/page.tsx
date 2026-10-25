"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label, RequiredForm } from "@/components/ui/label";
import { ActionNotices } from "@/components/ui/list-page-chrome";
import { completeAccountSetup, getAccountSetup } from "@/lib/setup-api";
import { formatFullName } from "@/lib/person-name";

export default function AccountSetupPage() {
  const t = useTranslations("AccountSetup");
  const common = useTranslations("Common");
  const locale = useLocale();
  const params = useSearchParams();
  const token = params.get("token") || "";
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      setErrorMessage(t("neutral"));
      return;
    }
    let cancelled = false;
    getAccountSetup(token)
      .then((info) => {
        if (cancelled) return;
        setUsername(info.username);
        setName(formatFullName(info));
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) setErrorMessage(t("neutral"));
      });
    return () => {
      cancelled = true;
    };
  }, [t, token]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMessage(null);
    if (password !== confirmPassword) {
      setErrorMessage(t("passwordMismatch"));
      return;
    }
    try {
      setIsSubmitting(true);
      const response = await completeAccountSetup({ token, email, password, password_confirm: confirmPassword });
      setSuccessMessage(response.detail || t("success"));
      setReady(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("neutral"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-3 px-6 py-12">
      <div className="space-y-2 text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-link">{common("appTitle")}</p>
        <h1 className="text-3xl font-semibold text-foreground">{t("title")}</h1>
        <p className="text-sm text-muted">{t("subtitle")}</p>
      </div>
      <ActionNotices
        error={errorMessage}
        success={successMessage}
        onDismiss={() => {
          setErrorMessage(null);
          setSuccessMessage(null);
        }}
      />
      {ready ? (
        <RequiredForm>
          <form className="space-y-4" onSubmit={handleSubmit} autoComplete="on">
            <div className="space-y-2">
              <Label htmlFor="account-setup-username">{t("username")}</Label>
              <Input id="account-setup-username" name="username" value={username} readOnly autoComplete="username" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="account-setup-name">{t("name")}</Label>
              <Input id="account-setup-name" value={name} readOnly />
            </div>
            <div className="space-y-2">
              <Label htmlFor="account-setup-email" required>
                {t("email")}
              </Label>
              <Input
                id="account-setup-email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="account-setup-password" required>
                {t("password")}
              </Label>
              <Input
                id="account-setup-password"
                name="new-password"
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="account-setup-password-confirm" required>
                {t("confirmPassword")}
              </Label>
              <Input
                id="account-setup-password-confirm"
                name="new-password-confirm"
                type="password"
                autoComplete="new-password"
                required
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
              />
            </div>
            <Button type="submit" variant="primary" disabled={isSubmitting}>
              {isSubmitting ? t("submitting") : t("submit")}
            </Button>
          </form>
        </RequiredForm>
      ) : null}
      <div className="text-center text-sm text-muted">
        <Link className="text-foreground hover:underline" href={`/${locale}/login`}>
          {successMessage ? t("continueToLogin") : t("backToLogin")}
        </Link>
      </div>
    </div>
  );
}
