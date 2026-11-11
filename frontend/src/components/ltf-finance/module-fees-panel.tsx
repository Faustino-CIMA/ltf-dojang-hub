"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Pencil, Power, Trash2 } from "lucide-react";

import { EntityTable } from "@/components/club-admin/entity-table";
import { ModulePriceText } from "@/components/finance/module-price-text";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { InfoHint } from "@/components/ui/info-hint";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormPanel } from "@/components/ui/list-page-chrome";
import { PopoverSelect } from "@/components/ui/popover-select";
import { RowActionMenu } from "@/components/ui/row-action-menu";
import { SidePanel } from "@/components/ui/side-panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDisplayDate } from "@/lib/date-display";
import type { ClubFeePrice, ClubFeeType, ModuleFeePricingType } from "@/lib/ltf-finance-api";
import { flatMaximumCanApply, flatMinimumCanApply, maximumIsBelowMinimum, visibleMaximumAmount, visibleMinimumAmount } from "@/lib/module-fee-display";
import type { TableSort } from "@/lib/table-sort";

export const BILLABLE_MODULE_IDS = ["club_management", "competition", "event_calendar"] as const;

type ModuleFeeDraft = {
  moduleId: string;
  pricingType: ModuleFeePricingType;
  amount: string;
  minimum: string;
  maximum: string;
  effectiveFrom: string;
  isActive: boolean;
};

const emptyDraft = (): ModuleFeeDraft => ({
  moduleId: "",
  pricingType: "flat",
  amount: "",
  minimum: "",
  maximum: "",
  effectiveFrom: "",
  isActive: true,
});

export function moduleFeeLabelKey(
  moduleId: string | null | undefined,
): "moduleClubManagement" | "moduleCompetition" | "moduleEventCalendar" | null {
  if (moduleId === "club_management") return "moduleClubManagement";
  if (moduleId === "competition") return "moduleCompetition";
  if (moduleId === "event_calendar") return "moduleEventCalendar";
  return null;
}

