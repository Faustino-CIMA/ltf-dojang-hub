"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
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

export function accessIsReset(admin: { access_kind?: string; password_set?: boolean }) {
  if (admin.access_kind === "reset") return true;
  if (admin.access_kind === "setup") return false;
  return Boolean(admin.password_set);
}

export type AccessCopy = {
  addEmail: string;
  sendInvite: string;
  copyInvite: string;
  sendReset: string;
  copyReset: string;
  hintInvite: string;
  hintReset: string;
  hintEmail: string;
  email: string;
  emailHint: string;
  emailHintReady: string;
  emailHintLocked: string;
  emailRequired: string;
  changeTitle: string;
  changeBody: string;
  changeConfirmSend: string;
  changeConfirmCopy: string;
  locale: string;
  localeName: (code: string) => string;
  kindSetup: string;
  kindReset: string;
  remove: (club: string) => string;
};

export type AccessBadgeLabels = {
  noEmail: string;
  linkSent: string;
  linkExpired: string;
  passwordSet: string;
  meta: string;
};

export function useClubAdminAccessCopy() {
  const t = useTranslations("ClubAdmin");
  const copy: AccessCopy = {
    addEmail: t("accessAddEmail"),
    sendInvite: t("accessSendInvite"),
    copyInvite: t("accessCopyInvite"),
    sendReset: t("accessSendReset"),
    copyReset: t("accessCopyReset"),
    hintInvite: t("accessHintInvite"),
    hintReset: t("accessHintReset"),
    hintEmail: t("accessHintEmail"),
    email: t("accessEmailLabel"),
    emailHint: t("accessEmailHint"),
    emailHintReady: t("accessEmailHintReady"),
    emailHintLocked: t("accessEmailHintLocked"),
    emailRequired: t("accessEmailRequired"),
    changeTitle: t("accessChangeTitle"),
    changeBody: t("accessChangeBody"),
    changeConfirmSend: t("accessChangeConfirmSend"),
    changeConfirmCopy: t("accessChangeConfirmCopy"),
    locale: t("accessLocaleLabel"),
    localeName: (code) =>
      code === "fr"
        ? t("accessLocale_fr")
        : code === "de"
          ? t("accessLocale_de")
          : code === "lb"
            ? t("accessLocale_lb")
            : t("accessLocale_en"),
    kindSetup: t("accessKindSetup"),
    kindReset: t("accessKindReset"),
    remove: (club) => t("accessRemove", { club }),
  };
  return {
    copy,
    menuLabel: (name: string) => t("accessMenu", { name }),
    badges: {
      noEmail: t("accessNoEmail"),
      linkSent: t("accessLinkSent"),
      linkExpired: t("accessLinkExpired"),
      passwordSet: t("accessPasswordSet"),
      meta: t("accessLinkMeta", { sent: "{sent}", expires: "{expires}" }),
    } satisfies AccessBadgeLabels,
    sent: (reset: boolean, email: string) =>
      reset ? t("accessSentReset", { email }) : t("accessSentInvite", { email }),
    copied: (reset: boolean) => (reset ? t("accessCopiedReset") : t("accessCopiedInvite")),
    emailFailed: t("accessEmailFailed"),
    emailInUse: t("accessEmailInUse"),
    emailRequired: t("accessEmailRequired"),
    emailChangeForbidden: t("accessEmailChangeForbidden"),
    rateLimited: t("accessRateLimited"),
    download: t("accessDownload"),
    downloadTitle: t("accessDownloadTitle"),
    downloadWarning: t("accessDownloadWarning"),
    downloadAction: t("accessDownloadAction"),
    downloadEmpty: t("accessDownloadEmpty"),
    downloadSkipped: (count: number) => t("accessDownloadSkipped", { count }),
    downloadDone: t("accessDownloadDone"),
    select: (name: string) => t("accessSelect", { name }),
  };
}

