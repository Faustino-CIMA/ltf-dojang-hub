"use client";

import { useId, useState, type FormEvent, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { CircleOff, Download, Fingerprint, KeyRound, LockKeyhole, Mail, RefreshCw, ShieldCheck, Smartphone } from "lucide-react";

import { SidePanel } from "@/components/ui/side-panel";
import { Input } from "@/components/ui/input";
import { Label, RequiredForm } from "@/components/ui/label";
import { ActionNotices, PageNotice } from "@/components/ui/list-page-chrome";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { RowActionMenu } from "@/components/ui/row-action-menu";
import { AuthApiError } from "@/lib/auth-errors";
import type { MfaStatus } from "@/lib/auth";
import { formatDisplayDate } from "@/lib/date-display";
import {
  activateTotp,
  beginPasskeyRegistration,
  beginTotp,
  changePassword,
  disableEmailMfa,
  enableEmailMfa,
  finishPasskeyRegistration,
  mfaFailureKey,
  reauthenticate,
  regenerateRecoveryCodes,
  removePasskey,
  sendEmailMfaCode,
  totpDigits,
} from "@/lib/mfa-api";
import { createPasskey } from "@/lib/webauthn";

function daysUntil(until: string): number {
  const end = new Date(`${until.slice(0, 10)}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((end.getTime() - today.getTime()) / 86400000));
}

function recoveryTone(count: number): "info" | "warning" | "danger" {
  if (count <= 0) return "danger";
  if (count <= 3) return "warning";
  return "info";
}

function downloadCodes(codes: string[], filename: string) {
  const blob = new Blob([`${codes.join("\n")}\n`], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function SecurityCard({
  icon: Icon,
  title,
  description,
  badge,
  children,
}: {
  icon: typeof ShieldCheck;
  title: string;
  description: string;
  badge?: ReactNode;
  children?: ReactNode;
}) {
  const titleId = useId();
  return (
    <section className="app-panel space-y-3 p-3" aria-labelledby={titleId}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-secondary text-foreground">
            <Icon className="size-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <h3 id={titleId} className="text-section text-foreground">{title}</h3>
            <p className="mt-0.5 text-sm text-muted">{description}</p>
          </div>
        </div>
        {badge ? <div className="shrink-0">{badge}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function MfaSecurityPanel({
  open,
  status,
  onClose,
  onChanged,
  onEnrolled,
}: {
  open: boolean;
  status: MfaStatus | null;
  onClose: () => void;
  onChanged: (next: MfaStatus) => void;
  onEnrolled: () => void;
}) {
  const t = useTranslations("Auth");
  const [secret, setSecret] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [codesAreNewKey, setCodesAreNewKey] = useState(false);
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);
  const [emailCode, setEmailCode] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [needsReauth, setNeedsReauth] = useState(false);
  const [resumeTotp, setResumeTotp] = useState(false);
  const [pendingCode, setPendingCode] = useState<string | null>(null);
  const [passwordOpen, setPasswordOpen] = useState(false);

  const explain = (error: unknown) => {
    if (error instanceof AuthApiError && (error.code === "mfa_sign_in_again" || error.code === "mfa_not_pending")) {
      setNeedsReauth(true);
      return t("mfaReauthHint");
    }
    if (error instanceof AuthApiError) {
      return error.message;
    }
    const message = error instanceof Error ? error.message : "";
    const key = mfaFailureKey(message);
    if (key === "mfaSignInAgain") {
      setNeedsReauth(true);
      return t("mfaReauthHint");
    }
    return t(key);
  };

  const startTotp = async (fresh = false) => {
    setBusy(true);
    setErrorMessage(null);
    try {
      const started = await beginTotp(fresh);
      setSecret(started.secret);
      setQr(started.qr_svg);
    } catch (error) {
      const reauth =
        (error instanceof AuthApiError && (error.code === "mfa_sign_in_again" || error.code === "mfa_not_pending")) ||
        (error instanceof Error && mfaFailureKey(error.message) === "mfaSignInAgain");
      if (reauth) setResumeTotp(true);
      setErrorMessage(explain(error));
    } finally {
      setBusy(false);
    }
  };

  const completeEnrolment = () => {
    setCodes(null);
    setCodesAreNewKey(false);
    setSuccessMessage(null);
    onEnrolled();
    onClose();
  };

  const noteEnrolment = (recoveryCodes: string[] | undefined) => {
    if (recoveryCodes?.length) {
      setCodesAreNewKey(true);
      setCodes(recoveryCodes);
      setSuccessMessage(null);
      return;
    }
    completeEnrolment();
  };

  const acknowledgeCodes = () => {
    if (codesAreNewKey) {
      completeEnrolment();
      return;
    }
    setCodes(null);
    setCodesAreNewKey(false);
  };

  const regenerateCodes = async () => {
    setBusy(true);
    setErrorMessage(null);
    setConfirmRegenerate(false);
    try {
      const result = await regenerateRecoveryCodes();
      setCodesAreNewKey(false);
      setCodes(result.recovery_codes);
      onChanged(result.mfa);
    } catch (error) {
      setErrorMessage(explain(error));
    } finally {
      setBusy(false);
    }
  };

  const finishTotp = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const code = totpDigits(String(new FormData(event.currentTarget).get("code") || ""));
    if (!code) {
      setErrorMessage(t("mfaCodeRequired"));
      return;
    }
    setPendingCode(code);
    setBusy(true);
    setErrorMessage(null);
    try {
      const result = await activateTotp(code);
      setSecret(null);
      setQr(null);
      setPendingCode(null);
      setNeedsReauth(false);
      onChanged(result.mfa);
      noteEnrolment(result.recovery_codes);
    } catch (error) {
      setErrorMessage(explain(error));
    } finally {
      setBusy(false);
    }
  };

  const confirmPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const password = String(new FormData(event.currentTarget).get("password") || "");
    if (!password) {
      setErrorMessage(t("passwordRequired"));
      return;
    }
    setBusy(true);
    setErrorMessage(null);
    try {
      await reauthenticate(password);
      setNeedsReauth(false);
      if (pendingCode) {
        const result = await activateTotp(pendingCode);
        setSecret(null);
        setQr(null);
        setPendingCode(null);
        setResumeTotp(false);
        onChanged(result.mfa);
        noteEnrolment(result.recovery_codes);
        return;
      }
      if (resumeTotp && !secret) {
        setResumeTotp(false);
        const started = await beginTotp();
        setSecret(started.secret);
        setQr(started.qr_svg);
        return;
      }
      setResumeTotp(false);
    } catch (error) {
      setErrorMessage(explain(error));
    } finally {
      setBusy(false);
    }
  };

  const addPasskey = async () => {
    setBusy(true);
    setErrorMessage(null);
    try {
      const options = await beginPasskeyRegistration();
      const creation = (options as { publicKey?: PublicKeyCredentialCreationOptionsJSON }).publicKey ?? options;
      const credential = await createPasskey(creation);
      const result = await finishPasskeyRegistration("Passkey", credential);
      onChanged(result.mfa);
      noteEnrolment(result.recovery_codes);
    } catch (error) {
      setErrorMessage(explain(error));
    } finally {
      setBusy(false);
    }
  };

  const turnOnEmail = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!emailCode.trim()) {
      setErrorMessage(t("mfaCodeRequired"));
      return;
    }
    setBusy(true);
    setErrorMessage(null);
    try {
      onChanged(await enableEmailMfa(emailCode.trim()));
      setSuccessMessage(t("mfaEmailOn"));
      setEmailCode("");
    } catch (error) {
      setErrorMessage(explain(error));
    } finally {
      setBusy(false);
    }
  };

  const changeAccountPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const current = String(data.get("current_password") || "");
    const next = String(data.get("new_password") || "");
    const again = String(data.get("new_password_again") || "");
    if (!current || !next) {
      setErrorMessage(t("passwordRequired"));
      return;
    }
    if (next.length < 8) {
      setErrorMessage(t("passwordTooShort", { min: 8 }));
      return;
    }
    if (next !== again) {
      setErrorMessage(t("mfaPasswordMismatch"));
      return;
    }
    setBusy(true);
    setErrorMessage(null);
    try {
      await changePassword(current, next);
      setPasswordOpen(false);
      setSuccessMessage(t("mfaPasswordChanged"));
    } catch (error) {
      const code = error instanceof AuthApiError ? error.code : "";
      if (code === "enter_current_password" || code === "incorrect_password") {
        setErrorMessage(t("mfaReauthFailed"));
      } else if (code === "password_too_short") {
        setErrorMessage(t("passwordTooShort", { min: 8 }));
      } else if (code === "password_too_common" || code === "password_entirely_numeric" || code === "password_too_similar") {
        setErrorMessage(t("mfaPasswordWeak"));
      } else {
        setErrorMessage(t("mfaPasswordFailed"));
      }
    } finally {
      setBusy(false);
    }
  };

  const authenticatorOn = Boolean(status?.totp);
  const recoveryCount = status?.recovery_codes_remaining ?? 0;
  const devices = status?.passkey_devices ?? [];

  return (
    <SidePanel open={open} title={t("mfaSecurity")} closeLabel={t("mfaClose")} onClose={onClose}>
      <div className="space-y-3 text-sm text-foreground">
        <ActionNotices error={errorMessage} success={successMessage} onDismiss={() => { setErrorMessage(null); setSuccessMessage(null); }} />
        {status?.grace && status.grace_until ? (
          <PageNotice tone="info">{t("mfaEnrolGrace", { days: daysUntil(status.grace_until) })}</PageNotice>
        ) : status?.blocked || status?.desk_block ? (
          <PageNotice tone="info">{status.desk_block === "mfa_required" ? t("mfaSessionNotice") : t("mfaEnrolClosed")}</PageNotice>
        ) : null}
        {needsReauth ? (
          <form className="app-panel space-y-2 p-3" onSubmit={(event) => void confirmPassword(event)}>
            <p className="text-muted">{t("mfaReauthHint")}</p>
            <Label htmlFor="mfa-reauth-password" required>
              {t("password")}
            </Label>
            <Input id="mfa-reauth-password" name="password" type="password" autoComplete="current-password" required />
            <Button type="submit" variant="primary" disabled={busy}>
              <LockKeyhole aria-hidden />
              {t("mfaReauthSubmit")}
            </Button>
          </form>
        ) : null}

        {codes?.length ? (
          <SecurityCard
            icon={KeyRound}
            title={t("mfaRecoveryTitle")}
            description={t("mfaCardRecoveryHint")}
            badge={<StatusBadge label={String(codes.length)} tone="info" />}
          >
            <PageNotice tone="info">{t("mfaRecoveryKeep", { count: codes.length })}</PageNotice>
            <ul className="grid grid-cols-1 gap-2 font-mono text-sm sm:grid-cols-2">
              {codes.map((code) => (
                <li key={code} className="rounded-[var(--radius-control)] border border-border bg-surface px-2 py-1">
                  {code}
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => downloadCodes(codes, "ltf-recovery-codes.txt")}>
                <Download aria-hidden />
                {t("mfaDownloadCodes")}
              </Button>
              <Button type="button" variant="primary" onClick={acknowledgeCodes}>
                {t("mfaRecoveryDone")}
              </Button>
            </div>
          </SecurityCard>
        ) : null}

        <SecurityCard
          icon={Smartphone}
          title={t("mfaCardAuthenticator")}
          description={t("mfaCardAuthenticatorHint")}
          badge={
            <StatusBadge
              label={authenticatorOn ? t("mfaStatusOn") : t("mfaStatusOff")}
              tone={authenticatorOn ? "success" : "neutral"}
            />
          }
        >
          {authenticatorOn && status?.totp_since ? (
            <p className="text-meta text-muted">{t("mfaSince", { date: formatDisplayDate(status.totp_since) })}</p>
          ) : null}
          {qr && !codes?.length ? (
            <div className="max-w-48 bg-surface" role="img" aria-label={t("mfaCardAuthenticator")} dangerouslySetInnerHTML={{ __html: qr }} />
          ) : null}
          {codes?.length ? null : secret ? (
            <div className="space-y-2">
              <p>
                <span className="text-muted">{t("mfaSecret")}: </span>
                <span className="font-mono tracking-wide">{secret.replace(/\s+/g, "").match(/.{1,4}/g)?.join(" ") ?? secret}</span>
              </p>
              <p className="text-muted">{t("mfaSecretHint")}</p>
              <form onSubmit={(event) => void finishTotp(event)}>
                <RequiredForm className="space-y-2">
                  <Label htmlFor="totp-code" required>
                    {t("mfaCode")}
                  </Label>
                  <Input id="totp-code" name="code" type="text" inputMode="numeric" autoComplete="one-time-code" required />
                  <div className="flex flex-wrap gap-2">
                    <Button type="submit" variant="primary" disabled={busy}>
                      <ShieldCheck aria-hidden />
                      {t("mfaConfirm")}
                    </Button>
                    <Button type="button" variant="outline" disabled={busy} onClick={() => void startTotp(true)}>
                      <RefreshCw aria-hidden />
                      {t("mfaRetry")}
                    </Button>
                  </div>
                </RequiredForm>
              </form>
            </div>
          ) : (
            <Button type="button" variant="primary" className="h-auto whitespace-normal" disabled={busy} onClick={() => void startTotp(authenticatorOn)}>
              <KeyRound aria-hidden />
              {authenticatorOn ? t("mfaChangeKey") : t("mfaSetup")}
            </Button>
          )}
        </SecurityCard>

        <SecurityCard
          icon={KeyRound}
          title={t("mfaCardRecovery")}
          description={t("mfaCardRecoveryHint")}
          badge={
            <StatusBadge
              label={String(recoveryCount)}
              tone={recoveryTone(recoveryCount)}
            />
          }
        >
          <PageNotice tone={recoveryTone(recoveryCount)}>
            {recoveryCount <= 0 ? t("mfaRecoveryStockNone") : t("mfaRecoveryStock", { count: recoveryCount })}
          </PageNotice>
          {codes?.length ? null : confirmRegenerate ? (
            <div className="space-y-2">
              <PageNotice tone="warning">{t("mfaRegenerateConfirm")}</PageNotice>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="primary" className="h-auto whitespace-normal" disabled={busy} onClick={() => void regenerateCodes()}>
                  <RefreshCw aria-hidden />
                  {t("mfaRegenerate")}
                </Button>
                <Button type="button" variant="outline" disabled={busy} onClick={() => setConfirmRegenerate(false)}>
                  {t("mfaRegenerateCancel")}
                </Button>
              </div>
            </div>
          ) : (
            <Button type="button" variant="outline" className="h-auto whitespace-normal" disabled={busy || !status?.enrolled} onClick={() => setConfirmRegenerate(true)}>
              <RefreshCw aria-hidden />
              {t("mfaRegenerate")}
            </Button>
          )}
        </SecurityCard>

        <SecurityCard
          icon={Fingerprint}
          title={t("mfaCardPasskeys")}
          description={t("mfaCardPasskeysHint")}
          badge={<StatusBadge label={String(devices.length || status?.passkeys || 0)} tone={devices.length ? "success" : "neutral"} />}
        >
          {devices.length ? (
            <ul className="space-y-2">
              {devices.map((device) => (
                <li key={device.id} className="flex items-center justify-between gap-2 rounded-[var(--radius-control)] border border-border px-2 py-1">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{device.name}</p>
                    <p className="text-meta text-muted">{t("mfaPasskeyAddedOn", { date: formatDisplayDate(device.added_on) })}</p>
                  </div>
                  <RowActionMenu
                    label={t("mfaPasskeyMenu", { name: device.name })}
                    actions={[
                      {
                        key: "remove",
                        label: t("mfaPasskeyRemove"),
                        destructive: true,
                        confirmLabel: t("mfaPasskeyRemoveConfirm"),
                        onSelect: () => {
                          setBusy(true);
                          setErrorMessage(null);
                          void removePasskey(device.id)
                            .then(onChanged)
                            .catch((error) => setErrorMessage(explain(error)))
                            .finally(() => setBusy(false));
                        },
                      },
                    ]}
                  />
                </li>
              ))}
            </ul>
          ) : null}
          <Button type="button" variant="primary" disabled={busy} onClick={() => void addPasskey()}>
            <Fingerprint aria-hidden />
            {t("mfaPasskeyAdd")}
          </Button>
        </SecurityCard>

        <SecurityCard icon={LockKeyhole} title={t("mfaCardPassword")} description={t("mfaCardPasswordHint")}>
          {passwordOpen ? (
            <form className="space-y-2" onSubmit={(event) => void changeAccountPassword(event)}>
              <Label htmlFor="mfa-current-password" required>
                {t("mfaPasswordCurrent")}
              </Label>
              <Input id="mfa-current-password" name="current_password" type="password" autoComplete="current-password" autoFocus required />
              <Label htmlFor="mfa-new-password" required>
                {t("mfaPasswordNew")}
              </Label>
              <Input id="mfa-new-password" name="new_password" type="password" autoComplete="new-password" minLength={8} required />
              <Label htmlFor="mfa-new-password-again" required>
                {t("mfaPasswordAgain")}
              </Label>
              <Input id="mfa-new-password-again" name="new_password_again" type="password" autoComplete="new-password" minLength={8} required />
              <div className="flex flex-wrap gap-2">
                <Button type="submit" variant="primary" className="h-auto whitespace-normal" disabled={busy}>
                  <KeyRound aria-hidden />
                  {t("mfaChangePassword")}
                </Button>
                <Button type="button" variant="outline" disabled={busy} onClick={() => setPasswordOpen(false)}>
                  {t("mfaRegenerateCancel")}
                </Button>
              </div>
            </form>
          ) : (
            <Button type="button" variant="outline" className="h-auto whitespace-normal" disabled={busy} onClick={() => setPasswordOpen(true)}>
              <KeyRound aria-hidden />
              {t("mfaChangePassword")}
            </Button>
          )}
        </SecurityCard>

        {status?.email_available ? (
          <SecurityCard
            icon={Mail}
            title={t("mfaEmailEnable")}
            description={t("mfaEmailEnableHint")}
            badge={<StatusBadge label={status.email_enabled ? t("mfaStatusOn") : t("mfaStatusOff")} tone={status.email_enabled ? "success" : "neutral"} />}
          >
            <form className="space-y-2" onSubmit={(event) => void turnOnEmail(event)}>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  setErrorMessage(null);
                  void sendEmailMfaCode().catch((error) => setErrorMessage(explain(error)));
                }}
              >
                <Mail aria-hidden />
                {t("mfaEmailSend")}
              </Button>
              <Label htmlFor="email-mfa-code" required>
                {t("mfaCode")}
              </Label>
              <Input id="email-mfa-code" value={emailCode} onChange={(event) => setEmailCode(event.target.value)} inputMode="numeric" autoComplete="one-time-code" />
              <div className="flex flex-wrap gap-2">
                <Button type="submit" variant="primary" disabled={busy}>
                  {t("mfaConfirm")}
                </Button>
                {status.email_enabled ? (
                  <Button
                    type="button"
                    variant="destructive"
                    className="h-auto whitespace-normal"
                    disabled={busy}
                    onClick={() => {
                      void disableEmailMfa().then(onChanged).catch((error) => setErrorMessage(explain(error)));
                    }}
                  >
                    <CircleOff aria-hidden />
                    {t("mfaEmailOff")}
                  </Button>
                ) : null}
              </div>
            </form>
          </SecurityCard>
        ) : null}
      </div>
    </SidePanel>
  );
}
