"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Pencil, Power, Trash2 } from "lucide-react";

import { EmptyState } from "@/components/club-admin/empty-state";
import { EntityTable } from "@/components/club-admin/entity-table";
import { BILLABLE_MODULE_IDS, moduleFeeLabelKey } from "@/components/ltf-finance/module-fees-panel";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RowActionMenu } from "@/components/ui/row-action-menu";
import { SidePanel } from "@/components/ui/side-panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDisplayDate } from "@/lib/date-display";
import type { ClubFeeType, ModuleBundle, ModuleSubscriptionSettings } from "@/lib/ltf-finance-api";
import type { TableSort } from "@/lib/table-sort";

export type ModuleBundleDraft = {
  name: string;
  description: string;
  moduleIds: string[];
  amount: string;
  effectiveFrom: string;
  isActive: boolean;
};

export type ModuleSubscriptionDraft = {
  subscription_months: string;
  renewal_notice_days: string;
  payment_window_days: string;
  payment_warning_days: string;
};

const emptyDraft = (): ModuleBundleDraft => ({
  name: "",
  description: "",
  moduleIds: [],
  amount: "",
  effectiveFrom: "",
  isActive: true,
});

function draftFromBundle(bundle: ModuleBundle): ModuleBundleDraft {
  return {
    name: bundle.name,
    description: bundle.description ?? "",
    moduleIds: [...bundle.module_ids],
    amount: bundle.current_amount ?? "",
    effectiveFrom: "",
    isActive: bundle.is_active,
  };
}

function settingsDraft(settings: ModuleSubscriptionSettings): ModuleSubscriptionDraft {
  return {
    subscription_months: String(settings.subscription_months),
    renewal_notice_days: String(settings.renewal_notice_days),
    payment_window_days: String(settings.payment_window_days),
    payment_warning_days: String(settings.payment_warning_days),
  };
}

type ComparisonLine = {
  moduleId: string;
  name: string;
  flatAmount: number | null;
  perMember: boolean;
  missing: boolean;
};

