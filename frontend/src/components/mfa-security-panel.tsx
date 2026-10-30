"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";

import { SidePanel } from "@/components/ui/side-panel";
import { Input } from "@/components/ui/input";
import { Label, RequiredForm } from "@/components/ui/label";
import { ActionNotices } from "@/components/ui/list-page-chrome";
import type { MfaStatus } from "@/lib/auth";
import {
  activateTotp,
  beginPasskeyRegistration,
  beginTotp,
  disableEmailMfa,
  enableEmailMfa,
  finishPasskeyRegistration,
  sendEmailMfaCode,
} from "@/lib/mfa-api";
import { createPasskey } from "@/lib/webauthn";

export function MfaSecurityPanel({
  open,
  status,
  onClose,
  onChanged,
}: {
  open: boolean;
  status: MfaStatus | null;
  onClose: () => void;
  onChanged: (next: MfaStatus) => void;
}) {
  const t = useTranslations("Auth");
  const [secret, setSecret] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [emailCode, setEmailCode] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const explain = (error: unknown) => {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("mfa_sign_in_again")) {
      return t("mfaSignInAgain");
    }
    if (message.includes("email_not_accepted")) {
      return t("mfaEmailEnableHint");
    }
    return t("mfaFailed");
  };

  const startTotp = async () => {
    setBusy(true);
    setErrorMessage(null);
    try {
      const started = await beginTotp();
      setSecret(started.secret);
      setQr(started.qr_svg);
    } catch (error) {
      setErrorMessage(explain(error));
    } finally {
      setBusy(false);
    }
  };

  const finishTotp = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const code = String(new FormData(event.currentTarget).get("code") || "").trim();
    if (!code) {
      setErrorMessage(t("mfaCodeRequired"));
      return;
    }
    setBusy(true);
    setErrorMessage(null);
    try {
      const result = await activateTotp(code);
      setCodes(result.recovery_codes);
      setSecret(null);
      onChanged(result.mfa);
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
      if (result.recovery_codes?.length) {
        setCodes(result.recovery_codes);
      }
      setSuccessMessage(t("mfaPasskeyAdded"));
      onChanged(result.mfa);
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

  return (
    <SidePanel open={open} title={t("mfaSecurity")} closeLabel={t("mfaClose")} onClose={onClose}>
      <div className="space-y-5 text-sm text-foreground">
        <ActionNotices error={errorMessage} success={successMessage} onDismiss={() => { setErrorMessage(null); setSuccessMessage(null); }} />
        {codes ? (
          <div className="space-y-3">
            <h2 className="text-section">{t("mfaRecoveryTitle")}</h2>
            <p className="text-muted">{t("mfaRecoveryHint")}</p>
            <ul className="grid grid-cols-2 gap-2 font-mono text-sm">
              {codes.map((code) => (
                <li key={code} className="rounded-[var(--radius-control)] border border-border bg-surface px-2 py-1">
                  {code}
                </li>
              ))}
            </ul>
            <button type="button" className="text-sm font-medium text-primary" onClick={() => setCodes(null)}>
              {t("mfaRecoveryDone")}
            </button>
          </div>
        ) : null}
        <div className="space-y-2">
          <h2 className="text-section">{t("mfaSetup")}</h2>
          {qr ? <div className="max-w-48 bg-surface" dangerouslySetInnerHTML={{ __html: qr }} /> : null}
          {secret ? (
            <p>
              <span className="text-muted">{t("mfaSecret")}: </span>
              <span className="font-mono">{secret}</span>
            </p>
          ) : (
            <button type="button" className="text-sm font-medium text-primary" disabled={busy} onClick={() => void startTotp()}>
              {t("mfaSetup")}
            </button>
          )}
          {secret ? (
            <form onSubmit={(event) => void finishTotp(event)}>
              <RequiredForm className="space-y-2">
                <Label htmlFor="totp-code" required>
                  {t("mfaCode")}
                </Label>
                <Input id="totp-code" name="code" inputMode="numeric" autoComplete="one-time-code" required />
                <button type="submit" disabled={busy} className="inline-flex h-10 items-center rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60">
                  {t("mfaConfirm")}
                </button>
              </RequiredForm>
            </form>
          ) : null}
        </div>
        <div>
          <button type="button" className="text-sm font-medium text-primary" disabled={busy} onClick={() => void addPasskey()}>
            {t("mfaPasskeyAdd")}
          </button>
          {status?.passkeys ? <p className="text-meta text-muted">{status.passkeys}</p> : null}
        </div>
        {status?.email_available ? (
          <form className="space-y-2" onSubmit={(event) => void turnOnEmail(event)}>
            <h2 className="text-section">{t("mfaEmailEnable")}</h2>
            <p className="text-muted">{t("mfaEmailEnableHint")}</p>
            {status.email_enabled ? <p>{t("mfaEmailOn")}</p> : null}
            <button
              type="button"
              className="text-sm font-medium text-primary"
              disabled={busy}
              onClick={() => {
                setErrorMessage(null);
                void sendEmailMfaCode().catch((error) => setErrorMessage(explain(error)));
              }}
            >
              {t("mfaEmailSend")}
            </button>
            <Label htmlFor="email-mfa-code" required>
              {t("mfaCode")}
            </Label>
            <Input id="email-mfa-code" value={emailCode} onChange={(event) => setEmailCode(event.target.value)} inputMode="numeric" autoComplete="one-time-code" />
            <div className="flex gap-3">
              <button type="submit" disabled={busy} className="text-sm font-medium text-primary">
                {t("mfaConfirm")}
              </button>
              {status.email_enabled ? (
                <button
                  type="button"
                  className="text-sm text-muted"
                  onClick={() => {
                    void disableEmailMfa().then(onChanged).catch((error) => setErrorMessage(explain(error)));
                  }}
                >
                  {t("mfaEmailOff")}
                </button>
              ) : null}
            </div>
          </form>
        ) : null}
      </div>
    </SidePanel>
  );
}
