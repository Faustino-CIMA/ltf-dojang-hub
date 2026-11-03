"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

import { AuthResultCard } from "@/components/auth/auth-result-card";
import { Celebration } from "@/components/auth/celebration";
import { AccountSetupGrant } from "@/components/setup/account-setup-grant";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label, RequiredForm } from "@/components/ui/label";
import { ActionNotices } from "@/components/ui/list-page-chrome";
import { recallAccountReady, rememberAccountReady, signInHref } from "@/lib/auth-outcome";
import { completeAccountSetup, loadAccountSetup, type AccountSetupAssignment } from "@/lib/setup-api";
import { formatFullName } from "@/lib/person-name";

type Phase = "loading" | "form" | "success" | "used" | "expired" | "revoked" | "invalid" | "unavailable";

export default function AccountSetupPage() {
  const t = useTranslations("AccountSetup");
  const common = useTranslations("Common");
  const locale = useLocale();
  const params = useSearchParams();
  const token = params.get("token") || "";
  const [phase, setPhase] = useState<Phase>("loading");
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [assignments, setAssignments] = useState<AccountSetupAssignment[]>([]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      setPhase("invalid");
      return;
    }
    let cancelled = false;
    loadAccountSetup(token)
      .then((result) => {
        if (cancelled) return;
        if (result.status === "open") {
          setUsername(result.info.username);
          setName(formatFullName(result.info));
          setAssignments(result.info.assignments ?? []);
          setPhase("form");
          return;
        }
        if (result.status === "used") {
          const saved = recallAccountReady(token);
          if (saved) {
            setUsername(saved.username);
            setEmail(saved.email);
            setPhase("success");
            return;
          }
        }
        setPhase(result.status);
      })
      .catch(() => {
        if (!cancelled) setPhase("unavailable");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMessage(null);
    if (password !== confirmPassword) {
      setErrorMessage(t("passwordMismatch"));
      return;
    }
    try {
      setIsSubmitting(true);
      await completeAccountSetup({ token, email, password, password_confirm: confirmPassword });
      rememberAccountReady({ token, username, email });
      setPhase("success");
    } catch (error) {
      const closed = await loadAccountSetup(token).catch(() => null);
      if (closed && closed.status !== "open") {
        setPhase(closed.status === "used" ? "success" : closed.status);
        return;
      }
      setErrorMessage(error instanceof Error ? error.message : t("neutral"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const loginHref = signInHref(locale, username);
  const knownSignIn = username && email ? t("successBody", { username, email }) : t("usedBody");

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-10 sm:px-6 sm:py-12">
      <Celebration active={phase === "success"} />
      {phase === "form" || phase === "loading" ? (
        <div className="space-y-2 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-link">{common("appTitle")}</p>
          <h1 className="text-3xl font-semibold text-foreground">{t("title")}</h1>
          {phase === "form" ? <AccountSetupGrant assignments={assignments} /> : null}
          <p className="text-sm text-muted">{phase === "loading" ? t("checking") : t("subtitle")}</p>
        </div>
      ) : null}

      {phase === "success" ? (
        <AuthResultCard
          tone="success"
          title={t("successTitle")}
          body={knownSignIn}
          live={t("successLive")}
          action={{ href: loginHref, label: t("signInNow") }}
        />
      ) : null}
      {phase === "used" ? (
        <AuthResultCard
          tone="success"
          title={t("usedTitle")}
          body={t("usedBody")}
          live={t("usedLive")}
          action={{ href: loginHref, label: t("signInNow") }}
        />
      ) : null}
      {phase === "expired" ? (
        <AuthResultCard tone="warning" title={t("expiredTitle")} body={t("expiredBody")} live={t("expiredLive")} />
      ) : null}
      {phase === "revoked" ? (
        <AuthResultCard tone="warning" title={t("revokedTitle")} body={t("revokedBody")} live={t("revokedLive")} />
      ) : null}
      {phase === "invalid" ? (
        <AuthResultCard tone="warning" title={t("invalidTitle")} body={t("invalidBody")} live={t("invalidLive")} />
      ) : null}
      {phase === "unavailable" ? (
        <AuthResultCard tone="warning" title={t("unavailableTitle")} body={t("unavailableBody")} live={t("unavailableLive")} />
      ) : null}

      {phase === "form" ? (
        <>
          <ActionNotices error={errorMessage} onDismiss={() => setErrorMessage(null)} />
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
