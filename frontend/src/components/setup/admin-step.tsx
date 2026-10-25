"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatFullName } from "@/lib/person-name";
import {
  confirmSetupAdmins,
  downloadSetupLinks,
  getSetupAdmins,
  issueSetupLink,
  previewSetupAdmins,
  type SetupAdminPreview,
  type SetupAdminRecord,
  type SetupAdminRow,
} from "@/lib/setup-api";

const STATUS_TONE: Record<string, "success" | "warning" | "danger" | "neutral" | "info"> = {
  ok: "success",
  already_admin: "info",
  member_not_found: "warning",
  club_not_found: "warning",
  name_mismatch: "warning",
  likely_swapped: "warning",
  club_admin_limit: "danger",
};

export function AdminStep({ onFinish }: { onFinish: () => void }) {
  const t = useTranslations("Setup");
  const locale = useLocale();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<SetupAdminPreview | null>(null);
  const [admins, setAdmins] = useState<SetupAdminRecord[]>([]);
  const [notImported, setNotImported] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sort, setSort] = useState<{ key: "name" | "club" | "status"; dir: "asc" | "desc" }>({ key: "name", dir: "asc" });
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [regenerateId, setRegenerateId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    getSetupAdmins()
      .then((result) => {
        if (cancelled) return;
        setAdmins(result.admins);
        setNotImported(result.not_imported);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const rows = useMemo(() => {
    const source = preview?.rows ?? [];
    const sorted = [...source].sort((left, right) => {
      const value = (row: SetupAdminRow) =>
        sort.key === "club" ? row.club_name : sort.key === "status" ? row.status : formatFullName(row);
      return value(left).localeCompare(value(right)) * (sort.dir === "asc" ? 1 : -1);
    });
    return sorted;
  }, [preview, sort]);

  const toggleSort = (key: "name" | "club" | "status") => {
    setSort((current) => ({ key, dir: current.key === key && current.dir === "asc" ? "desc" : "asc" }));
  };

  const copyLink = async (userId: number) => {
    setBusy(true);
    setError(null);
    try {
      const issued = await issueSetupLink(userId, locale);
      await navigator.clipboard.writeText(issued.setup_link);
      setNotice(t("copied"));
      const next = await getSetupAdmins();
      setAdmins(next.admins);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("previewFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-[var(--radius-card)] border border-border bg-card p-4">
      <h2 className="text-lg font-semibold">{t("step_admins")}</h2>
      <p className="mt-2 text-sm text-muted">{t("adminsHelp")}</p>
      {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
      {notice ? <p className="mt-3 text-sm text-muted">{notice}</p> : null}
      <label className="mt-4 block text-sm font-medium" htmlFor="setup-admins-file">
        {t("chooseFile")}
      </label>
      <input
        id="setup-admins-file"
        className="mt-2 block text-sm"
        type="file"
        accept=".csv,text/csv"
        onChange={(event) => {
          const next = event.target.files?.[0] ?? null;
          setFile(next);
          if (!next) return;
          setBusy(true);
          previewSetupAdmins(next)
            .then((result) => {
              setPreview(result);
              setNotImported(result.not_imported);
            })
            .catch((cause) => setError(cause instanceof Error ? cause.message : t("previewFailed")))
            .finally(() => setBusy(false));
        }}
      />
      {preview ? (
        <p className="mt-3 text-sm text-muted">
          {t("adminIgnored", {
            blank: preview.blank_rows_ignored,
            ltf: preview.ltf_rows_ignored,
            skipped: preview.skipped_admin_ids,
          })}
        </p>
      ) : null}
      {rows.length ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-muted">
                <th className="py-2 pr-3">{t("adminId")}</th>
                <th className="py-2 pr-3">
                  <button type="button" onClick={() => toggleSort("name")}>
                    {t("name")}
                  </button>
                </th>
                <th className="py-2 pr-3">
                  <button type="button" onClick={() => toggleSort("club")}>
                    {t("club")}
                  </button>
                </th>
                <th className="py-2">
                  <button type="button" onClick={() => toggleSort("status")}>
                    {t("status")}
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.row_index}-${row.admin_id}`} className="border-b border-border">
                  <td className="py-2 pr-3">{row.admin_id}</td>
                  <td className="py-2 pr-3">{formatFullName(row)}</td>
                  <td className="py-2 pr-3">{row.club_name}</td>
                  <td className="py-2">
                    <StatusBadge label={t(`status_${row.status}`)} tone={STATUS_TONE[row.status] ?? "neutral"} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {notImported.length ? (
        <div className="mt-4 rounded-[var(--radius-form)] border border-border p-3">
          <h3 className="font-medium">{t("notImportedTitle")}</h3>
          <ul className="mt-2 space-y-1 text-sm text-muted">
            {notImported.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          disabled={!file || busy || !preview?.can_confirm}
          onClick={() => {
            if (!file) return;
            setBusy(true);
            confirmSetupAdmins(file)
              .then(async (result) => {
                setNotImported(result.not_imported);
                setAdmins((await getSetupAdmins()).admins);
              })
              .catch((cause) => setError(cause instanceof Error ? cause.message : t("previewFailed")))
              .finally(() => setBusy(false));
          }}
        >
          {t("confirmAdmins")}
        </Button>
        <Button variant="outline" onClick={onFinish}>
          {t("finish")}
        </Button>
      </div>
      {admins.length ? (
        <div className="mt-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-medium">{t("resultTitle")}</h3>
            <Button variant="outline" onClick={() => setDownloadOpen(true)}>
              {t("downloadLinks")}
            </Button>
          </div>
          <p className="mt-2 text-sm text-muted">{t("linksOnce")}</p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-muted">
                  <th className="py-2 pr-3">{t("username")}</th>
                  <th className="py-2 pr-3">{t("name")}</th>
                  <th className="py-2 pr-3">{t("clubs")}</th>
                  <th className="py-2 pr-3">{t("linkStatus")}</th>
                  <th className="py-2">{t("actions")}</th>
                </tr>
              </thead>
              <tbody>
                {admins.map((admin) => (
                  <tr key={admin.user_id} className="border-b border-border">
                    <td className="py-2 pr-3">{admin.username}</td>
                    <td className="py-2 pr-3">{formatFullName(admin)}</td>
                    <td className="py-2 pr-3">{admin.clubs.map((club) => club.name).join(", ")}</td>
                    <td className="py-2 pr-3">{t(`link_${admin.link_status}`)}</td>
                    <td className="py-2">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          disabled={busy || admin.link_status === "used" || admin.link_status === "active"}
                          onClick={() => void copyLink(admin.user_id)}
                        >
                          {t("copyLink")}
                        </Button>
                        <Button
                          variant="outline"
                          disabled={busy || admin.link_status === "used"}
                          onClick={() => setRegenerateId(admin.user_id)}
                        >
                          {t("regenerate")}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
      <Modal isOpen={downloadOpen} onClose={() => setDownloadOpen(false)} title={t("downloadTitle")}>
        <p className="text-sm text-foreground">{t("downloadWarning")}</p>
        <p className="mt-2 text-sm text-muted">{t("downloadRevokeNote")}</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setDownloadOpen(false)}>
            {t("cancel")}
          </Button>
          <Button
            onClick={() => {
              setBusy(true);
              downloadSetupLinks(locale)
                .then(async () => {
                  setDownloadOpen(false);
                  setAdmins((await getSetupAdmins()).admins);
                })
                .catch((cause) => setError(cause instanceof Error ? cause.message : t("previewFailed")))
                .finally(() => setBusy(false));
            }}
          >
            {t("downloadLinks")}
          </Button>
        </div>
      </Modal>
      <Modal
        isOpen={regenerateId !== null}
        onClose={() => setRegenerateId(null)}
        title={t("regenerateTitle")}
        description={t("regenerateBody")}
      >
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setRegenerateId(null)}>
            {t("cancel")}
          </Button>
          <Button
            onClick={() => {
              const userId = regenerateId;
              setRegenerateId(null);
              if (userId) void copyLink(userId);
            }}
          >
            {t("regenerate")}
          </Button>
        </div>
      </Modal>
    </section>
  );
}