export function ModuleFeesPanel({
  fees,
  prices,
  onCreate,
  onSave,
  onRemove,
  onNotice,
}: {
  fees: ClubFeeType[];
  prices: ClubFeePrice[];
  onCreate: (draft: ModuleFeeDraft) => Promise<void>;
  onSave: (fee: ClubFeeType, draft: ModuleFeeDraft) => Promise<void>;
  onRemove: (fee: ClubFeeType) => Promise<"deleted" | "switched_off">;
  onNotice: (kind: "error" | "success", message: string) => void;
}) {
  const t = useTranslations("LtfFinance");
  const common = useTranslations("Common");
  const [sort, setSort] = useState<TableSort | null>({ key: "module", direction: "asc" });
  const [boundsError, setBoundsError] = useState<string | null>(null);
  const [editor, setEditor] = useState<ClubFeeType | "new" | null>(null);
  const [confirmFee, setConfirmFee] = useState<ClubFeeType | null>(null);
  const [draft, setDraft] = useState<ModuleFeeDraft>(emptyDraft());
  const [busy, setBusy] = useState(false);

  const moduleName = (moduleId: string | null | undefined, fallback: string) => {
    const key = moduleFeeLabelKey(moduleId);
    return key ? t(key) : fallback;
  };

  const pricingLabel = (pricing: string | null | undefined) =>
    pricing === "per_active_member" ? t("moduleFeePricingPerMember") : t("moduleFeePricingFlat");

  const pricesFor = (feeId: number) =>
    prices
      .filter((row) => row.fee_type === feeId)
      .sort((left, right) => {
        const byDate = right.effective_from.localeCompare(left.effective_from);
        if (byDate !== 0) return byDate;
        return right.created_at.localeCompare(left.created_at);
      });

  const takenModules = useMemo(() => new Set(fees.map((fee) => fee.module_id).filter(Boolean)), [fees]);

  const openCreate = () => {
    setBoundsError(null);
    setDraft(emptyDraft());
    setEditor("new");
  };

  const openEdit = (fee: ClubFeeType) => {
    setBoundsError(null);
    const current = pricesFor(fee.id)[0];
    setDraft({
      moduleId: fee.module_id ?? "",
      pricingType: current?.pricing_type ?? fee.current_pricing_type ?? "flat",
      amount: "",
      minimum: current?.minimum_amount ?? fee.current_minimum_amount ?? "",
      maximum: current?.maximum_amount ?? fee.current_maximum_amount ?? "",
      effectiveFrom: "",
      isActive: fee.is_active,
    });
    setEditor(fee);
  };

  const save = async () => {
    if (!draft.amount.trim()) {
      onNotice("error", t("moduleFeeNeedAmount"));
      return;
    }
    if (editor === "new" && !draft.moduleId) {
      onNotice("error", t("moduleFeeNeedModule"));
      return;
    }
    if (maximumIsBelowMinimum(draft.minimum, draft.maximum)) {
      setBoundsError(t("moduleFeeMaximumBelowMinimum"));
      return;
    }
    setBoundsError(null);
    setBusy(true);
    try {
      if (editor === "new") {
        await onCreate(draft);
        onNotice("success", t("moduleFeeCreated"));
      } else if (editor) {
        await onSave(editor, draft);
        onNotice("success", t("moduleFeePriceSaved"));
      }
      setEditor(null);
    } catch (error) {
      onNotice("error", error instanceof Error ? error.message : t("moduleFeeSaveError"));
    } finally {
      setBusy(false);
    }
  };

  const confirmRemove = async () => {
    if (!confirmFee) return;
    setBusy(true);
    try {
      const result = await onRemove(confirmFee);
      onNotice("success", result === "switched_off" ? t("moduleFeeSwitchedOff") : t("moduleFeeDeleted"));
      setConfirmFee(null);
    } catch (error) {
      onNotice("error", error instanceof Error ? error.message : t("moduleFeeDeleteError"));
    } finally {
      setBusy(false);
    }
  };

  const editing = editor && editor !== "new" ? editor : null;
  const history = editing ? pricesFor(editing.id) : [];

  return (
    <>
      <FormPanel>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-section text-foreground">{t("moduleFeesTitle")}</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted">{t("moduleFeesSubtitle")}</p>
        </div>
        <Button type="button" variant="primary" onClick={openCreate}>
          {t("moduleFeeAdd")}
        </Button>
      </div>

      {fees.length === 0 ? (
        <div className="mt-6">
          <p className="text-sm font-medium text-foreground">{t("moduleFeesEmptyTitle")}</p>
          <p className="mt-1 text-sm text-muted">{t("moduleFeesEmptySubtitle")}</p>
        </div>
      ) : (
        <div className="mt-6">
        <EntityTable
          clientSort
          sort={sort}
          onSortChange={setSort}
          rows={fees}
          columns={[
            {
              key: "module",
              header: t("moduleFeeModuleLabel"),
              sortable: true,
              sortValue: (fee) => moduleName(fee.module_id, fee.name),
              render: (fee) => moduleName(fee.module_id, fee.name),
            },
            {
              key: "pricing",
              header: t("moduleFeePricingLabel"),
              sortable: true,
              sortValue: (fee) => fee.current_pricing_type ?? "",
              render: (fee) => (fee.current_pricing_type ? pricingLabel(fee.current_pricing_type) : t("moduleFeeNoAmount")),
            },
            {
              key: "amount",
              header: t("moduleFeeAmountLabel"),
              sortable: true,
              sortValue: (fee) => Number(fee.current_amount ?? 0),
              render: (fee) =>
                fee.current_amount ? (
                  <ModulePriceText
                    amount={fee.current_amount}
                    currency={fee.current_currency}
                    pricingType={fee.current_pricing_type}
                  />
                ) : (
                  t("moduleFeeNoAmount")
                ),
            },
            {
              key: "minimum",
              header: t("moduleFeeMinimumLabel"),
              sortable: true,
              sortValue: (fee) => Number(fee.current_minimum_amount ?? 0),
              render: (fee) =>
                visibleMinimumAmount(fee.current_pricing_type, fee.current_amount, fee.current_minimum_amount) ??
                t("moduleFeeNoMinimum"),
            },
            {
              key: "maximum",
              header: t("moduleFeeMaximumLabel"),
              sortable: true,
              sortValue: (fee) => Number(fee.current_maximum_amount ?? 0),
              render: (fee) => {
                const maximum = visibleMaximumAmount(
                  fee.current_pricing_type,
                  fee.current_amount,
                  fee.current_maximum_amount,
                );
                return maximum
                  ? t("moduleFeeMaximumShown", {
                      amount: maximum,
                      currency: fee.current_currency ?? "EUR",
                    })
                  : t("moduleFeeNoMaximum");
              },
            },
            {
              key: "from",
              header: t("moduleFeeValidFromLabel"),
              sortable: true,
              sortValue: (fee) => fee.current_effective_from ?? "",
              render: (fee) => (fee.current_effective_from ? formatDisplayDate(fee.current_effective_from) : "—"),
            },
            {
              key: "status",
              header: t("moduleFeeStatus"),
              sortable: true,
              sortValue: (fee) => (fee.is_active ? 1 : 0),
              render: (fee) => (
                <StatusBadge
                  label={fee.is_active ? t("moduleFeeActive") : t("moduleFeeInactive")}
                  tone={fee.is_active ? "success" : "neutral"}
                />
              ),
            },
            {
              key: "actions",
              header: <span className="sr-only">{t("moduleFeeRowActions")}</span>,
              render: (fee) => (
                <RowActionMenu
                  label={t("moduleFeeRowActions")}
                  actions={[
                    {
                      key: "edit",
                      label: t("moduleFeeEdit"),
                      icon: <Pencil aria-hidden="true" />,
                      onSelect: () => openEdit(fee),
                    },
                    fee.has_invoices
                      ? {
                          key: "switch-off",
                          label: t("moduleFeeSwitchOff"),
                          icon: <Power aria-hidden="true" />,
                          disabled: !fee.is_active,
                          onSelect: () => setConfirmFee(fee),
                        }
                      : {
                          key: "delete",
                          label: t("moduleFeeDelete"),
                          icon: <Trash2 aria-hidden="true" />,
                          destructive: true,
                          onSelect: () => setConfirmFee(fee),
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

      <SidePanel
        open={editor !== null}
        title={editor === "new" ? t("moduleFeeAddTitle") : t("moduleFeeEditTitle")}
        description={editor === "new" ? t("moduleFeeAddHint") : t("moduleFeeEditHint")}
        closeLabel={t("moduleFeeClose")}
        onClose={() => setEditor(null)}
        footer={
          <Button type="button" onClick={() => void save()} disabled={busy}>
            {busy ? t("moduleFeeSaving") : t("moduleFeeSave")}
          </Button>
        }
      >
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>{t("moduleFeeModuleLabel")}</Label>
            {editor === "new" ? (
              <PopoverSelect
                ariaLabel={t("moduleFeeModuleLabel")}
                placeholder={t("moduleFeeModuleLabel")}
                value={draft.moduleId}
                onValueChange={(moduleId) => setDraft((current) => ({ ...current, moduleId }))}
                options={BILLABLE_MODULE_IDS.filter((moduleId) => !takenModules.has(moduleId)).map((moduleId) => ({
                  value: moduleId,
                  label: moduleName(moduleId, moduleId),
                }))}
              />
            ) : (
              <p className="text-sm text-foreground">{moduleName(editing?.module_id, editing?.name ?? "")}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label>{t("moduleFeePricingLabel")}</Label>
            <PopoverSelect
              ariaLabel={t("moduleFeePricingLabel")}
              value={draft.pricingType}
              onValueChange={(value) =>
                setDraft((current) => ({ ...current, pricingType: value as ModuleFeePricingType }))
              }
              options={[
                { value: "flat", label: t("moduleFeePricingFlat") },
                { value: "per_active_member", label: t("moduleFeePricingPerMember") },
              ]}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="module-fee-amount">{t("moduleFeeAmountLabel")}</Label>
            <Input
              id="module-fee-amount"
              value={draft.amount}
              inputMode="decimal"
              placeholder="0.00"
              onChange={(event) => setDraft((current) => ({ ...current, amount: event.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="module-fee-minimum">{t("moduleFeeMinimumLabel")}</Label>
            <Input
              id="module-fee-minimum"
              value={draft.minimum}
              inputMode="decimal"
              placeholder={t("moduleFeeNoMinimum")}
              onChange={(event) => setDraft((current) => ({ ...current, minimum: event.target.value }))}
            />
            <p className="text-xs text-muted">{t("moduleFeeMinimumHint")}</p>
            {draft.pricingType === "flat" &&
            draft.minimum.trim() &&
            !flatMinimumCanApply(
              "flat",
              draft.amount.trim() || editing?.current_amount || "",
              draft.minimum,
            ) ? (
              <p className="text-xs text-muted">{t("moduleFeeMinimumNeverApplies")}</p>
            ) : null}
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-1">
              <Label htmlFor="module-fee-maximum">{t("moduleFeeMaximumLabel")}</Label>
              <InfoHint size="compact" ariaLabel={common("aboutTitle", { title: t("moduleFeeMaximumLabel") })}>
                {t("moduleFeeMaximumHint")}
              </InfoHint>
            </div>
            <Input
              id="module-fee-maximum"
              value={draft.maximum}
              inputMode="decimal"
              placeholder={t("moduleFeeNoMaximum")}
              aria-invalid={boundsError ? true : undefined}
              onChange={(event) => {
                setBoundsError(null);
                setDraft((current) => ({ ...current, maximum: event.target.value }));
              }}
            />
            {boundsError ? <p className="text-sm text-destructive">{boundsError}</p> : null}
            {draft.pricingType === "flat" &&
            draft.maximum.trim() &&
            !flatMaximumCanApply(
              "flat",
              draft.amount.trim() || editing?.current_amount || "",
              draft.maximum,
            ) ? (
              <p className="text-xs text-muted">{t("moduleFeeMaximumNeverApplies")}</p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="module-fee-from">{t("moduleFeeValidFromLabel")}</Label>
            <Input
              id="module-fee-from"
              type="date"
              value={draft.effectiveFrom}
              onChange={(event) => setDraft((current) => ({ ...current, effectiveFrom: event.target.value }))}
            />
          </div>
          {editing ? (
            <label className="flex items-center gap-2 text-sm text-foreground">
              <Checkbox
                checked={draft.isActive}
                onCheckedChange={(value) => setDraft((current) => ({ ...current, isActive: Boolean(value) }))}
              />
              {t("moduleFeeActiveLabel")}
            </label>
          ) : null}
          {editing ? (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-foreground">{t("moduleFeeHistoryTitle")}</h3>
              {history.length === 0 ? (
                <p className="text-sm text-muted">{t("moduleFeeNoAmount")}</p>
              ) : (
                <EntityTable
                  rows={history}
                  columns={[
                    {
                      key: "amount",
                      header: t("moduleFeeAmountLabel"),
                      render: (row: ClubFeePrice) => (
                        <ModulePriceText
                          amount={row.amount}
                          currency={row.currency}
                          pricingType={row.pricing_type}
                        />
                      ),
                    },
                    {
                      key: "pricing",
                      header: t("moduleFeePricingLabel"),
                      render: (row: ClubFeePrice) => pricingLabel(row.pricing_type),
                    },
                    {
                      key: "minimum",
                      header: t("moduleFeeMinimumLabel"),
                      render: (row: ClubFeePrice) =>
                        visibleMinimumAmount(row.pricing_type, row.amount, row.minimum_amount) ??
                        t("moduleFeeNoMinimum"),
                    },
                    {
                      key: "maximum",
                      header: t("moduleFeeMaximumLabel"),
                      render: (row: ClubFeePrice) => {
                        const maximum = visibleMaximumAmount(row.pricing_type, row.amount, row.maximum_amount);
                        return maximum
                          ? t("moduleFeeMaximumShown", { amount: maximum, currency: row.currency })
                          : t("moduleFeeNoMaximum");
                      },
                    },
                    {
                      key: "from",
                      header: t("moduleFeeValidFromLabel"),
                      render: (row: ClubFeePrice) => formatDisplayDate(row.effective_from),
                    },
                  ]}
                />
              )}
            </div>
          ) : null}
        </div>
      </SidePanel>

      <SidePanel
        open={confirmFee !== null}
        title={confirmFee?.has_invoices ? t("moduleFeeSwitchOffTitle") : t("moduleFeeDeleteTitle")}
        description={confirmFee?.has_invoices ? t("moduleFeeSwitchOffDescription") : t("moduleFeeDeleteDescription")}
        closeLabel={t("moduleFeeClose")}
        onClose={() => setConfirmFee(null)}
        footer={
          <Button type="button" variant="destructive" onClick={() => void confirmRemove()} disabled={busy}>
            {confirmFee?.has_invoices ? t("moduleFeeConfirmSwitchOff") : t("moduleFeeConfirmDelete")}
          </Button>
        }
      >
        <p className="text-sm text-foreground">
          {confirmFee ? moduleName(confirmFee.module_id, confirmFee.name) : ""}
        </p>
      </SidePanel>
    </>
  );
}
