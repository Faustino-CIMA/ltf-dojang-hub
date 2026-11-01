"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { SidePanel } from "@/components/ui/side-panel";
import {
  postMemberAccounts,
  previewMemberAccounts,
  type AccountActionResult,
  type AccountPreview,
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

  const idsKey = memberIds.join(",");
  useEffect(() => {
    if (!open || !idsKey) {
      return;
    }
    let cancelled = false;
    setResult(null);
    setError(null);
    previewMemberAccounts(idsKey.split(",").map((value) => Number(value)))
      .then((payload) => {
        if (!cancelled) {
          setRows(payload.results);
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : "accountNothingToCreate");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, idsKey]);

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

  const confirm = async () => {
    if (!canConfirm || busy) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const payload = await postMemberAccounts({ action, member_ids: memberIds, locale });
      setResult(payload);
      if (payload.csv) {
        downloadFile("csv", payload);
      }
      onDone();
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
    return <p key={reason}>{t(key, { count })}</p>;
  };

  return (
    <SidePanel
      open={open}
      title={title}
      closeLabel={common("modalClose")}
      onClose={onClose}
      footer={
        result ? (
          <>
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
        ) : null
      }
    >
      <div className="space-y-3 text-sm text-foreground">
        <p>{t("accountNoEmailSent")}</p>
        {action === "link" && linkRow?.match ? (
          <p>{t("accountLinkedPrompt", { username: linkRow.match.username })}</p>
        ) : null}
        {action === "create" && rows.length === 1 && rows[0]?.proposed_username ? (
          <p>
            {t("accountUsernameLabel")}: {rows[0].proposed_username}
          </p>
        ) : null}
        {action === "create" && creatable > 0 ? <p>{t("accountWillCreate", { count: creatable })}</p> : null}
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
        {canConfirm ? <p>{t("accountSensitiveWarning")}</p> : null}
        {error ? <p className="text-destructive">{error}</p> : null}
      </div>
    </SidePanel>
  );
}