export function AccessBadges({
  admin,
  labels,
}: {
  admin: AccessAdmin;
  labels: AccessBadgeLabels;
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
  copy,
  onOpen,
  onCopy,
  onRemove,
}: {
  admin: AccessAdmin;
  menuLabel: string;
  copy: AccessCopy;
  onOpen: () => void;
  onCopy: () => void;
  onRemove: (club: { id: number; name: string }) => void;
}) {
  const reset = accessIsReset(admin);
  const hasEmail = Boolean(admin.email.trim());
  return (
    <RowActionMenu
      label={menuLabel}
      actions={[
        hasEmail
          ? {
              key: "send",
              label: reset ? copy.sendReset : copy.sendInvite,
              icon: <Mail aria-hidden="true" />,
              onSelect: onOpen,
            }
          : {
              key: "add-email",
              label: copy.addEmail,
              icon: <Mail aria-hidden="true" />,
              onSelect: onOpen,
            },
        {
          key: "copy",
          label: reset ? copy.copyReset : copy.copyInvite,
          icon: <Copy aria-hidden="true" />,
          onSelect: onCopy,
        },
        ...admin.clubs.map((club) => ({
          key: `remove-${club.id}`,
          label: copy.remove(club.name),
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
  copy,
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
  copy: AccessCopy;
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
  const reset = accessIsReset(admin);
  const emailLocked = Boolean(current) && !allowEmailChange;
  const changing = Boolean(current) && next.toLowerCase() !== current.toLowerCase();
  const emailOk = isValidEmail(next);
  const canSend = emailOk && !busy;
  const canCopy = (!next || emailOk) && !busy;
  const sendLabel = reset ? copy.sendReset : copy.sendInvite;
  const copyLabel = reset ? copy.copyReset : copy.copyInvite;
  const title = current ? sendLabel : copy.addEmail;
  const hint = current ? (reset ? copy.hintReset : copy.hintInvite) : copy.hintEmail;
  const fieldHint = emailLocked ? copy.emailHintLocked : current ? copy.emailHintReady : copy.emailHint;

  const submit = (delivery: "email" | "copy") => {
    if (delivery === "email" && !emailOk) {
      setEmailError(copy.emailRequired);
      return;
    }
    if (delivery === "copy" && next && !emailOk) {
      setEmailError(copy.emailRequired);
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
      title={title}
      description={hint}
      closeLabel={closeLabel}
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose}>
            {closeLabel}
          </Button>
          <Button type="button" variant="outline" disabled={!canCopy} onClick={() => submit("copy")}>
            {confirmChange === "copy" ? copy.changeConfirmCopy : copyLabel}
          </Button>
          <Button
            type="button"
            disabled={!canSend}
            title={canSend ? undefined : copy.emailRequired}
            onClick={() => submit("email")}
          >
            {confirmChange === "email" ? copy.changeConfirmSend : sendLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-foreground">{formatFullName(admin)}</p>
        <p className="text-sm text-muted">{reset ? copy.kindReset : copy.kindSetup}</p>
        <div className="space-y-2">
          <Label htmlFor="club-admin-access-email" required={!current}>
            {copy.email}
          </Label>
          <Input
            id="club-admin-access-email"
            type="email"
            value={email}
            readOnly={emailLocked}
            onChange={(event) => {
              setEmail(event.target.value);
              setConfirmChange(null);
              setEmailError(null);
            }}
          />
          <p className="text-xs text-muted">{fieldHint}</p>
          {next && !emailOk ? <p className="text-sm text-destructive">{copy.emailRequired}</p> : null}
          {emailError ? <p className="text-sm text-destructive">{emailError}</p> : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="club-admin-access-locale">{copy.locale}</Label>
          <PopoverSelect
            ariaLabel={copy.locale}
            value={chosenLocale}
            onValueChange={setChosenLocale}
            options={LOCALES.map((code) => ({ value: code, label: copy.localeName(code) }))}
          />
        </div>
        {confirmChange ? (
          <p className="text-sm text-foreground">
            {copy.changeTitle} {copy.changeBody.replace("{email}", next).replace("{previous}", current)}
          </p>
        ) : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>
    </SidePanel>
  );
}
