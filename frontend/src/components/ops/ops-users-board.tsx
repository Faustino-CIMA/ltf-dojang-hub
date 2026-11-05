"use client";

import { useMemo, useRef, useState } from "react";
import { Fingerprint, KeyRound, Mail, Shield, ShieldOff, Smartphone, TimerReset, Trash2, UserCheck, UserX } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { EntityTable } from "@/components/club-admin/entity-table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ActionNotices, ListToolbarPanel, SelectionMeta } from "@/components/ui/list-page-chrome";
import { LoadingCardGrid } from "@/components/ui/loading-card";
import { RowActionMenu } from "@/components/ui/row-action-menu";
import { SidePanel } from "@/components/ui/side-panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDisplayDateTime } from "@/lib/date-display";
import {
  createBulkLoginLinks,
  runOpsUserAction,
  type BulkLoginLinkFile,
  type BulkLinkType,
  type OpsUser,
} from "@/lib/ops-api";
import { offPageSelectedCount, togglePageSelection, visibleHeaderCheck } from "@/lib/row-selection";

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function downloadFile(kind: "csv" | "pdf", file: BulkLoginLinkFile) {
  if (kind === "csv") {
    downloadBlob("login-links.csv", new Blob([file.csv], { type: "text/csv;charset=utf-8" }));
    return;
  }
  const bytes = Uint8Array.from(atob(file.pdf_base64), (char) => char.charCodeAt(0));
  downloadBlob("login-links.pdf", new Blob([bytes], { type: "application/pdf" }));
}

