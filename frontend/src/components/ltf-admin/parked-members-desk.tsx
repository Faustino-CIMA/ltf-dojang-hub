"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Trash2 } from "lucide-react";

import { EntityTable } from "@/components/club-admin/entity-table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ActionNotices } from "@/components/ui/list-page-chrome";
import { Modal } from "@/components/ui/modal";
import { PopoverSelect } from "@/components/ui/popover-select";
import { RowActionMenu } from "@/components/ui/row-action-menu";
import { SidePanel } from "@/components/ui/side-panel";
import { getClubs, type Club } from "@/lib/ltf-admin-api";
import {
  PARK_REASON_CODES,
  bulkAssignParkedClub,
  bulkDeleteParkedMembers,
  deleteParkedMember,
  listParkedMembers,
  parkReasonText,
  resolveParkedMember,
  type ParkedMember,
} from "@/lib/parked-members";
import { formatFullName } from "@/lib/person-name";
import type { TableSort } from "@/lib/table-sort";

const LTF_STAFF = "__ltf_staff__";

export function ParkedMembersDesk() {
  const t = useTranslations("LtfAdmin");
  const common = useTranslations("Common");
  const [rows, setRows] = useState<ParkedMember[]>([]);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [reason, setReason] = useState("");
  const [sort, setSort] = useState<TableSort>({ key: "name", direction: "asc" });
  const [selected, setSelected] = useState<number[]>([]);
  const [open, setOpen] = useState<ParkedMember | null>(null);
  const [sex, setSex] = useState("");
  const [place, setPlace] = useState("");
  const [active, setActive] = useState("");
  const [bulkClub, setBulkClub] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    const [listed, clubRows] = await Promise.all([listParkedMembers(reason), getClubs()]);
    setRows(listed.results);
    setClubs(clubRows);
    setSelected((current) => current.filter((id) => listed.results.some((row) => row.id === id)));
  }, [reason]);

  useEffect(() => {
    let cancelled = false;
    load().catch((cause: unknown) => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : t("parkedLoadFailed"));
    });
    return () => {
      cancelled = true;
    };
  }, [load, t]);

  const visibleIds = rows.map((row) => row.id);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.includes(id));

  const openRow = (row: ParkedMember) => {
    setOpen(row);
    setSex(row.sex === "M" || row.sex === "F" ? row.sex : "");
    setPlace(row.club_id ? String(row.club_id) : "");
    setActive("");
    setError(null);
  };

  const reasonsFor = (row: ParkedMember) =>
    row.reasons.map((code) => parkReasonText(t, code, row)).join("; ") || "—";

  const save = async () => {
    if (!open || !sex || !place || !active) return;
    setBusy(true);
    setError(null);
    try {
      await resolveParkedMember(open.id, {
        sex,
        is_active: active === "active",
        ltf_staff: place === LTF_STAFF,
        ...(place !== LTF_STAFF ? { club_id: Number(place) } : {}),
      });
      setOpen(null);
      setNotice(t("parkedResolved"));
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("parkedSaveFailed"));
    } finally {
      setBusy(false);
    }
  };

  const removeOne = async (row: ParkedMember) => {
    setBusy(true);
    setError(null);
    try {
      await deleteParkedMember(row.id);
      if (open?.id === row.id) setOpen(null);
      setNotice(t("parkedDeleted"));
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("parkedSaveFailed"));
    } finally {
      setBusy(false);
    }
  };

  const assignMany = async () => {
    if (!bulkClub || selected.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const result = await bulkAssignParkedClub(selected, Number(bulkClub));
      setNotice(t("parkedBulkAssigned", { resolved: String(result.resolved), updated: String(result.updated) }));
      setSelected([]);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("parkedSaveFailed"));
    } finally {
      setBusy(false);
    }
  };

  const deleteMany = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await bulkDeleteParkedMembers(selected);
      setConfirmDelete(false);
      setSelected([]);
      setNotice(t("parkedBulkDeleted", { count: String(result.deleted) }));
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("parkedSaveFailed"));
    } finally {
      setBusy(false);
    }
  };

  const clubOptions = useMemo(
    () => [
      { value: LTF_STAFF, label: t("parkedLtfStaff") },
      ...clubs.map((club) => ({ value: String(club.id), label: club.name })),
    ],
    [clubs, t]
  );

  return (
    <div className="space-y-3">
      <ActionNotices error={error} success={notice} onDismiss={() => { setError(null); setNotice(null); }} />
      <p className="text-sm text-muted">{t("parkedIntro")}</p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-64">
          <Label htmlFor="parked-reason">{t("parkedReasonFilter")}</Label>
          <PopoverSelect
            value={reason}
            onValueChange={setReason}
            ariaLabel={t("parkedReasonFilter")}
            placeholder={t("parkedReasonAll")}
            options={[
              { value: "", label: t("parkedReasonAll") },
              ...PARK_REASON_CODES.map((code) => ({ value: code, label: parkReasonText(t, code, { park_club_text: "", park_detail: {} }) })),
            ]}
          />
        </div>
        <div className="w-64">
          <Label htmlFor="parked-bulk-club">{t("parkedAssignClub")}</Label>
          <PopoverSelect
            value={bulkClub}
            onValueChange={setBulkClub}
            ariaLabel={t("parkedAssignClub")}
            placeholder={t("parkedChooseClub")}
            options={clubs.map((club) => ({ value: String(club.id), label: club.name }))}
          />
        </div>
        <Button type="button" variant="outline" disabled={busy || selected.length === 0 || !bulkClub} onClick={() => void assignMany()}>
          {t("parkedBulkAssign")}
        </Button>
        <Button type="button" variant="outline" disabled={busy || selected.length === 0} onClick={() => setConfirmDelete(true)}>
          {t("parkedBulkDelete")}
        </Button>
      </div>
      {rows.length === 0 ? (
        <p className="rounded-[var(--radius-form)] border border-border bg-card px-3 py-6 text-sm text-muted">{t("parkedEmpty")}</p>
      ) : (
        <EntityTable
          rows={rows}
          sort={sort}
          onSortChange={setSort}
          clientSort
          onRowClick={openRow}
          columns={[
            {
              key: "select",
              header: (
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={(checked) => setSelected(checked === true ? visibleIds : [])}
                  aria-label={t("parkedSelectAll")}
                />
              ),
              render: (row) => (
                <Checkbox
                  checked={selected.includes(row.id)}
                  onCheckedChange={(checked) =>
                    setSelected((current) => (checked === true ? [...current, row.id] : current.filter((id) => id !== row.id)))
                  }
                  aria-label={t("parkedSelectRows", { name: formatFullName(row) })}
                />
              ),
            },
            {
              key: "name",
              header: t("parkedColumnName"),
              sortable: true,
              sortValue: (row) => formatFullName(row),
              render: (row) => formatFullName(row),
            },
            {
              key: "wt",
              header: t("parkedColumnWt"),
              sortable: true,
              sortValue: (row) => row.wt_licenseid,
              render: (row) => row.wt_licenseid || "—",
            },
            {
              key: "ltf",
              header: t("parkedColumnLtf"),
              sortable: true,
              sortValue: (row) => row.ltf_licenseid,
              render: (row) => row.ltf_licenseid || "—",
            },
            {
              key: "reason",
              header: t("parkedColumnReason"),
              sortable: true,
              sortValue: (row) => row.reasons.join(","),
              render: (row) => reasonsFor(row),
            },
            {
              key: "club",
              header: t("parkedColumnClub"),
              sortable: true,
              sortValue: (row) => row.park_club_text,
              render: (row) => row.park_club_text || "—",
            },
            {
              key: "actions",
              header: <span className="sr-only">{t("parkedRowActions", { name: "" })}</span>,
              render: (row) => (
                <RowActionMenu
                  label={t("parkedRowActions", { name: formatFullName(row) })}
                  actions={[
                    { key: "resolve", label: t("parkedResolve"), onSelect: () => openRow(row) },
                    {
                      key: "delete",
                      label: t("parkedDelete"),
                      icon: <Trash2 aria-hidden="true" />,
                      destructive: true,
                      confirmLabel: t("parkedDeleteConfirm"),
                      onSelect: () => void removeOne(row),
                    },
                  ]}
                />
              ),
            },
          ]}
        />
      )}
      <SidePanel
        open={Boolean(open)}
        title={t("parkedPanelTitle")}
        description={open ? formatFullName(open) : undefined}
        closeLabel={common("modalClose")}
        onClose={() => setOpen(null)}
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setOpen(null)}>
              {common("deleteCancelButton")}
            </Button>
            <Button type="button" variant="primary" disabled={busy || !sex || !place || !active} onClick={() => void save()}>
              {t("parkedSave")}
            </Button>
          </>
        }
      >
        {open ? (
          <div className="space-y-3">
            <p className="text-sm text-foreground">
              <span className="font-medium">{t("parkedColumnWt")}:</span> {open.wt_licenseid || "—"}
            </p>
            <p className="text-sm text-foreground">
              <span className="font-medium">{t("parkedColumnLtf")}:</span> {open.ltf_licenseid || "—"}
            </p>
            <p className="text-sm text-foreground">
              <span className="font-medium">{t("parkedFileClub")}:</span> {open.park_club_text || "—"}
            </p>
            <p className="text-sm text-foreground">
              <span className="font-medium">{t("parkedReasons")}:</span> {reasonsFor(open)}
            </p>
            <div>
              <Label required>{t("parkedAssignClub")}</Label>
              <PopoverSelect value={place} onValueChange={setPlace} ariaLabel={t("parkedAssignClub")} options={clubOptions} />
            </div>
            <div>
              <Label required>{t("parkedSex")}</Label>
              <PopoverSelect
                value={sex}
                onValueChange={setSex}
                ariaLabel={t("parkedSex")}
                options={[
                  { value: "M", label: t("parkedMale") },
                  { value: "F", label: t("parkedFemale") },
                ]}
              />
            </div>
            <div>
              <Label required>{t("parkedActive")}</Label>
              <PopoverSelect
                value={active}
                onValueChange={setActive}
                ariaLabel={t("parkedActive")}
                options={[
                  { value: "active", label: t("parkedActiveYes") },
                  { value: "inactive", label: t("parkedActiveNo") },
                ]}
              />
            </div>
          </div>
        ) : null}
      </SidePanel>
      <Modal title={t("parkedBulkDelete")} description={t("parkedBulkDeleteConfirm")} isOpen={confirmDelete} onClose={() => setConfirmDelete(false)}>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => setConfirmDelete(false)}>
            {common("deleteCancelButton")}
          </Button>
          <Button type="button" variant="destructive" disabled={busy} onClick={() => void deleteMany()}>
            {t("parkedDelete")}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
