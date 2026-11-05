"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { Download, Mail, UserRound } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { ActionNotices } from "@/components/ui/list-page-chrome";
import { SidePanel } from "@/components/ui/side-panel";
import {
  postMemberAccounts,
  previewMemberAccounts,
  type AccountActionResult,
  type AccountPreview,
  type CreatedAccount,
} from "@/lib/member-accounts";

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function downloadFile(kind: "csv" | "pdf", file: AccountActionResult) {
  if (kind === "csv") {
    downloadBlob("member-logins.csv", new Blob([file.csv], { type: "text/csv;charset=utf-8" }));
    return;
  }
  const bytes = Uint8Array.from(atob(file.pdf_base64), (char) => char.charCodeAt(0));
  downloadBlob("member-logins.pdf", new Blob([bytes], { type: "application/pdf" }));
}

function reasonCount(rows: AccountPreview[], reason: string) {
  return rows.filter((row) => row.reason === reason).length;
}

function PersonCard({
  icon: Icon,
  title,
  lines,
}: {
  icon: typeof UserRound;
  title: string;
  lines: Array<{ label: string; value: string }>;
}) {
  const titleId = useId();
  return (
    <section className="app-panel space-y-2 p-3" aria-labelledby={titleId}>
      <div className="flex min-w-0 items-start gap-3">
        <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-secondary text-foreground">
          <Icon className="size-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <h3 id={titleId} className="text-section text-foreground">{title}</h3>
          <dl className="mt-2 space-y-1">
            {lines.map((line) => (
              <div key={line.label} className="text-sm">
                <dt className="text-muted">{line.label}</dt>
                <dd className="text-foreground">{line.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}

function personLines(
  row: { club_name?: string; email?: string; proposed_username?: string; username?: string },
  labels: { club: string; username: string; email: string; noEmail: string },
): Array<{ label: string; value: string }> {
  const lines: Array<{ label: string; value: string }> = [];
  if (row.club_name) {
    lines.push({ label: labels.club, value: row.club_name });
  }
  const username = row.proposed_username || row.username || "";
  if (username) {
    lines.push({ label: labels.username, value: username });
  }
  lines.push({ label: labels.email, value: row.email?.trim() ? row.email : labels.noEmail });
  return lines;
}

export function MemberAccountPanel({
  open,
  namespace,
  memberIds,
  intent,
  onClose,
  onDone,
}: {
  open: boolean;
  namespace: "ClubAdmin" | "LtfAdmin";
  memberIds: number[];
  intent: "create" | "copy" | "link";
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useTranslations(namespace);
  const common = useTranslations("Common");
  const locale = useLocale();
  const [rows, setRows] = useState<AccountPreview[]>([]);
  const [result, setResult] = useState<AccountActionResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const idsKey = memberIds.join(",");
  useEffect(() => {
    if (!open || !idsKey) {
      return;
    }
    let cancelled = false;
    setResult(null);
    setError(null);
    setSuccess(null);
    previewMemberAccounts(idsKey.split(",").map((value) => Number(value)))
      .then((payload) => {
        if (!cancelled) {
          setRows(payload.results);
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : t("accountNothingToCreate"));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, idsKey, t]);

  const creatable = rows.filter((row) => row.can_create).length;
  const linkRow = rows.find((row) => row.can_link) ?? null;
  const copyRow = rows.find((row) => row.can_copy) ?? null;
  const singleLink = intent !== "copy" && rows.length === 1 && linkRow !== null && creatable === 0;
  const action = intent === "copy" ? "copy_link" : singleLink || intent === "link" ? "link" : "create";
  const canConfirm =
    result === null &&
    (action === "copy_link" ? Boolean(copyRow) : action === "link" ? Boolean(linkRow) : creatable > 0);
  const title =
    action === "copy_link"
      ? t("copyFirstLoginLink")
      : action === "link"
        ? t("linkExistingLogin")
        : memberIds.length > 1
          ? t("createUserAccounts")
          : t("createUserAccount");
  const created = result?.created ?? [];
  const showCreateResult = action === "create" && result !== null;
  const canEmail = created.some((row) => row.email.trim());
  const labels = {
    club: t("accountClubLabel"),
    username: t("accountUsernameLabel"),
    email: t("accountEmailLabel"),
    noEmail: t("accountNoAddress"),
  };

  const confirm = async () => {
    if (!canConfirm || busy) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const payload = await postMemberAccounts({ action, member_ids: memberIds, locale });
      setResult(payload);
      if (action !== "create" && payload.csv) {
        downloadFile("csv", payload);
      }
      if (action === "create") {
        const people = payload.created ?? [];
        setSuccess(
          people.length === 1
            ? t("accountCreatedFor", { name: people[0]?.name ?? "" })
            : t("accountCreatedCount", { count: payload.created_count }),
        );
      }
      onDone();
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : t("accountNothingToCreate"));
    } finally {
      setBusy(false);
    }
  };

  const sendInvites = async () => {
    if (!canEmail || busy) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const summary = await postMemberAccounts({
        action: "send_invite",
        member_ids: created.map((row) => row.member_id),
        locale,
      });
      const sent = Number(summary.sent ?? 0);
      const missing = Number(summary.missing_email ?? 0);
      const failed = Number(summary.failed ?? 0);
      if (failed > 0 && sent === 0) {
        setError(t("accountNothingToCreate"));
        return;
      }
      setSuccess(missing > 0 ? t("accountInviteSentMany", { sent, missing }) : t("accountInviteSent"));
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : t("accountNothingToCreate"));
    } finally {
      setBusy(false);
    }
  };

  const skipLine = (reason: string, key: string) => {
    const count = reasonCount(rows, reason);
    if (count === 0) {
      return null;
    }
    return <p key={reason} className="text-sm text-muted">{t(key, { count })}</p>;
  };

  const footer: ReactNode = showCreateResult ? (
    <>
      {result?.csv ? <p className="w-full text-sm text-muted">{t("accountFileWarning")}</p> : null}
      {canEmail ? <p className="w-full text-sm text-muted">{t("accountInviteReplaces")}</p> : (
        <p className="w-full text-sm text-muted">{t("accountSendUnavailable")}</p>
      )}
      {result?.csv ? (
        <Button type="button" variant="outline" disabled={busy} onClick={() => downloadFile("csv", result)}>
          <Download aria-hidden />
          {t("accountSaveCsv")}
        </Button>
      ) : null}
      {result?.pdf_base64 ? (
        <Button type="button" variant="outline" disabled={busy} onClick={() => downloadFile("pdf", result)}>
          {t("accountDownloadPdf")}
        </Button>
      ) : null}
      <Button type="button" disabled={busy || !canEmail} onClick={() => void sendInvites()}>
        <Mail aria-hidden />
        {t("accountSendInvite")}
      </Button>
    </>
  ) : result ? (
    <>
      {result.csv || result.pdf_base64 ? (
        <p className="w-full text-sm text-muted">{t("accountFileWarning")}</p>
      ) : null}
      {result.pdf_base64 ? (
        <Button type="button" variant="outline" onClick={() => downloadFile("pdf", result)}>
          {t("accountDownloadPdf")}
        </Button>
      ) : null}
      {result.copy_link ? (
        <Button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(result.copy_link);
          }}
        >
          {t("accountCopyLink")}
        </Button>
      ) : null}
    </>
  ) : canConfirm ? (
    <Button type="button" disabled={busy} onClick={() => void confirm()}>
      {t("accountConfirm")}
    </Button>
  ) : null;

  return (
    <SidePanel open={open} title={title} closeLabel={common("modalClose")} onClose={onClose} footer={footer}>
      <div className="space-y-3 text-sm text-foreground">
        <ActionNotices
          error={error}
          success={success}
          onDismiss={() => {
            setError(null);
            setSuccess(null);
          }}
        />
        {showCreateResult
          ? created.map((row: CreatedAccount) => (
              <PersonCard key={row.member_id} icon={UserRound} title={row.name} lines={personLines(row, labels)} />
            ))
          : null}
        {!showCreateResult && action === "create"
          ? rows
              .filter((row) => row.can_create)
              .map((row) => (
                <PersonCard
                  key={row.member_id}
                  icon={UserRound}
                  title={row.name}
                  lines={personLines(row, labels)}
                />
              ))
          : null}
        {!showCreateResult && action !== "create" ? <p>{t("accountNoEmailSent")}</p> : null}
        {action === "link" && linkRow?.match ? (
          <p>{t("accountLinkedPrompt", { username: linkRow.match.username })}</p>
        ) : null}
        {!showCreateResult ? (
          <>
            {skipLine("under_16", "accountUnder16Skip")}
            {skipLine("inactive", "accountInactiveSkip")}
            {skipLine("no_birth_date", "accountNoBirthDateSkip")}
            {skipLine("has_account", "accountHasAccountSkip")}
            {skipLine("needs_link", "accountNeedsLinkSkip")}
            {skipLine("staff_login", "accountStaffLoginSkip")}
            {skipLine("linked_elsewhere", "accountLinkedElsewhereSkip")}
            {rows
              .filter((row) => row.reason === "needs_link" && row.match)
              .map((row) => (
                <p key={row.member_id}>
                  {row.name}: {row.match?.username}
                </p>
              ))}
            {!canConfirm && result === null && rows.length > 0 ? <p>{t("accountNothingToCreate")}</p> : null}
          </>
        ) : null}
      </div>
    </SidePanel>
  );
}