export function ModuleBundlesPanel({
  bundles,
  moduleFees,
  settings,
  onCreate,
  onUpdate,
  onRemove,
  onSaveSettings,
  onNotice,
  showSettingsButton = true,
  settingsOpen: settingsOpenProp,
  onSettingsOpenChange,
}: {
  bundles: ModuleBundle[];
  moduleFees: ClubFeeType[];
  settings: ModuleSubscriptionSettings | null;
  onCreate: (draft: ModuleBundleDraft) => Promise<void>;
  onUpdate: (bundle: ModuleBundle, draft: ModuleBundleDraft) => Promise<void>;
  onRemove: (bundle: ModuleBundle) => Promise<"deleted" | "switched_off">;
  onSaveSettings: (draft: ModuleSubscriptionDraft) => Promise<void>;
  onNotice: (kind: "error" | "success", message: string) => void;
  showSettingsButton?: boolean;
  settingsOpen?: boolean;
  onSettingsOpenChange?: (open: boolean) => void;
}) {
  const t = useTranslations("LtfFinance");
  const [sort, setSort] = useState<TableSort | null>({ key: "name", direction: "asc" });
  const [editor, setEditor] = useState<ModuleBundle | "new" | null>(null);
  const [draft, setDraft] = useState<ModuleBundleDraft>(emptyDraft());
  const [confirmBundle, setConfirmBundle] = useState<ModuleBundle | null>(null);
  const [uncontrolledSettingsOpen, setUncontrolledSettingsOpen] = useState(false);
  const settingsOpen = settingsOpenProp ?? uncontrolledSettingsOpen;
  const setSettingsOpen = onSettingsOpenChange ?? setUncontrolledSettingsOpen;
  const [settingsForm, setSettingsForm] = useState<ModuleSubscriptionDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [moduleQuery, setModuleQuery] = useState("");

  const moduleName = (moduleId: string) => {
    const key = moduleFeeLabelKey(moduleId);
    return key ? t(key) : moduleId;
  };

  const feeFor = (moduleId: string) => moduleFees.find((fee) => fee.module_id === moduleId && fee.is_active);

  const comparisonLines: ComparisonLine[] = draft.moduleIds.map((moduleId) => {
    const fee = feeFor(moduleId);
    const perMember = fee?.current_pricing_type === "per_active_member";
    const amount = fee?.current_amount ? Number(fee.current_amount) : null;
    const priced = amount !== null && Number.isFinite(amount);
    return {
      moduleId,
      name: moduleName(moduleId),
      flatAmount: !perMember && priced ? amount : null,
      perMember,
      missing: !fee || !priced,
    };
  });
  const comparisonComparable = comparisonLines.length > 0 && comparisonLines.every((line) => line.flatAmount !== null);
  const bundleAmount = Number(draft.amount);
  const comparisonDifference =
    comparisonComparable && Number.isFinite(bundleAmount)
      ? bundleAmount - comparisonLines.reduce((total, line) => total + (line.flatAmount ?? 0), 0)
      : null;

  const visibleModules = BILLABLE_MODULE_IDS.filter((moduleId) =>
    moduleName(moduleId).toLowerCase().includes(moduleQuery.trim().toLowerCase()),
  );

  const openCreate = () => {
    setDraft(emptyDraft());
    setModuleQuery("");
    setEditor("new");
  };

  const openEdit = (bundle: ModuleBundle) => {
    setDraft(draftFromBundle(bundle));
    setModuleQuery("");
    setEditor(bundle);
  };

  const setModule = (moduleId: string, selected: boolean) => {
    setDraft((previous) => ({
      ...previous,
      moduleIds: selected
        ? previous.moduleIds.includes(moduleId)
          ? previous.moduleIds
          : [...previous.moduleIds, moduleId]
        : previous.moduleIds.filter((item) => item !== moduleId),
    }));
  };

  const save = async () => {
    if (!draft.name.trim()) {
      onNotice("error", t("moduleBundleNeedName"));
      return;
    }
    if (draft.moduleIds.length < 2) {
      onNotice("error", t("moduleBundleNeedModules"));
      return;
    }
    if (!draft.amount.trim()) {
      onNotice("error", t("moduleBundleNeedAmount"));
      return;
    }
    setBusy(true);
    try {
      if (editor === "new") {
        await onCreate(draft);
        onNotice("success", t("moduleBundleCreated"));
      } else if (editor) {
        await onUpdate(editor, draft);
        onNotice("success", t("moduleBundleUpdated"));
      }
      setEditor(null);
    } catch (error) {
      onNotice("error", error instanceof Error ? error.message : t("moduleBundleSaveError"));
    } finally {
      setBusy(false);
    }
  };

  const confirmRemove = async () => {
    if (!confirmBundle) return;
    setBusy(true);
    try {
      const result = await onRemove(confirmBundle);
      onNotice("success", result === "switched_off" ? t("moduleBundleSwitchedOff") : t("moduleBundleDeleted"));
      setConfirmBundle(null);
    } catch (error) {
      onNotice("error", error instanceof Error ? error.message : t("moduleBundleSaveError"));
    } finally {
      setBusy(false);
    }
  };

  const saveSettings = async () => {
    if (!displayedSettings) return;
    setBusy(true);
    try {
      await onSaveSettings(displayedSettings);
      onNotice("success", t("moduleBundleSettingsSaved"));
      setSettingsOpen(false);
    } catch (error) {
      onNotice("error", error instanceof Error ? error.message : t("moduleBundleSettingsError"));
    } finally {
      setBusy(false);
    }
  };

  const editing = editor && editor !== "new" ? editor : null;
  const displayedSettings = settingsForm ?? (settings ? settingsDraft(settings) : null);
  const openSettings = () => {
    setSettingsForm(settings ? settingsDraft(settings) : null);
    setSettingsOpen(true);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-section text-foreground">{t("moduleBundleTitle")}</h2>
          <p className="mt-1 max-w-3xl text-sm text-muted">{t("moduleBundleSubtitle")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {showSettingsButton ? (
            <Button
              type="button"
              variant="outline"
              onClick={openSettings}
              disabled={!settings}
            >
              {t("moduleBundleSettings")}
            </Button>
          ) : null}
          <Button type="button" onClick={openCreate}>
            {t("moduleBundleAdd")}
          </Button>
        </div>
      </div>

      {bundles.length === 0 ? (
        <EmptyState title={t("moduleBundleEmptyTitle")} description={t("moduleBundleEmptySubtitle")} />
      ) : (
        <EntityTable
          clientSort
          sort={sort}
          onSortChange={setSort}
          rows={bundles}
          columns={[
            {
              key: "name",
              header: t("moduleBundleNameLabel"),
              sortable: true,
              sortValue: (bundle) => bundle.name,
              render: (bundle) => bundle.name,
            },
            {
              key: "modules",
              header: t("moduleBundleModulesLabel"),
              sortable: true,
              sortValue: (bundle) => bundle.module_ids.length * 1000 + bundle.name.charCodeAt(0),
              render: (bundle) => bundle.module_ids.map((moduleId) => moduleName(moduleId)).join(", "),
            },
            {
              key: "price",
              header: t("moduleBundlePriceLabel"),
              sortable: true,
              sortValue: (bundle) => Number(bundle.current_amount ?? 0),
              render: (bundle) =>
                bundle.current_amount
                  ? `${bundle.current_amount} ${bundle.current_currency ?? "EUR"}`
                  : t("moduleBundleNoPrice"),
            },
            {
              key: "from",
              header: t("moduleBundleValidFromLabel"),
              sortable: true,
              sortValue: (bundle) => bundle.current_effective_from ?? "",
              render: (bundle) =>
                bundle.current_effective_from ? formatDisplayDate(bundle.current_effective_from) : "—",
            },
            {
              key: "status",
              header: t("moduleBundleStatus"),
              sortable: true,
              sortValue: (bundle) => (bundle.is_active ? 1 : 0),
              render: (bundle) => (
                <StatusBadge
                  label={bundle.is_active ? t("moduleBundleActive") : t("moduleBundleInactive")}
                  tone={bundle.is_active ? "success" : "neutral"}
                />
              ),
            },
            {
              key: "actions",
              header: <span className="sr-only">{t("moduleBundleRowActions")}</span>,
              render: (bundle) => (
                <div className="flex items-center justify-end gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    aria-label={t("moduleBundleEditAction")}
                    onClick={() => openEdit(bundle)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <RowActionMenu
                    label={t("moduleBundleRowActions")}
                    actions={[
                      bundle.has_invoices
                        ? {
                            key: "switch-off",
                            label: t("moduleBundleSwitchOff"),
                            icon: <Power aria-hidden="true" />,
                            disabled: !bundle.is_active,
                            onSelect: () => setConfirmBundle(bundle),
                          }
                        : {
                            key: "delete",
                            label: t("moduleBundleDelete"),
                            icon: <Trash2 aria-hidden="true" />,
                            destructive: true,
                            onSelect: () => setConfirmBundle(bundle),
                          },
                    ]}
                  />
                </div>
              ),
            },
          ]}
        />
      )}

      <SidePanel
        open={editor !== null}
        title={editor === "new" ? t("moduleBundleAdd") : t("moduleBundleEditTitle")}
        description={t("moduleBundleSubtitle")}
        closeLabel={t("moduleFeeClose")}
        onClose={() => setEditor(null)}
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setEditor(null)} disabled={busy}>
              {t("moduleFeeClose")}
            </Button>
            <Button type="button" onClick={() => void save()} disabled={busy}>
              {busy ? t("moduleBundleSaving") : t("moduleBundleSave")}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="module-bundle-name" required>
              {t("moduleBundleNameLabel")}
            </Label>
            <Input
              id="module-bundle-name"
              required
              value={draft.name}
              onChange={(event) => setDraft((previous) => ({ ...previous, name: event.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label required>{t("moduleBundleModulesLabel")}</Label>
            <Popover>
              <PopoverTrigger
                className="inline-flex h-[var(--control-height)] min-h-[var(--control-height)] w-full items-center justify-between rounded-[var(--radius-form)] border border-[var(--border)] bg-[var(--field-background)] px-3 text-sm text-[var(--field-foreground)]"
                aria-label={t("moduleBundleModulesLabel")}
              >
                {draft.moduleIds.length === 0
                  ? t("moduleBundleModulesLabel")
                  : draft.moduleIds.map((moduleId) => moduleName(moduleId)).join(", ")}
              </PopoverTrigger>
              <PopoverContent className="w-72 p-2">
                {BILLABLE_MODULE_IDS.length > 8 ? (
                  <Input
                    value={moduleQuery}
                    onChange={(event) => setModuleQuery(event.target.value)}
                    placeholder={t("moduleBundleModulesLabel")}
                    aria-label={t("moduleBundleModulesLabel")}
                    className="mb-2"
                  />
                ) : null}
                <div className="space-y-1">
                  {visibleModules.map((moduleId) => {
                    const selected = draft.moduleIds.includes(moduleId);
                    return (
                      <div
                        key={moduleId}
                        role="checkbox"
                        aria-checked={selected}
                        aria-label={moduleName(moduleId)}
                        tabIndex={0}
                        className="flex cursor-pointer items-center gap-2 rounded-[var(--radius-form)] px-2 py-1.5 text-sm text-foreground hover:bg-secondary"
                        onClick={() => setModule(moduleId, !selected)}
                        onKeyDown={(event) => {
                          if (event.key === " " || event.key === "Enter") {
                            event.preventDefault();
                            setModule(moduleId, !selected);
                          }
                        }}
                      >
                        <span
                          aria-hidden
                          className={
                            selected
                              ? "h-4 w-4 rounded-[var(--radius-form)] border border-primary bg-primary"
                              : "h-4 w-4 rounded-[var(--radius-form)] border border-[var(--checkbox-border)] bg-[var(--surface)]"
                          }
                        />
                        <span>{moduleName(moduleId)}</span>
                      </div>
                    );
                  })}
                </div>
              </PopoverContent>
            </Popover>
            {draft.moduleIds.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {draft.moduleIds.map((moduleId) => (
                  <button
                    key={moduleId}
                    type="button"
                    className="rounded-[var(--radius-chip)] border border-border bg-secondary px-2 py-0.5 text-xs text-foreground"
                    onClick={() => setModule(moduleId, false)}
                  >
                    {moduleName(moduleId)}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="module-bundle-amount" required>
                {t("moduleBundleAmountLabel")}
              </Label>
              <Input
                id="module-bundle-amount"
                required
                value={draft.amount}
                inputMode="decimal"
                placeholder="0.00"
                onChange={(event) => setDraft((previous) => ({ ...previous, amount: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="module-bundle-from">{t("moduleBundleValidFromLabel")}</Label>
              <Input
                id="module-bundle-from"
                type="date"
                value={draft.effectiveFrom}
                onChange={(event) => setDraft((previous) => ({ ...previous, effectiveFrom: event.target.value }))}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="module-bundle-description">{t("moduleBundleDescriptionLabel")}</Label>
            <Input
              id="module-bundle-description"
              value={draft.description}
              onChange={(event) => setDraft((previous) => ({ ...previous, description: event.target.value }))}
            />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="module-bundle-active"
              checked={draft.isActive}
              onCheckedChange={(value) => setDraft((previous) => ({ ...previous, isActive: value === true }))}
            />
            <Label htmlFor="module-bundle-active">{t("moduleBundleActive")}</Label>
          </div>
          {comparisonLines.length > 0 ? (
            <div className="space-y-2 rounded-[var(--radius-card)] border border-border bg-secondary p-3">
              <p className="text-sm font-medium text-foreground">{t("moduleBundleComparisonTitle")}</p>
              <ul className="space-y-1 text-sm text-muted">
                {comparisonLines.map((line) => (
                  <li key={line.moduleId}>
                    {line.name}
                    {": "}
                    {line.missing
                      ? t("moduleBundleNoPrice")
                      : line.perMember
                        ? t("moduleBundlePerMember")
                        : `${line.flatAmount?.toFixed(2)} EUR`}
                  </li>
                ))}
              </ul>
              {comparisonDifference !== null ? (
                <p className="text-sm text-foreground">
                  {comparisonDifference === 0
                    ? t("moduleBundleComparisonSame")
                    : comparisonDifference > 0
                      ? t("moduleBundleComparisonHigher", { amount: comparisonDifference.toFixed(2) })
                      : t("moduleBundleComparisonLower", { amount: Math.abs(comparisonDifference).toFixed(2) })}
                </p>
              ) : null}
            </div>
          ) : null}
          {editing && editing.current_amount ? (
            <p className="text-xs text-muted">
              {t("moduleBundlePriceLabel")}: {editing.current_amount} {editing.current_currency ?? "EUR"}
            </p>
          ) : null}
        </div>
      </SidePanel>

      <SidePanel
        open={confirmBundle !== null}
        title={confirmBundle?.has_invoices ? t("moduleBundleSwitchOffTitle") : t("moduleBundleDeleteTitle")}
        description={
          confirmBundle?.has_invoices ? t("moduleBundleSwitchOffDescription") : t("moduleBundleDeleteDescription")
        }
        closeLabel={t("moduleFeeClose")}
        onClose={() => setConfirmBundle(null)}
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setConfirmBundle(null)}>
              {t("moduleFeeClose")}
            </Button>
            <Button type="button" variant="destructive" onClick={() => void confirmRemove()} disabled={busy}>
              {confirmBundle?.has_invoices ? t("moduleBundleConfirmSwitchOff") : t("moduleBundleConfirmDelete")}
            </Button>
          </>
        }
      >
        <p className="text-sm text-foreground">{confirmBundle?.name}</p>
      </SidePanel>

      <SidePanel
        open={settingsOpen}
        title={t("moduleBundleSettingsTitle")}
        description={t("moduleBundleSettingsHint")}
        closeLabel={t("moduleFeeClose")}
        onClose={() => {
          setSettingsForm(null);
          setSettingsOpen(false);
        }}
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setSettingsForm(null);
                setSettingsOpen(false);
              }}
              disabled={busy}
            >
              {t("moduleFeeClose")}
            </Button>
            <Button type="button" onClick={() => void saveSettings()} disabled={busy || !displayedSettings}>
              {busy ? t("moduleBundleSaving") : t("moduleBundleSave")}
            </Button>
          </>
        }
      >
        {displayedSettings ? (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="module-bundle-months" required>
                {t("moduleBundleMonthsLabel")}
              </Label>
              <Input
                id="module-bundle-months"
                inputMode="numeric"
                value={displayedSettings.subscription_months}
                onChange={(event) =>
                  setSettingsForm({ ...displayedSettings, subscription_months: event.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="module-bundle-notice" required>
                {t("moduleBundleNoticeLabel")}
              </Label>
              <Input
                id="module-bundle-notice"
                inputMode="numeric"
                value={displayedSettings.renewal_notice_days}
                onChange={(event) =>
                  setSettingsForm({ ...displayedSettings, renewal_notice_days: event.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="module-bundle-window" required>
                {t("moduleBundleWindowLabel")}
              </Label>
              <Input
                id="module-bundle-window"
                inputMode="numeric"
                value={displayedSettings.payment_window_days}
                onChange={(event) =>
                  setSettingsForm({ ...displayedSettings, payment_window_days: event.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="module-bundle-warning" required>
                {t("moduleBundleWarningLabel")}
              </Label>
              <Input
                id="module-bundle-warning"
                inputMode="numeric"
                value={displayedSettings.payment_warning_days}
                onChange={(event) =>
                  setSettingsForm({ ...displayedSettings, payment_warning_days: event.target.value })
                }
              />
            </div>
          </div>
        ) : null}
      </SidePanel>
    </div>
  );
}
