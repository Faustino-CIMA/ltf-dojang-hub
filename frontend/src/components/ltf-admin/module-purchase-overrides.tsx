"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Pencil, Power, PowerOff, RotateCcw, ShieldOff, Ban } from "lucide-react";

import { EntityTable } from "@/components/club-admin/entity-table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormPanel } from "@/components/ui/list-page-chrome";
import { PopoverSelect } from "@/components/ui/popover-select";
import { RowActionMenu } from "@/components/ui/row-action-menu";
import { SidePanel } from "@/components/ui/side-panel";
import { formatDisplayDate, formatDisplayDateTime } from "@/lib/date-display";
import type { ModuleOverrideAction, ModulePurchaseOverrideRow, ModulePurchaseRow } from "@/lib/ltf-admin-api";
import type { TableSort } from "@/lib/table-sort";

function endText(purchase: ModulePurchaseRow, noEnd: string) {
  return purchase.ends_at ? formatDisplayDate(purchase.ends_at) : noEnd;
}

export function ModulePurchaseOverrides({
  clubs,
  clubId,
  purchases,
  audits,
  onSelectClub,
  onOverride,
  onNotice,
}: {
  clubs: { id: number; name: string }[];
  clubId: string;
  purchases: ModulePurchaseRow[];
  audits: ModulePurchaseOverrideRow[];
  onSelectClub: (clubId: string) => void;
  onOverride: (id: number, action: ModuleOverrideAction, extra?: { ends_at?: string; reason?: string }) => Promise<void>;
  onNotice: (kind: "error" | "success", message: string) => void;
}) {
  const t = useTranslations("LtfAdmin");
  const [sort, setSort] = useState<TableSort | null>({ key: "name", direction: "asc" });
  const [auditSort, setAuditSort] = useState<TableSort | null>({ key: "when", direction: "desc" });
  const [editing, setEditing] = useState<ModulePurchaseRow | null>(null);
  const [confirming, setConfirming] = useState<{ purchase: ModulePurchaseRow; action: ModuleOverrideAction } | null>(
    null,
  );
  const [endsAt, setEndsAt] = useState("");
  const [keepOpen, setKeepOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const openEdit = (purchase: ModulePurchaseRow) => {
    setEditing(purchase);
    setEndsAt(purchase.ends_at ?? "");
    setKeepOpen(purchase.ends_at === null);
    setReason("");
  };

  const saveEdit = async () => {
    if (!editing) return;
    if (!keepOpen && !endsAt) {
      onNotice("error", t("modulePurchaseNeedDate"));
      return;
    }
    setBusy(true);
    try {
      await onOverride(
        editing.id,
        keepOpen ? "keep_open" : "set_end",
        keepOpen ? { reason } : { ends_at: endsAt, reason },
      );
      onNotice("success", t("modulePurchaseSaved"));
      setEditing(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      onNotice("error", message.includes("own_club_override") ? t("ownClubOverride") : message || t("modulePurchaseError"));
    } finally {
      setBusy(false);
    }
  };

  const saveConfirm = async () => {
    if (!confirming) return;
    setBusy(true);
    try {
      await onOverride(confirming.purchase.id, confirming.action, { reason });
      onNotice("success", t("modulePurchaseSaved"));
      setConfirming(null);
      setReason("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      onNotice("error", message.includes("own_club_override") ? t("ownClubOverride") : message || t("modulePurchaseError"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <FormPanel>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-section text-foreground">{t("modulePurchaseTitle")}</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted">{t("modulePurchaseSubtitle")}</p>
          </div>
        </div>
        <div className="mt-6 max-w-md space-y-2">
          <Label required>{t("modulePurchaseClub")}</Label>
          <PopoverSelect
            ariaLabel={t("modulePurchaseClub")}
            placeholder={t("modulePurchaseClub")}
            value={clubId}
            onValueChange={onSelectClub}
            options={clubs.map((club) => ({ value: String(club.id), label: club.name }))}
          />
        </div>
        {!clubId ? (
          <p className="mt-6 text-sm text-muted">{t("modulePurchaseEmpty")}</p>
        ) : purchases.length === 0 ? (
          <p className="mt-6 text-sm text-muted">{t("modulePurchaseNone")}</p>
        ) : (
          <div className="mt-6">
            <EntityTable
              clientSort
              sort={sort}
              onSortChange={setSort}
              rows={purchases}
              columns={[
                {
                  key: "name",
                  header: t("modulePurchaseName"),
                  sortable: true,
                  sortValue: (row) => row.description,
                  render: (row) => row.description,
                },
                {
                  key: "modules",
                  header: t("modulePurchaseModules"),
                  sortable: true,
                  sortValue: (row) => row.module_ids.join(","),
                  render: (row) => row.module_ids.join(", "),
                },
                {
                  key: "ends",
                  header: t("modulePurchaseEnds"),
                  sortable: true,
                  sortValue: (row) => row.ends_at ?? "",
                  render: (row) => endText(row, t("modulePurchaseNoEnd")),
                },
                {
                  key: "status",
                  header: t("modulePurchaseStatus"),
                  sortable: true,
                  sortValue: (row) => row.status,
                  render: (row) => (row.switched_off ? t("modulePurchaseSwitchOff") : row.status),
                },
                {
                  key: "hold",
                  header: t("modulePurchaseHold"),
                  sortable: true,
                  sortValue: (row) => (row.automation_hold ? 1 : 0),
                  render: (row) => (row.automation_hold ? t("modulePurchaseHeld") : t("modulePurchaseOpen")),
                },
                {
                  key: "actions",
                  header: <span className="sr-only">{t("modulePurchaseRowActions")}</span>,
                  render: (row) => (
                    <RowActionMenu
                      label={t("modulePurchaseRowActions")}
                      actions={[
                        {
                          key: "edit",
                          label: t("modulePurchaseEdit"),
                          icon: <Pencil aria-hidden="true" />,
                          onSelect: () => openEdit(row),
                        },
                        {
                          key: "switch-on",
                          label: t("modulePurchaseSwitchOn"),
                          icon: <Power aria-hidden="true" />,
                          onSelect: () => {
                            setReason("");
                            setConfirming({ purchase: row, action: "switch_on" });
                          },
                        },
                        {
                          key: "switch-off",
                          label: t("modulePurchaseSwitchOff"),
                          icon: <PowerOff aria-hidden="true" />,
                          onSelect: () => {
                            setReason("");
                            setConfirming({ purchase: row, action: "switch_off" });
                          },
                        },
                        {
                          key: "waive",
                          label: t("modulePurchaseWaive"),
                          icon: <ShieldOff aria-hidden="true" />,
                          onSelect: () => {
                            setReason("");
                            setConfirming({ purchase: row, action: "waive" });
                          },
                        },
                        {
                          key: "clear",
                          label: t("modulePurchaseClearHold"),
                          icon: <RotateCcw aria-hidden="true" />,
                          disabled: !row.automation_hold,
                          onSelect: () => {
                            setReason("");
                            setConfirming({ purchase: row, action: "clear_hold" });
                          },
                        },
                        {
                          key: "cancel",
                          label: t("modulePurchaseCancel"),
                          icon: <Ban aria-hidden="true" />,
                          destructive: true,
                          onSelect: () => {
                            setReason("");
                            setConfirming({ purchase: row, action: "cancel" });
                          },
                        },
                      ]}
                    />
                  ),
                },
              ]}
            />
          </div>
        )}
      </FormPanel>

      <FormPanel>
        <h2 className="text-section text-foreground">{t("modulePurchaseAuditTitle")}</h2>
        {!clubId || audits.length === 0 ? (
          <p className="mt-3 text-sm text-muted">{t("modulePurchaseAuditEmpty")}</p>
        ) : (
          <div className="mt-6">
            <EntityTable
              clientSort
              sort={auditSort}
              onSortChange={setAuditSort}
              rows={audits}
              columns={[
                {
                  key: "when",
                  header: t("modulePurchaseAuditWhen"),
                  sortable: true,
                  sortValue: (row) => row.created_at,
                  render: (row) => formatDisplayDateTime(row.created_at),
                },
                {
                  key: "who",
                  header: t("modulePurchaseAuditWho"),
                  sortable: true,
                  sortValue: (row) => row.actor_name,
                  render: (row) => row.actor_name,
                },
                {
                  key: "action",
                  header: t("modulePurchaseAuditAction"),
                  sortable: true,
                  sortValue: (row) => row.action,
                  render: (row) => row.action,
                },
                {
                  key: "before",
                  header: t("modulePurchaseAuditBefore"),
                  render: (row) => row.previous_ends_at ?? t("modulePurchaseNoEnd"),
                },
                {
                  key: "after",
                  header: t("modulePurchaseAuditAfter"),
                  render: (row) => row.new_ends_at ?? t("modulePurchaseNoEnd"),
                },
                {
                  key: "reason",
                  header: t("modulePurchaseAuditReason"),
                  render: (row) => row.reason || "—",
                },
              ]}
            />
          </div>
        )}
      </FormPanel>

      <SidePanel
        open={editing !== null}
        title={t("modulePurchaseEditTitle")}
        description={editing?.description}
        closeLabel={t("modulePurchaseClose")}
        onClose={() => setEditing(null)}
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setEditing(null)} disabled={busy}>
              {t("modulePurchaseClose")}
            </Button>
            <Button type="button" onClick={() => void saveEdit()} disabled={busy}>
              {busy ? t("modulePurchaseSaving") : t("modulePurchaseSave")}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="module-purchase-end" required={!keepOpen}>
              {t("modulePurchaseEndLabel")}
            </Label>
            <Input
              id="module-purchase-end"
              type="date"
              required={!keepOpen}
              disabled={keepOpen}
              value={endsAt}
              onChange={(event) => setEndsAt(event.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="module-purchase-open"
              checked={keepOpen}
              onCheckedChange={(value) => setKeepOpen(value === true)}
            />
            <Label htmlFor="module-purchase-open">{t("modulePurchaseKeepOpen")}</Label>
          </div>
          <div className="space-y-2">
            <Label htmlFor="module-purchase-reason">{t("modulePurchaseReason")}</Label>
            <Input
              id="module-purchase-reason"
              value={reason}
              placeholder={t("modulePurchaseReasonHint")}
              onChange={(event) => setReason(event.target.value)}
            />
          </div>
        </div>
      </SidePanel>

      <SidePanel
        open={confirming !== null}
        title={t("modulePurchaseConfirmTitle")}
        description={confirming?.purchase.description}
        closeLabel={t("modulePurchaseClose")}
        onClose={() => setConfirming(null)}
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setConfirming(null)} disabled={busy}>
              {t("modulePurchaseClose")}
            </Button>
            <Button
              type="button"
              variant={confirming?.action === "cancel" ? "destructive" : "primary"}
              onClick={() => void saveConfirm()}
              disabled={busy}
            >
              {t("modulePurchaseConfirm")}
            </Button>
          </>
        }
      >
        <div className="space-y-2">
          <Label htmlFor="module-purchase-confirm-reason">{t("modulePurchaseReason")}</Label>
          <Input
            id="module-purchase-confirm-reason"
            value={reason}
            placeholder={t("modulePurchaseReasonHint")}
            onChange={(event) => setReason(event.target.value)}
          />
        </div>
      </SidePanel>
    </div>
  );
}
