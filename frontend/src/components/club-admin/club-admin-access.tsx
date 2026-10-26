"use client";

import { useEffect, useState } from "react";
import { Copy, Mail, Trash2 } from "lucide-react";

import { RowActionMenu } from "@/components/ui/row-action-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PopoverSelect } from "@/components/ui/popover-select";
import { SidePanel } from "@/components/ui/side-panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDisplayDateTime } from "@/lib/date-display";
import { formatFullName } from "@/lib/person-name";

export type AccessAdmin = {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  clubs: { id: number; name: string }[];
  password_set?: boolean;
  link_status?: string;
  link_sent_at?: string | null;
  link_expires_at?: string | null;
  access_kind?: "setup" | "reset";
};

const LOCALES = ["en", "fr", "de", "lb"] as const;

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function AccessBadges({
  admin,
  labels,
}: {
  admin: AccessAdmin;
  labels: { noEmail: string; linkSent: string; linkExpired: string; passwordSet: string; meta: string };
}) {
  const sent = admin.link_sent_at ? formatDisplayDateTime(admin.link_sent_at) : "";
  const expires = admin.link_expires_at ? formatDisplayDateTime(admin.link_expires_at) : "";
  return (
    <>
      {!admin.email ? <StatusBadge label={labels.noEmail} tone="warning" /> : null}
      {admin.password_set ? <StatusBadge label={labels.passwordSet} tone="success" /> : null}
      {!admin.password_set && admin.link_status === "active" ? (
        <StatusBadge label={labels.linkSent} tone="info" />
      ) : null}
      {!admin.password_set && admin.link_status === "expired" ? (
        <StatusBadge label={labels.linkExpired} tone="warning" />
      ) : null}
      {!admin.password_set && admin.link_status === "active" && sent && expires ? (
        <span className="text-xs text-muted">{labels.meta.replace("{sent}", sent).replace("{expires}", expires)}</span>
      ) : null}
    </>
  );
}

export function ClubAdminAccessMenu({
  admin,
  menuLabel,
  sendLabel,
  copyLabel,
  removeLabel,
  onSend,
  onCopy,
  onRemove,
}: {
  admin: AccessAdmin;
  menuLabel: string;
  sendLabel: string;
  copyLabel: string;
  removeLabel: (club: string) => string;
  onSend: () => void;
  onCopy: () => void;
  onRemove: (club: { id: number; name: string }) => void;
}) {
  return (
    <RowActionMenu
      label={menuLabel}
      actions={[
        { key: "send", label: sendLabel, icon: <Mail aria-hidden="true" />, onSelect: onSend },
        { key: "copy", label: copyLabel, icon: <Copy aria-hidden="true" />, onSelect: onCopy },
        ...admin.clubs.map((club) => ({
          key: `remove-${club.id}`,
          label: removeLabel(club.name),
          icon: <Trash2 aria-hidden="true" />,
          destructive: true,
          onSelect: () => onRemove(club),
        })),
      ]}
    />
  );
}

export function ClubAdminAccessPanel({
  admin,
  open,
  allowEmailChange,
  locale,
  busy,
  error,
  closeLabel,
  labels,
  onClose,
  onSubmit,
}: {
  admin: AccessAdmin | null;
  open: boolean;
  allowEmailChange: boolean;
  locale: string;
  busy: boolean;
  error: string | null;
  closeLabel: string;
  labels: {
    title: string;
    hint: string;
    email: string;
    emailHint: string;
    emailRequired: string;
    send: string;
    copy: string;
    changeTitle: string;
    changeBody: string;
    changeConfirm: string;
    locale: string;
    localeName: (code: string) => string;
    kindSetup: string;
    kindReset: string;
  };
  onClose: () => void;
  onSubmit: (body: { delivery: "email" | "copy"; email: string; locale: string }) => void;
}) {
  const [email, setEmail] = useState("");
  const [chosenLocale, setChosenLocale] = useState(locale);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [confirmChange, setConfirmChange] = useState<"email" | "copy" | null>(null);

  useEffect(() => {
    setEmail(admin?.email ?? "");
    setChosenLocale(locale);
    setEmailError(null);
    setConfirmChange(null);
  }, [admin?.id, admin?.email, locale]);

  if (!admin) {
    return null;
  }
  const current = admin.email.trim();
  const next = email.trim();
  const emailLocked = Boolean(current) && !allowEmailChange;
  const changing = Boolean(current) && next.toLowerCase() !== current.toLowerCase();

  const submit = (delivery: "email" | "copy") => {
    if (delivery === "email" && !isValidEmail(next)) {
      setEmailError(labels.emailRequired);
      return;
    }
    if (delivery === "copy" && next && !isValidEmail(next)) {
      setEmailError(labels.emailRequired);
      return;
    }
    if (changing && confirmChange !== delivery) {
      setConfirmChange(delivery);
      setEmailError(null);
      return;
    }
    setEmailError(null);
    onSubmit({ delivery, email: next, locale: chosenLocale });
  };

  return (
    <SidePanel
      open={open}
      title={labels.title}
      description={labels.hint}
      closeLabel={closeLabel}
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose}>
            {closeLabel}
          </Button>
          <Button type="button" variant="outline" disabled={busy} onClick={() => submit("copy")}>
            {labels.copy}
          </Button>
          <Button type="button" disabled={busy} onClick={() => submit("email")}>
            {confirmChange ? labels.changeConfirm : labels.send}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-foreground">{formatFullName(admin)}</p>
        <p className="text-sm text-muted">{admin.access_kind === "reset" ? labels.kindReset : labels.kindSetup}</p>
        <div className="space-y-2">
          <Label htmlFor="club-admin-access-email" required={!current}>
            {labels.email}
          </Label>
          <Input
            id="club-admin-access-email"
            type="email"
            value={email}
            readOnly={emailLocked}
            onChange={(event) => {
              setEmail(event.target.value);
              setConfirmChange(null);
            }}
          />
          <p className="text-xs text-muted">{labels.emailHint}</p>
          {emailError ? <p className="text-sm text-destructive">{emailError}</p> : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="club-admin-access-locale">{labels.locale}</Label>
          <PopoverSelect
            ariaLabel={labels.locale}
            value={chosenLocale}
            onValueChange={setChosenLocale}
            options={LOCALES.map((code) => ({ value: code, label: labels.localeName(code) }))}
          />
        </div>
        {confirmChange ? (
          <p className="text-sm text-foreground">
            {labels.changeTitle} {labels.changeBody.replace("{email}", next).replace("{previous}", current)}
          </p>
        ) : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>
    </SidePanel>
  );
}