export function OpsUsersBoard({
  users,
  isLoading,
  query,
  onQueryChange,
  onChanged,
  currentUserId,
}: {
  users: OpsUser[];
  isLoading: boolean;
  query: string;
  onQueryChange: (value: string) => void;
  onChanged: () => Promise<void> | void;
  currentUserId?: number | null;
}) {
  const t = useTranslations("Ops");
  const common = useTranslations("Common");
  const locale = useLocale();
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [linkType, setLinkType] = useState<BulkLinkType | null>(null);
  const [pendingIds, setPendingIds] = useState<number[]>([]);
  const [file, setFile] = useState<BulkLoginLinkFile | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<OpsUser | null>(null);

  const visibleIds = useMemo(() => users.map((user) => user.id), [users]);
  const knownUsers = useRef(new Map<number, OpsUser>());
  for (const user of users) {
    knownUsers.current.set(user.id, user);
  }
  const chosen = (linkType ? pendingIds : selectedIds)
    .map((id) => knownUsers.current.get(id))
    .filter((user): user is OpsUser => Boolean(user));
  const createCount = chosen.filter((user) => user.is_active).length;
  const skipCount = chosen.length - createCount;
  const headerCheck = visibleHeaderCheck(selectedIds, visibleIds);
  const otherPageCount = offPageSelectedCount(selectedIds, visibleIds);

  const act = async (user: OpsUser, action: string) => {
    try {
      await runOpsUserAction(user.id, action, action === "send_password_reset" ? { locale } : undefined);
      const done =
        action === "reset_authenticator"
          ? t("mfaResetDone")
          : action === "remove_passkeys"
            ? t("mfaPasskeysRemoved")
            : action === "extend_mfa_grace"
              ? t("mfaGraceExtended")
              : t("userActionDone");
      setSuccessMessage(done);
      await onChanged();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("saveError"));
    }
  };

  const openLinks = (type: BulkLinkType) => {
    setFile(null);
    setPendingIds(selectedIds);
    setLinkType(type);
  };

  const closeLinks = () => {
    setLinkType(null);
    setPendingIds([]);
    setFile(null);
  };

  const confirmDelete = async () => {
    if (!pendingDelete) {
      return;
    }
    setBusy(true);
    setErrorMessage(null);
    try {
      await runOpsUserAction(pendingDelete.id, "delete");
      setSuccessMessage(t("userDeleted"));
      setPendingDelete(null);
      await onChanged();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("saveError"));
    } finally {
      setBusy(false);
    }
  };

  const download = async (kind: "csv" | "pdf") => {
    if (!linkType || createCount === 0) {
      return;
    }
    setBusy(true);
    setErrorMessage(null);
    try {
      const ready =
        file ??
        (await createBulkLoginLinks({
          link_type: linkType,
          user_ids: pendingIds,
          locale,
        }));
      if (!file) {
        setFile(ready);
        setSelectedIds([]);
        setSuccessMessage(t("bulkDownloaded", { count: ready.created_count }));
      }
      downloadFile(kind, ready);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("saveError"));
    } finally {
      setBusy(false);
    }
  };

  const title =
    linkType === "reset_password"
      ? t("bulkConfirmReset", { count: createCount })
      : t("bulkConfirmFirstLogin", { count: createCount });

  return (
    <>
      <ActionNotices
        error={errorMessage}
        success={successMessage}
        onDismiss={() => {
          setErrorMessage(null);
          setSuccessMessage(null);
        }}
      />
      <ListToolbarPanel
        search={
          <Input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={t("searchUsers")}
            aria-label={t("searchUsers")}
          />
        }
        trailing={
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={selectedIds.length === 0} onClick={() => openLinks("first_login")}>
              {t("bulkFirstLogin")}
            </Button>
            <Button type="button" variant="outline" disabled={selectedIds.length === 0} onClick={() => openLinks("reset_password")}>
              {t("bulkResetPassword")}
            </Button>
            <SelectionMeta
              count={selectedIds.length}
              countLabel={t("selectedCountLabel", { count: selectedIds.length })}
              offPageCount={otherPageCount}
              offPageLabel={t("selectedOnOtherPagesLabel", { count: otherPageCount })}
              clearLabel={t("clearSelection")}
              onClear={() => setSelectedIds([])}
            />
          </div>
        }
      />
      <div className="mt-3">
        {isLoading ? (
          <LoadingCardGrid title={t("usersTitle")} description={t("usersSubtitle")} />
        ) : (
          <EntityTable
            columns={[
              {
                key: "select",
                header: (
                  <Checkbox
                    checked={headerCheck}
                    onCheckedChange={() => setSelectedIds((current) => togglePageSelection(current, visibleIds))}
                    aria-label={t("bulkSelectPage")}
                  />
                ),
                render: (row) => (
                  <Checkbox
                    checked={selectedIds.includes(row.id)}
                    onCheckedChange={() =>
                      setSelectedIds((current) =>
                        current.includes(row.id) ? current.filter((id) => id !== row.id) : [...current, row.id],
                      )
                    }
                    aria-label={row.username}
                  />
                ),
              },
              { key: "username", header: t("colUser") },
              { key: "email", header: t("colEmail") },
              { key: "role", header: t("colRole") },
              {
                key: "is_active",
                header: t("colActive"),
                render: (row) => (
                  <StatusBadge label={row.is_active ? t("yes") : t("no")} tone={row.is_active ? "success" : "danger"} />
                ),
              },
              {
                key: "is_superuser",
                header: t("colSuperuser"),
                render: (row) => (row.is_superuser ? t("yes") : t("no")),
              },
              {
                key: "last_login",
                header: t("colLastLogin"),
                render: (row) => (row.last_login ? formatDisplayDateTime(row.last_login) : "—"),
              },
              {
                key: "actions",
                header: t("colActions"),
                render: (row) => (
                  <RowActionMenu
                    label={t("userActions", { username: row.username })}
                    actions={[
                      {
                        key: "active",
                        label: row.is_active ? t("disable") : t("enable"),
                        icon: row.is_active ? <UserX aria-hidden /> : <UserCheck aria-hidden />,
                        onSelect: () => void act(row, row.is_active ? "disable" : "enable"),
                      },
                      {
                        key: "revoke",
                        label: t("revokeSession"),
                        icon: <KeyRound aria-hidden />,
                        onSelect: () => void act(row, "revoke_tokens"),
                      },
                      {
                        key: "reset",
                        label: t("sendReset"),
                        icon: <Mail aria-hidden />,
                        onSelect: () => void act(row, "send_password_reset"),
                      },
                      {
                        key: "superuser",
                        label: row.is_superuser ? t("revokeSuperuser") : t("grantSuperuser"),
                        icon: row.is_superuser ? <ShieldOff aria-hidden /> : <Shield aria-hidden />,
                        onSelect: () => void act(row, row.is_superuser ? "revoke_superuser" : "grant_superuser"),
                      },
                      {
                        key: "grace",
                        label: t("extendMfaGrace"),
                        icon: <TimerReset aria-hidden />,
                        onSelect: () => void act(row, "extend_mfa_grace"),
                      },
                      {
                        key: "passkeys",
                        label: t("removePasskeys"),
                        icon: <Fingerprint aria-hidden />,
                        onSelect: () => void act(row, "remove_passkeys"),
                      },
                      {
                        key: "authenticator",
                        label: t("resetAuthenticator"),
                        icon: <Smartphone aria-hidden />,
                        onSelect: () => void act(row, "reset_authenticator"),
                      },
                      ...(row.id === currentUserId
                        ? []
                        : [
                            {
                              key: "delete",
                              label: t("deleteUser"),
                              icon: <Trash2 aria-hidden />,
                              destructive: true,
                              onSelect: () => setPendingDelete(row),
                            },
                          ]),
                    ]}
                  />
                ),
              },
            ]}
            rows={users}
          />
        )}
      </div>
      <SidePanel
        open={pendingDelete !== null}
        title={t("deleteUserTitle", { username: pendingDelete?.username ?? "" })}
        description={t("deleteUserBody")}
        closeLabel={common("deleteCancelButton")}
        onClose={() => setPendingDelete(null)}
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setPendingDelete(null)} disabled={busy}>
              {common("deleteCancelButton")}
            </Button>
            <Button type="button" variant="destructive" onClick={() => void confirmDelete()} disabled={busy}>
              {t("deleteUser")}
            </Button>
          </>
        }
      >
        {pendingDelete?.linked_name ? (
          <p className="text-sm text-foreground">{t("deleteUserMember", { name: pendingDelete.linked_name })}</p>
        ) : (
          <p className="text-sm text-muted">{t("deleteUserNoMember")}</p>
        )}
      </SidePanel>
      <SidePanel
        open={linkType !== null}
        title={createCount === 0 ? t("bulkNothingToCreate") : title}
        description={createCount === 0 ? undefined : t("bulkSensitiveWarning")}
        closeLabel={common("deleteCancelButton")}
        onClose={closeLinks}
        footer={
          <>
            <Button type="button" variant="outline" onClick={closeLinks} disabled={busy}>
              {common("deleteCancelButton")}
            </Button>
            {createCount > 0 ? (
              <>
                <Button type="button" variant="outline" onClick={() => void download("pdf")} disabled={busy}>
                  {t("bulkDownloadPdf")}
                </Button>
                <Button type="button" onClick={() => void download("csv")} disabled={busy}>
                  {t("bulkDownloadCsv")}
                </Button>
              </>
            ) : null}
          </>
        }
      >
        {skipCount > 0 ? <p className="text-sm text-muted">{t("bulkSkippedInactive", { count: skipCount })}</p> : null}
      </SidePanel>
    </>
  );
}
