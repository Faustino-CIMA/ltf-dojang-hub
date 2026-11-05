"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import { EntityTable } from "@/components/club-admin/entity-table";
import { OpsLayout } from "@/components/ops/ops-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ActionNotices } from "@/components/ui/list-page-chrome";
import { RowActionMenu } from "@/components/ui/row-action-menu";
import { SidePanel } from "@/components/ui/side-panel";
import { apiRequest } from "@/lib/api";
import { getOpsUsers, type OpsUser } from "@/lib/ops-api";

type GrantPreview = { id: number; desk: string; level: string; club: string; source: string; open: boolean };
type FoldPreview = {
  id: number;
  name: string;
  email: string;
  grants: GrantPreview[];
  emails: Array<{ email: string; action: string }>;
  authenticators: string[];
  clubs_administered: string[];
  clubs_trained: string[];
  records: Array<{ model: string; field: string; count: number }>;
};
type MemberPreview = { id: number; name: string; club: string; user_id: number };
type Preview = {
  survivor: { id: number; name: string; email: string; members: MemberPreview[] };
  folded: FoldPreview[];
  member_conflict: boolean;
  member_profiles: Array<{ user_id: number; name: string; members: MemberPreview[] }>;
};

function personName(user: OpsUser) {
  const last = user.last_name?.trim() || "";
  const first = user.first_name?.trim() || "";
  return last || first ? `${last} ${first}`.trim() : user.username;
}

export default function OpsMergesPage() {
  const t = useTranslations("Ops");
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<OpsUser[]>([]);
  const [kept, setKept] = useState<OpsUser | null>(null);
  const [folded, setFolded] = useState<OpsUser[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [keepMemberId, setKeepMemberId] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const rows = useMemo(
    () => users.filter((user) => user.is_active && user.id !== kept?.id && !folded.some((row) => row.id === user.id)),
    [users, kept, folded],
  );

  const search = async () => {
    setErrorMessage(null);
    try {
      const page = await getOpsUsers({ q: query || undefined });
      setUsers(page.results);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("loadError"));
    }
  };

  const loadPreview = async () => {
    if (!kept || folded.length === 0) {
      setErrorMessage(t("mergeNone"));
      return;
    }
    setBusy(true);
    setErrorMessage(null);
    try {
      const result = await apiRequest<Preview>(
        `/api/ops/merges/?survivor=${kept.id}&folded=${folded.map((user) => user.id).join(",")}`,
      );
      setPreview(result);
      setKeepMemberId(result.member_conflict ? null : result.survivor.members[0]?.id ?? null);
      setOpen(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      setErrorMessage(message.includes("mfa_required") ? t("mergeMfa") : message || t("loadError"));
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!kept) return;
    if (preview?.member_conflict && !keepMemberId) {
      setErrorMessage(t("mergeConflict"));
      return;
    }
    setBusy(true);
    setErrorMessage(null);
    try {
      await apiRequest("/api/ops/merges/", {
        method: "POST",
        body: JSON.stringify({
          survivor_id: kept.id,
          folded_ids: folded.map((user) => user.id),
          keep_member_id: keepMemberId,
        }),
      });
      setSuccessMessage(t("mergeDone"));
      setOpen(false);
      setFolded([]);
      setPreview(null);
      await search();
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      setErrorMessage(
        message.includes("mfa_required") ? t("mergeMfa") : message.includes("member_conflict") ? t("mergeConflict") : message || t("loadError"),
      );
    } finally {
      setBusy(false);
    }
  };

  const profiles = [
    ...(preview?.survivor.members ?? []),
    ...(preview?.member_profiles.flatMap((row) => row.members) ?? []),
  ];

  return (
    <OpsLayout title={t("mergeTitle")} subtitle={t("mergeSubtitle")}>
      <ActionNotices
        error={errorMessage}
        success={successMessage}
        onDismiss={() => {
          setErrorMessage(null);
          setSuccessMessage(null);
        }}
      />
      <form
        className="mb-4 flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void search();
        }}
      >
        <div className="min-w-64 flex-1 space-y-1">
          <Label htmlFor="merge-search">{t("mergeSearch")}</Label>
          <Input id="merge-search" value={query} onChange={(event) => setQuery(event.target.value)} />
        </div>
        <Button type="submit" variant="outline">{t("mergeSearch")}</Button>
      </form>

      <div className="mb-4 space-y-2 text-sm text-foreground">
        <p>
          <span className="text-muted">{t("mergeKept")}: </span>
          {kept ? `${personName(kept)} · ${kept.email}` : "—"}
        </p>
        <p>
          <span className="text-muted">{t("mergeFolded")}: </span>
          {folded.length ? folded.map((user) => personName(user)).join(", ") : "—"}
        </p>
        <Button type="button" disabled={busy} onClick={() => void loadPreview()}>{t("mergePreview")}</Button>
      </div>

      <EntityTable
        clientSort
        rows={rows}
        columns={[
          { key: "name", header: t("deskName"), sortable: true, sortValue: (row) => personName(row), render: (row) => personName(row) },
          { key: "email", header: t("deskLogin"), sortable: true, sortValue: (row) => row.email, render: (row) => row.email },
          { key: "role", header: t("deskSource"), sortable: true, sortValue: (row) => row.role, render: (row) => row.role },
          {
            key: "actions",
            header: <span className="sr-only">{t("deskRowActions")}</span>,
            render: (row) => (
              <RowActionMenu
                label={t("deskRowActions")}
                actions={[
                  { key: "keep", label: t("mergeKeep"), onSelect: () => setKept(row) },
                  { key: "fold", label: t("mergeFold"), onSelect: () => setFolded((current) => [...current, row]) },
                ]}
              />
            ),
          },
        ]}
      />

      <SidePanel
        open={open}
        title={t("mergePreview")}
        closeLabel={t("deskSave")}
        onClose={() => setOpen(false)}
        footer={
          <Button type="button" disabled={busy} onClick={() => void confirm()}>
            {t("mergeConfirm")}
          </Button>
        }
      >
        {preview ? (
          <div className="space-y-4 text-sm text-foreground">
            <p>{t("mergeConfirmAsk")}</p>
            <p>{t("mergeEmailSecondary")}</p>
            <p>{t("mergePasskeys")}</p>
            {preview.member_conflict ? (
              <div className="space-y-2">
                <p>{t("mergeConflict")}</p>
                <Label htmlFor="keep-member" required>{t("mergeProfile")}</Label>
                <select
                  id="keep-member"
                  required
                  className="h-10 w-full rounded-[var(--radius-form)] border border-border bg-surface px-2"
                  value={keepMemberId ?? ""}
                  onChange={(event) => setKeepMemberId(Number(event.target.value))}
                >
                  <option value="">—</option>
                  {profiles.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name}{member.club ? ` · ${member.club}` : ""}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <h2 className="text-section">{t("mergeGrants")}</h2>
            <ul className="space-y-1">
              {preview.folded.flatMap((row) => row.grants).map((grant) => (
                <li key={grant.id}>{grant.desk} · {grant.level}{grant.club ? ` · ${grant.club}` : ""}</li>
              ))}
            </ul>
            <h2 className="text-section">{t("mergeRecords")}</h2>
            <ul className="space-y-1">
              {preview.folded.flatMap((row) => row.records).map((record) => (
                <li key={`${record.model}-${record.field}`}>{record.model}: {record.count}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </SidePanel>
    </OpsLayout>
  );
}
