"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Boxes,
  Building2,
  CalendarDays,
  Check,
  CircleDollarSign,
  IdCard,
  Pencil,
  Receipt,
  Repeat,
  ScrollText,
  Trash2,
  TriangleAlert,
} from "lucide-react";

import { EmptyState } from "@/components/club-admin/empty-state";
import { EntityTable } from "@/components/club-admin/entity-table";
import type { TableSort } from "@/lib/table-sort";
import { LtfFinanceLayout } from "@/components/ltf-finance/ltf-finance-layout";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DeleteConfirmModal } from "@/components/ui/delete-confirm-modal";
import { RowActionMenu } from "@/components/ui/row-action-menu";
import { ClubFeeFormPanel, type ClubFeeDraft } from "@/components/ltf-finance/club-fee-panel";
import { LicenseTypeFormPanel } from "@/components/ltf-finance/license-type-panels";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ActionNotices,
  FormPanel,
  ListActionsRow,
  ListToolbarPanel,
  PageNotice,
} from "@/components/ui/list-page-chrome";
import { StatusBadge } from "@/components/ui/status-badge";
import { UnderlineTabs } from "@/components/ui/underline-tabs";
import { cn } from "@/lib/utils";
import {
  ClubFeeBillingSchedule,
  ClubFeeCadence,
  ClubFeeChargeStatus,
  ClubFeePrice,
  ClubFeeType,
  FinanceLicenseType,
  LicensePrice,
  ModuleBundle,
  ModuleSubscriptionSettings,
  createClubFeeBilling,
  getClubFeeBillingStatus,
  createClubFeePrice,
  createClubFeeType,
  createLicensePrice,
  deleteClubFeeType,
  deleteFinanceLicenseType,
  updateClubFeeType,
  getClubFeeBillingSchedules,
  getClubFeePrices,
  getClubFeeTypes,
  getFinanceLicenseTypes,
  getLicensePrices,
  getModuleBundles,
  getModuleSubscriptionSettings,
  createModuleBundle,
  updateModuleBundle,
  deleteModuleBundle,
  updateModuleSubscriptionSettings,
  updateClubFeeBillingSchedule,
} from "@/lib/ltf-finance-api";
import { ModuleBundlesPanel, ModuleSubscriptionSettingsCard } from "@/components/ltf-finance/module-bundles-panel";
import { ModuleFeesPanel, moduleFeeLabelKey } from "@/components/ltf-finance/module-fees-panel";
import { Club, getClubs, updateClub } from "@/lib/club-admin-api";
import { useConsumeSearchParam } from "@/lib/consume-search-param";
import { formatDisplayDate, formatDisplayDateTime } from "@/lib/date-display";

const SETTINGS_TABS = ["license-types", "license-prices", "club-fees", "module-fees", "billing"] as const;
type SettingsTab = (typeof SETTINGS_TABS)[number];

function parseSettingsTab(value: string | null): SettingsTab {
  if (value && (SETTINGS_TABS as readonly string[]).includes(value)) {
    return value as SettingsTab;
  }
  return "license-types";
}

function formatWindow(startMonth: number, startDay: number, endMonth: number, endDay: number) {
  return `${String(startDay).padStart(2, "0")}/${String(startMonth).padStart(2, "0")} - ${String(
    endDay
  ).padStart(2, "0")}/${String(endMonth).padStart(2, "0")}`;
}

type PriceDraft = {
  amount: string;
  effectiveFrom: string;
};

export default function LtfFinanceLicenseSettingsPage() {
  const t = useTranslations("LtfFinance");
  const common = useTranslations("Common");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const missingPriceIssue = searchParams.get("issue") === "missing_price";
  const urlTab = parseSettingsTab(searchParams.get("tab"));
  const [activeTab, setActiveTabState] = useState<SettingsTab>(urlTab);
  const [licenseTypes, setLicenseTypes] = useState<FinanceLicenseType[]>([]);
  const [prices, setPrices] = useState<LicensePrice[]>([]);
  const [clubFeeTypes, setClubFeeTypes] = useState<ClubFeeType[]>([]);
  const [clubFeePrices, setClubFeePrices] = useState<ClubFeePrice[]>([]);
  const [moduleBundles, setModuleBundles] = useState<ModuleBundle[]>([]);
  const [subscriptionSettings, setSubscriptionSettings] = useState<ModuleSubscriptionSettings | null>(null);
  const [bundleSettingsOpen, setBundleSettingsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [typePanel, setTypePanel] = useState<{ mode: "create" } | { mode: "edit"; id: number } | null>(null);
  const [typeSort, setTypeSort] = useState<TableSort | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [licenseTypeToDelete, setLicenseTypeToDelete] = useState<FinanceLicenseType | null>(null);
  const [feeTypeToDelete, setFeeTypeToDelete] = useState<ClubFeeType | null>(null);

  const [priceDrafts, setPriceDrafts] = useState<Record<number, PriceDraft>>({});
  const [savingPriceByType, setSavingPriceByType] = useState<Record<number, boolean>>({});
  const [feePriceDrafts, setFeePriceDrafts] = useState<Record<number, PriceDraft>>({});
  const [savingFeePriceByType, setSavingFeePriceByType] = useState<Record<number, boolean>>({});
  const [feeEditor, setFeeEditor] = useState<ClubFeeType | "new" | null>(null);
  const [isSavingFee, setIsSavingFee] = useState(false);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [schedules, setSchedules] = useState<ClubFeeBillingSchedule[]>([]);
  const [selectedFeeIds, setSelectedFeeIds] = useState<number[]>([]);
  const [selectedClubIds, setSelectedClubIds] = useState<number[]>([]);
  const [billAllActiveClubs, setBillAllActiveClubs] = useState(true);
  const [billingDate, setBillingDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [billingYear, setBillingYear] = useState(() => String(new Date().getFullYear()));
  const [billingRebill, setBillingRebill] = useState(false);
  const [billingCharges, setBillingCharges] = useState<ClubFeeChargeStatus[]>([]);
  const [billingRecurring, setBillingRecurring] = useState(false);
  const [billingRecurrence, setBillingRecurrence] = useState<"monthly" | "annual">("annual");
  const [isBilling, setIsBilling] = useState(false);

  useEffect(() => {
    setActiveTabState(urlTab);
  }, [urlTab]);

  const setActiveTab = useCallback(
    (tab: SettingsTab) => {
      setActiveTabState(tab);
      const nextParams = new URLSearchParams(searchParams.toString());
      if (tab === "license-types") {
        nextParams.delete("tab");
      } else {
        nextParams.set("tab", tab);
      }
      const nextQuery = nextParams.toString();
      const currentQuery = searchParams.toString();
      if (nextQuery === currentQuery) {
        return;
      }
      router.replace(`${pathname}${nextQuery ? `?${nextQuery}` : ""}`, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  useConsumeSearchParam("create", () => {
    setActiveTab("license-types");
    setTypePanel({ mode: "create" });
  });
  useConsumeSearchParam("edit", (value) => {
    const id = Number(value);
    if (!Number.isInteger(id) || id <= 0) {
      return;
    }
    setActiveTab("license-types");
    setTypePanel({ mode: "edit", id });
  });
  useConsumeSearchParam("window", (value) => {
    const id = Number(value);
    if (!Number.isInteger(id) || id <= 0) {
      return;
    }
    setActiveTab("license-types");
    setTypePanel({ mode: "edit", id });
  });

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const [
        licenseTypesResponse,
        pricesResponse,
        feeTypesResponse,
        feePricesResponse,
        clubsResponse,
        schedulesResponse,
        chargesResponse,
        bundlesResponse,
        subscriptionResponse,
      ] = await Promise.all([
          getFinanceLicenseTypes(),
          getLicensePrices(),
          getClubFeeTypes(),
          getClubFeePrices(),
          getClubs(),
          getClubFeeBillingSchedules(),
          getClubFeeBillingStatus(Number(billingYear) || new Date().getFullYear()),
          getModuleBundles(),
          getModuleSubscriptionSettings(),
        ]);
      setLicenseTypes(licenseTypesResponse);
      setPrices(pricesResponse);
      setClubFeeTypes(feeTypesResponse);
      setClubFeePrices(feePricesResponse);
      setClubs(clubsResponse);
      setSchedules(schedulesResponse);
      setBillingCharges(chargesResponse.charges);
      setModuleBundles(bundlesResponse);
      setSubscriptionSettings(subscriptionResponse);
      setPriceDrafts((previous) => {
        const next: Record<number, PriceDraft> = {};
        licenseTypesResponse.forEach((licenseType) => {
          next[licenseType.id] = previous[licenseType.id] ?? {
            amount: "",
            effectiveFrom: "",
          };
        });
        return next;
      });
      setFeePriceDrafts((previous) => {
        const next: Record<number, PriceDraft> = {};
        feeTypesResponse.forEach((feeType) => {
          next[feeType.id] = previous[feeType.id] ?? {
            amount: "",
            effectiveFrom: "",
          };
        });
        return next;
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("licenseSettingsLoadError"));
    } finally {
      setIsLoading(false);
    }
  }, [billingYear, t]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredLicenseTypes = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const pricedTypeIds = new Set(
      prices
        .filter((price) => price.effective_from <= today)
        .map((price) => price.license_type)
    );
    const normalized = searchQuery.trim().toLowerCase();
    return licenseTypes.filter((licenseType) => {
      if (missingPriceIssue && pricedTypeIds.has(licenseType.id)) {
        return false;
      }
      if (!normalized) {
        return true;
      }
      return (
        licenseType.name.toLowerCase().includes(normalized) ||
        licenseType.code.toLowerCase().includes(normalized)
      );
    });
  }, [licenseTypes, missingPriceIssue, prices, searchQuery]);

  const pricesByLicenseType = useMemo(() => {
    const grouped: Record<number, LicensePrice[]> = {};
    licenseTypes.forEach((licenseType) => {
      grouped[licenseType.id] = [];
    });
    prices.forEach((price) => {
      if (!grouped[price.license_type]) {
        grouped[price.license_type] = [];
      }
      grouped[price.license_type].push(price);
    });
    Object.keys(grouped).forEach((licenseTypeId) => {
      grouped[Number(licenseTypeId)].sort((left, right) => {
        const byEffectiveDate = right.effective_from.localeCompare(left.effective_from);
        if (byEffectiveDate !== 0) {
          return byEffectiveDate;
        }
        return right.created_at.localeCompare(left.created_at);
      });
    });
    return grouped;
  }, [licenseTypes, prices]);

  const openDeleteTypeModal = (licenseType: FinanceLicenseType) => {
    setFeeTypeToDelete(null);
    setLicenseTypeToDelete(licenseType);
    setIsDeleteOpen(true);
  };

  const confirmDeleteType = async () => {
    if (!licenseTypeToDelete) {
      return;
    }
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await deleteFinanceLicenseType(licenseTypeToDelete.id);
      setIsDeleteOpen(false);
      setLicenseTypeToDelete(null);
      setSuccessMessage(t("licenseTypeDeletedMessage"));
      await loadData();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("licenseTypeDeleteError"));
    }
  };

  const updatePriceDraft = (licenseTypeId: number, patch: Partial<PriceDraft>) => {
    setPriceDrafts((previous) => ({
      ...previous,
      [licenseTypeId]: {
        amount: previous[licenseTypeId]?.amount ?? "",
        effectiveFrom: previous[licenseTypeId]?.effectiveFrom ?? "",
        ...patch,
      },
    }));
  };

  const savePrice = async (licenseTypeId: number) => {
    const draft = priceDrafts[licenseTypeId] ?? { amount: "", effectiveFrom: "" };
    if (!draft.amount.trim()) {
      setErrorMessage(t("priceAmountRequiredError"));
      return;
    }
    const currentPrice = pricesByLicenseType[licenseTypeId]?.[0] ?? null;
    setErrorMessage(null);
    setSuccessMessage(null);
    setSavingPriceByType((previous) => ({
      ...previous,
      [licenseTypeId]: true,
    }));
    try {
      await createLicensePrice({
        license_type: licenseTypeId,
        amount: draft.amount,
        currency: currentPrice?.currency ?? "EUR",
        effective_from: draft.effectiveFrom || undefined,
      });
      updatePriceDraft(licenseTypeId, { amount: "", effectiveFrom: "" });
      setSuccessMessage(t("priceSaved"));
      await loadData();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("priceSaveError"));
    } finally {
      setSavingPriceByType((previous) => ({
        ...previous,
        [licenseTypeId]: false,
      }));
    }
  };

  const pricesByFeeType = useMemo(() => {
    const grouped: Record<number, ClubFeePrice[]> = {};
    clubFeeTypes.forEach((feeType) => {
      grouped[feeType.id] = [];
    });
    clubFeePrices.forEach((price) => {
      if (!grouped[price.fee_type]) {
        grouped[price.fee_type] = [];
      }
      grouped[price.fee_type].push(price);
    });
    Object.keys(grouped).forEach((feeTypeId) => {
      grouped[Number(feeTypeId)].sort((left, right) => {
        const byEffectiveDate = right.effective_from.localeCompare(left.effective_from);
        if (byEffectiveDate !== 0) {
          return byEffectiveDate;
        }
        return right.created_at.localeCompare(left.created_at);
      });
    });
    return grouped;
  }, [clubFeePrices, clubFeeTypes]);

  const cadenceLabel = (cadence: ClubFeeCadence) => {
    if (cadence === "annual") {
      return t("clubFeeCadenceAnnual");
    }
    if (cadence === "per_member") {
      return t("clubFeeCadencePerMember");
    }
    if (cadence === "per_event") {
      return t("clubFeeCadencePerEvent");
    }
    return t("clubFeeCadenceOneOff");
  };

  const catalogFees = useMemo(
    () => clubFeeTypes.filter((fee) => !fee.module_id),
    [clubFeeTypes]
  );
  const moduleFees = useMemo(
    () => clubFeeTypes.filter((fee) => Boolean(fee.module_id)),
    [clubFeeTypes]
  );
  const activeFees = useMemo(
    () => clubFeeTypes.filter((fee) => fee.is_active),
    [clubFeeTypes]
  );
  const feeDisplayName = (fee: ClubFeeType) => {
    const key = moduleFeeLabelKey(fee.module_id);
    return key ? t(key) : fee.name;
  };
  const activeClubCount = useMemo(
    () => clubs.filter((club) => club.is_active).length,
    [clubs]
  );
  const selectedClubCount = billAllActiveClubs ? activeClubCount : selectedClubIds.length;
  const billedCount = billingCharges.length;

  const updateFeePriceDraft = (feeTypeId: number, patch: Partial<PriceDraft>) => {
    setFeePriceDrafts((previous) => ({
      ...previous,
      [feeTypeId]: {
        amount: previous[feeTypeId]?.amount ?? "",
        effectiveFrom: previous[feeTypeId]?.effectiveFrom ?? "",
        ...patch,
      },
    }));
  };

  const saveFeeEditor = async (draft: ClubFeeDraft) => {
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsSavingFee(true);
    const creating = feeEditor === "new";
    try {
      const amount = draft.amount.trim();
      if (creating) {
        await createClubFeeType({
          name: draft.name,
          description: draft.description,
          cadence: draft.cadence,
          is_active: draft.isActive,
          initial_amount: amount || undefined,
          initial_currency: "EUR",
        });
        setSuccessMessage(t("clubFeeCreatedMessage"));
      } else if (feeEditor) {
        const amountChanged = amount !== (feeEditor.current_amount ?? "");
        await updateClubFeeType(feeEditor.id, {
          name: draft.name,
          description: draft.description,
          cadence: draft.cadence,
          is_active: draft.isActive,
          ...(amountChanged && amount ? { initial_amount: amount, initial_currency: "EUR" } : {}),
        });
        setSuccessMessage(t("clubFeeUpdatedMessage"));
      }
      setFeeEditor(null);
      await loadData();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t(creating ? "clubFeeCreateError" : "clubFeeUpdateError"));
    } finally {
      setIsSavingFee(false);
    }
  };

  const saveFeePrice = async (feeTypeId: number) => {
    const draft = feePriceDrafts[feeTypeId] ?? { amount: "", effectiveFrom: "" };
    if (!draft.amount.trim()) {
      setErrorMessage(t("priceAmountRequiredError"));
      return;
    }
    const currentPrice = pricesByFeeType[feeTypeId]?.[0] ?? null;
    setErrorMessage(null);
    setSuccessMessage(null);
    setSavingFeePriceByType((previous) => ({ ...previous, [feeTypeId]: true }));
    try {
      await createClubFeePrice({
        fee_type: feeTypeId,
        amount: draft.amount,
        currency: currentPrice?.currency ?? "EUR",
        effective_from: draft.effectiveFrom || undefined,
      });
      updateFeePriceDraft(feeTypeId, { amount: "", effectiveFrom: "" });
      setSuccessMessage(t("clubFeePriceSaved"));
      await loadData();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("clubFeePriceSaveError"));
    } finally {
      setSavingFeePriceByType((previous) => ({ ...previous, [feeTypeId]: false }));
    }
  };

  const confirmDelete = async () => {
    if (licenseTypeToDelete) {
      await confirmDeleteType();
      return;
    }
    if (!feeTypeToDelete) {
      return;
    }
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await deleteClubFeeType(feeTypeToDelete.id);
      setIsDeleteOpen(false);
      setFeeTypeToDelete(null);
      setSuccessMessage(t("clubFeeDeletedMessage"));
      await loadData();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("clubFeeDeleteError"));
    }
  };

  const toggleFeeId = (feeId: number) => {
    setSelectedFeeIds((current) =>
      current.includes(feeId) ? current.filter((id) => id !== feeId) : [...current, feeId]
    );
  };

  const toggleClubId = (clubId: number) => {
    setSelectedClubIds((current) =>
      current.includes(clubId) ? current.filter((id) => id !== clubId) : [...current, clubId]
    );
  };

  const submitBilling = async () => {
    if (selectedFeeIds.length === 0) {
      setErrorMessage(t("clubFeeBillingNoFees"));
      return;
    }
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsBilling(true);
    try {
      const result = await createClubFeeBilling({
        fee_type_ids: selectedFeeIds,
        club_ids: billAllActiveClubs ? undefined : selectedClubIds,
        billed_on: billingDate,
        period_year: Number(billingYear) || new Date().getFullYear(),
        rebill: billingRebill,
        recurring: billingRecurring,
        recurrence: billingRecurring ? billingRecurrence : null,
      });
      const skipped = result.skipped ?? [];
      const skippedPaid = skipped.filter((row) => row.reason === "paid").length;
      const skippedCount = skipped.length;
      const rebilledCount = result.rebilled?.length ?? 0;
      if (rebilledCount > 0) {
        setSuccessMessage(
          t("clubFeeBillingSuccessRebill", { count: result.invoice_count, rebilled: rebilledCount }),
        );
      } else if (result.invoice_count === 0 && skippedPaid === skippedCount && skippedPaid > 0) {
        setSuccessMessage(t("clubFeeBillingSkippedPaid", { skipped: skippedPaid }));
      } else if (skippedCount > 0) {
        setSuccessMessage(
          t("clubFeeBillingSuccessWithSkip", { count: result.invoice_count, skipped: skippedCount }),
        );
      } else {
        setSuccessMessage(t("clubFeeBillingSuccess", { count: result.invoice_count }));
      }
      await loadData();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("clubFeeBillingError"));
    } finally {
      setIsBilling(false);
    }
  };

  const toggleClubActive = async (club: Club, nextActive: boolean) => {
    setErrorMessage(null);
    try {
      const updated = await updateClub(club.id, { is_active: nextActive });
      setClubs((current) => current.map((item) => (item.id === club.id ? { ...item, ...updated } : item)));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("clubFeeBillingError"));
    }
  };

  const toggleSchedule = async (schedule: ClubFeeBillingSchedule) => {
    setErrorMessage(null);
    try {
      await updateClubFeeBillingSchedule(schedule.id, { is_active: !schedule.is_active });
      await loadData();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("clubFeeBillingError"));
    }
  };

  return (
    <LtfFinanceLayout title={t("licenseSettingsTitle")} subtitle={t("licenseSettingsSubtitle")}>
      <ActionNotices error={errorMessage} success={successMessage} onDismiss={() => { setErrorMessage(null); setSuccessMessage(null); }} />
      {missingPriceIssue ? (
        <PageNotice tone="info">{t("missingActivePriceFilterMessage")}</PageNotice>
      ) : null}

      <UnderlineTabs
        idPrefix="finance-settings"
        ariaLabel={t("settingsTabsAriaLabel")}
        value={activeTab}
        onChange={setActiveTab}
        options={[
          { value: "license-types", label: t("settingsTabLicenseTypes"), icon: IdCard },
          { value: "license-prices", label: t("settingsTabLicensePrices"), icon: CircleDollarSign },
          { value: "club-fees", label: t("settingsTabClubFees"), icon: Receipt },
          { value: "module-fees", label: t("settingsTabModuleFees"), icon: Boxes },
          { value: "billing", label: t("settingsTabBilling"), icon: ScrollText },
        ]}
      />

      {activeTab === "license-types" ? (
      <div className="space-y-3">
      <div className="flex flex-col gap-3">
        <ListToolbarPanel
          search={
            <Input
              className="w-full max-w-xs"
              placeholder={t("searchLicenseTypesPlaceholder")}
              aria-label={t("searchLicenseTypesPlaceholder")}
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          }
        />
        <ListActionsRow
          actions={
            <Button
              variant="primary"
              onClick={() => setTypePanel({ mode: "create" })}
            >
              {t("createLicenseType")}
            </Button>
          }
        />
      </div>

      <div>
        {isLoading ? (
          <EmptyState title={t("loadingTitle")} description={t("loadingSubtitle")} loading />
        ) : filteredLicenseTypes.length === 0 ? (
          <EmptyState title={t("noLicenseTypesTitle")} description={t("noLicenseTypesSubtitle")} />
        ) : (
          <EntityTable
            clientSort
            sort={typeSort}
            onSortChange={setTypeSort}
            columns={[
              { key: "name", header: t("licenseTypeNameLabel"), sortable: true, sortValue: (row) => row.name },
              { key: "code", header: t("licenseTypeCodeLabel"), sortable: true, sortValue: (row) => row.code },
              {
                key: "validity",
                header: t("validityColumn"),
                sortable: true,
                sortValue: (licenseType: FinanceLicenseType) =>
                  licenseType.policy?.validity_mode === "duration"
                    ? (licenseType.policy.duration_years ?? 0) * 1000 + (licenseType.policy.duration_days ?? 0)
                    : 0,
                render: (licenseType: FinanceLicenseType) =>
                  licenseType.policy?.validity_mode === "duration"
                    ? t("durationSummary", {
                        years: licenseType.policy.duration_years ?? 0,
                        days: licenseType.policy.duration_days ?? 0,
                      })
                    : t("validityCalendarYearShort"),
              },
              {
                key: "current_window",
                header: t("currentYearWindowLabel"),
                sortable: true,
                sortValue: (licenseType: FinanceLicenseType) =>
                  licenseType.policy?.allow_current_year_order
                    ? formatWindow(
                        licenseType.policy.current_start_month,
                        licenseType.policy.current_start_day,
                        licenseType.policy.current_end_month,
                        licenseType.policy.current_end_day,
                      )
                    : "",
                render: (licenseType: FinanceLicenseType) =>
                  licenseType.policy?.allow_current_year_order
                    ? formatWindow(
                        licenseType.policy.current_start_month,
                        licenseType.policy.current_start_day,
                        licenseType.policy.current_end_month,
                        licenseType.policy.current_end_day
                      )
                    : t("windowDisabledLabel"),
              },
              {
                key: "next_window",
                header: t("nextYearWindowLabel"),
                render: (licenseType: FinanceLicenseType) =>
                  licenseType.policy?.allow_next_year_preorder
                    ? formatWindow(
                        licenseType.policy.next_start_month,
                        licenseType.policy.next_start_day,
                        licenseType.policy.next_end_month,
                        licenseType.policy.next_end_day
                      )
                    : t("windowDisabledLabel"),
              },
              {
                key: "actions",
                header: t("actionLabel"),
                render: (licenseType: FinanceLicenseType) => (
                  <div onClick={(event) => event.stopPropagation()}>
                    <RowActionMenu
                      label={common("rowActionsLabel")}
                      actions={[
                        {
                          key: "edit",
                          label: t("editAction"),
                          onSelect: () => setTypePanel({ mode: "edit", id: licenseType.id }),
                        },
                        {
                          key: "delete",
                          label: t("deleteAction"),
                          destructive: true,
                          onSelect: () => openDeleteTypeModal(licenseType),
                        },
                      ]}
                    />
                  </div>
                ),
              },
            ]}
            rows={filteredLicenseTypes}
            onRowClick={(row) => setTypePanel({ mode: "edit", id: row.id })}
          />
        )}
      </div>
      </div>
      ) : null}

      {activeTab === "license-prices" ? (
      <FormPanel>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-section text-foreground">{t("priceHistoryTitle")}</h2>
            <p className="mt-1 text-sm text-muted">{t("priceModalSubtitle")}</p>
          </div>
        </div>

        {licenseTypes.length === 0 ? (
          <EmptyState title={t("priceHistoryEmptyTitle")} description={t("priceHistoryEmptySubtitle")} />
        ) : (
          <div className="space-y-3">
            {licenseTypes.map((licenseType) => {
              const rows = pricesByLicenseType[licenseType.id] ?? [];
              const draft = priceDrafts[licenseType.id] ?? { amount: "", effectiveFrom: "" };
              const currentPrice = rows[0] ?? null;
              const isSavingPrice = Boolean(savingPriceByType[licenseType.id]);
              return (
                <article key={licenseType.id} className="overflow-hidden rounded-[var(--radius-card)] border border-border">
                  <div className="space-y-1 border-b border-border bg-secondary px-3 py-2">
                    <h3 className="text-sm font-semibold text-foreground">{licenseType.name}</h3>
                    <p className="text-xs text-muted">
                      {currentPrice
                        ? `${t("licensePriceLabel")}: ${currentPrice.amount} ${currentPrice.currency}`
                        : t("noPriceLabel")}
                    </p>
                  </div>
                  {rows.length === 0 ? (
                    <p className="px-4 py-4 text-sm text-muted">{t("priceHistoryEmptySubtitle")}</p>
                  ) : (
                    <EntityTable
                      columns={[
                        {
                          key: "amount",
                          header: t("priceAmountLabel"),
                          render: (row: LicensePrice) => `${row.amount} ${row.currency}`,
                        },
                        {
                          key: "effective_from",
                          header: t("priceEffectiveFromLabel"),
                          render: (row: LicensePrice) => formatDisplayDate(row.effective_from),
                        },
                        {
                          key: "created_at",
                          header: t("createdAtLabel"),
                          render: (row: LicensePrice) => formatDisplayDateTime(row.created_at),
                        },
                      ]}
                      rows={rows}
                    />
                  )}
                  <div className="border-t border-border bg-secondary px-4 py-4">
                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="space-y-2">
                        <label className="text-xs font-medium text-foreground">{t("priceAmountLabel")}</label>
                        <Input
                          value={draft.amount}
                          onChange={(event) =>
                            updatePriceDraft(licenseType.id, { amount: event.target.value })
                          }
                          placeholder="30.00"
                          inputMode="decimal"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-medium text-foreground">
                          {t("priceEffectiveFromLabel")}
                        </label>
                        <Input
                          type="date"
                          value={draft.effectiveFrom}
                          onChange={(event) =>
                            updatePriceDraft(licenseType.id, { effectiveFrom: event.target.value })
                          }
                        />
                        <p className="text-xs text-muted">{t("priceEffectiveFromHint")}</p>
                      </div>
                      <div className="flex items-end">
                        <Button onClick={() => savePrice(licenseType.id)} disabled={isSavingPrice}>
                          {isSavingPrice ? t("priceSaving") : t("priceSaveButton")}
                        </Button>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </FormPanel>
      ) : null}

      {activeTab === "club-fees" ? (
        <div className="space-y-3">
          <FormPanel>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-section text-foreground">{t("clubFeesTitle")}</h2>
                <p className="mt-1 text-sm text-muted">{t("clubFeesSubtitle")}</p>
              </div>
              <Button type="button" onClick={() => setFeeEditor("new")}>
                {t("clubFeeCreateAction")}
              </Button>
            </div>
          </FormPanel>

          {catalogFees.length === 0 ? (
            <EmptyState title={t("clubFeeEmptyTitle")} description={t("clubFeeEmptySubtitle")} />
          ) : (
            <div className="space-y-3">
              {catalogFees.map((feeType) => {
                const rows = pricesByFeeType[feeType.id] ?? [];
                const draft = feePriceDrafts[feeType.id] ?? { amount: "", effectiveFrom: "" };
                const isSavingFeePrice = Boolean(savingFeePriceByType[feeType.id]);
                return (
                  <article
                    key={feeType.id}
                    className="overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border bg-secondary px-3 py-2">
                      <div className="space-y-1">
                        <h3 className="text-sm font-semibold text-foreground">{feeType.name}</h3>
                        <p className="text-xs text-muted">
                          {cadenceLabel(feeType.cadence)}
                          {" · "}
                          {feeType.current_amount
                            ? `${feeType.current_amount} ${feeType.current_currency ?? "EUR"}`
                            : t("clubFeeNoAmountLabel")}
                          {feeType.is_active ? "" : ` · ${t("clubFeeInactiveLabel")}`}
                        </p>
                        {feeType.description ? (
                          <p className="text-xs text-muted">{feeType.description}</p>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon-sm"
                          aria-label={t("clubFeeEditAction")}
                          onClick={() => setFeeEditor(feeType)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="destructive"
                          size="icon-sm"
                          aria-label={t("deleteAction")}
                          onClick={() => {
                            setFeeTypeToDelete(feeType);
                            setLicenseTypeToDelete(null);
                            setIsDeleteOpen(true);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    {rows.length === 0 ? (
                      <p className="px-4 py-4 text-sm text-muted">{t("priceHistoryEmptySubtitle")}</p>
                    ) : (
                      <EntityTable
                        columns={[
                          {
                            key: "amount",
                            header: t("clubFeeAmountLabel"),
                            render: (row: ClubFeePrice) => `${row.amount} ${row.currency}`,
                          },
                          {
                            key: "effective_from",
                            header: t("priceEffectiveFromLabel"),
                            render: (row: ClubFeePrice) => formatDisplayDate(row.effective_from),
                          },
                          {
                            key: "created_at",
                            header: t("createdAtLabel"),
                            render: (row: ClubFeePrice) => formatDisplayDateTime(row.created_at),
                          },
                        ]}
                        rows={rows}
                      />
                    )}
                    <div className="border-t border-border bg-secondary px-4 py-4">
                      <p className="mb-3 text-xs text-muted">{t("clubFeeNewPriceHint")}</p>
                      <div className="grid gap-3 md:grid-cols-3">
                        <div className="space-y-2">
                          <label className="text-xs font-medium text-foreground">
                            {t("clubFeeAmountLabel")}
                          </label>
                          <Input
                            value={draft.amount}
                            onChange={(event) =>
                              updateFeePriceDraft(feeType.id, { amount: event.target.value })
                            }
                            placeholder="0.00"
                            inputMode="decimal"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-medium text-foreground">
                            {t("priceEffectiveFromLabel")}
                          </label>
                          <Input
                            type="date"
                            value={draft.effectiveFrom}
                            onChange={(event) =>
                              updateFeePriceDraft(feeType.id, { effectiveFrom: event.target.value })
                            }
                          />
                        </div>
                        <div className="flex items-end">
                          <Button
                            onClick={() => void saveFeePrice(feeType.id)}
                            disabled={isSavingFeePrice}
                          >
                            {isSavingFeePrice ? t("priceSaving") : t("priceSaveButton")}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      ) : null}

      {activeTab === "module-fees" ? (
        <div className="space-y-3">
        <ModuleSubscriptionSettingsCard
          settings={subscriptionSettings}
          onOpen={() => setBundleSettingsOpen(true)}
        />
        <ModuleFeesPanel
          fees={moduleFees}
          prices={clubFeePrices}
          onNotice={(kind, message) => {
            if (kind === "error") {
              setErrorMessage(message);
              setSuccessMessage(null);
            } else {
              setSuccessMessage(message);
              setErrorMessage(null);
            }
          }}
          onCreate={async (draft) => {
            await createClubFeeType({
              module_id: draft.moduleId,
              cadence: "annual",
              is_active: true,
              initial_amount: draft.amount.trim(),
              initial_currency: "EUR",
              initial_effective_from: draft.effectiveFrom || undefined,
              initial_pricing_type: draft.pricingType,
              initial_minimum_amount: draft.minimum.trim() ? draft.minimum.trim() : null,
            });
            await loadData();
          }}
          onSave={async (fee, draft) => {
            if (fee.is_active !== draft.isActive) {
              await updateClubFeeType(fee.id, { is_active: draft.isActive });
            }
            await createClubFeePrice({
              fee_type: fee.id,
              amount: draft.amount.trim(),
              currency: fee.current_currency ?? "EUR",
              effective_from: draft.effectiveFrom || undefined,
              pricing_type: draft.pricingType,
              minimum_amount: draft.minimum.trim() ? draft.minimum.trim() : null,
            });
            await loadData();
          }}
          onRemove={async (fee) => {
            const result = await deleteClubFeeType(fee.id);
            await loadData();
            if (result && result.is_active === false) {
              return "switched_off";
            }
            return "deleted";
          }}
        />
        <ModuleBundlesPanel
          bundles={moduleBundles}
          moduleFees={moduleFees}
          settings={subscriptionSettings}
          settingsOpen={bundleSettingsOpen}
          onSettingsOpenChange={setBundleSettingsOpen}
          onNotice={(kind, message) => {
            if (kind === "error") {
              setErrorMessage(message);
              setSuccessMessage(null);
            } else {
              setSuccessMessage(message);
              setErrorMessage(null);
            }
          }}
          onCreate={async (draft) => {
            await createModuleBundle({
              name: draft.name.trim(),
              description: draft.description.trim(),
              is_active: draft.isActive,
              modules: draft.moduleIds,
              initial_amount: draft.amount.trim(),
              initial_currency: "EUR",
              initial_effective_from: draft.effectiveFrom || undefined,
            });
            await loadData();
          }}
          onUpdate={async (bundle, draft) => {
            const amountChanged =
              draft.amount.trim() !== (bundle.current_amount ?? "") || Boolean(draft.effectiveFrom);
            await updateModuleBundle(bundle.id, {
              name: draft.name.trim(),
              description: draft.description.trim(),
              is_active: draft.isActive,
              modules: draft.moduleIds,
              ...(amountChanged
                ? {
                    initial_amount: draft.amount.trim(),
                    initial_currency: "EUR",
                    initial_effective_from: draft.effectiveFrom || undefined,
                  }
                : {}),
            });
            await loadData();
          }}
          onRemove={async (bundle) => {
            const result = await deleteModuleBundle(bundle.id);
            await loadData();
            if (result && result.is_active === false) {
              return "switched_off";
            }
            return "deleted";
          }}
          onSaveSettings={async (draft) => {
            await updateModuleSubscriptionSettings({
              subscription_months: Number(draft.subscription_months),
              renewal_notice_days: Number(draft.renewal_notice_days),
              payment_window_days: Number(draft.payment_window_days),
              payment_warning_days: Number(draft.payment_warning_days),
            });
            await loadData();
          }}
        />
        </div>
      ) : null}

      {activeTab === "billing" ? (
        <div className="space-y-3">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="app-panel p-3">
              <div className="flex items-center gap-2 text-muted">
                <CalendarDays className="h-4 w-4" />
                <p className="text-xs font-medium uppercase tracking-wide">{t("clubFeeBillingYearLabel")}</p>
              </div>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{billingYear || "—"}</p>
              <p className="mt-1 text-xs text-muted">{t("clubFeeBillingYearHint")}</p>
            </div>
            <div className="app-panel p-3">
              <div className="flex items-center gap-2 text-muted">
                <Building2 className="h-4 w-4" />
                <p className="text-xs font-medium uppercase tracking-wide">{t("clubFeeBillingSummaryClubs")}</p>
              </div>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{selectedClubCount}</p>
              <p className="mt-1 text-xs text-muted">
                {billAllActiveClubs ? t("clubFeeBillingAllActiveClubs") : t("clubFeeBillingPickClubs")}
              </p>
            </div>
            <div className="app-panel p-3">
              <div className="flex items-center gap-2 text-muted">
                <Receipt className="h-4 w-4" />
                <p className="text-xs font-medium uppercase tracking-wide">{t("clubFeeBillingSummaryBilled")}</p>
              </div>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{billedCount}</p>
              <p className="mt-1 text-xs text-muted">
                {t("clubFeeAlreadyBilledTitle", { year: billingYear || "—" })}
              </p>
            </div>
          </div>

          <FormPanel>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-section text-foreground">{t("clubFeeBillingTitle")}</h2>
                <p className="mt-1 max-w-2xl text-sm text-muted">{t("clubFeeBillingSubtitle")}</p>
              </div>
              <Button
                variant="primary"
                onClick={() => void submitBilling()}
                disabled={isBilling}
              >
                {t("clubFeeBillingSubmitYear", { year: billingYear || new Date().getFullYear() })}
              </Button>
            </div>

            <div className="mt-6 grid gap-4 rounded-[var(--radius-card)] border border-border bg-secondary/50 p-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="billing-year">{t("clubFeeBillingYearLabel")}</Label>
                <Input
                  id="billing-year"
                  value={billingYear}
                  onChange={(event) => setBillingYear(event.target.value.replace(/\D/g, "").slice(0, 4))}
                  inputMode="numeric"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="billing-date">{t("clubFeeBillingDateLabel")}</Label>
                <Input
                  id="billing-date"
                  type="date"
                  value={billingDate}
                  onChange={(event) => setBillingDate(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="billing-recurring">{t("clubFeeBillingRecurringLabel")}</Label>
                <label className="flex min-h-[var(--control-height)] items-center gap-2 rounded-[var(--radius-form)] border border-border bg-surface px-3 text-sm">
                  <Checkbox
                    id="billing-recurring"
                    checked={billingRecurring}
                    onCheckedChange={(value) => setBillingRecurring(Boolean(value))}
                  />
                  <Repeat className="h-4 w-4 text-muted" />
                  <span>{t("clubFeeBillingRecurringLabel")}</span>
                </label>
                {billingRecurring ? (
                  <Select
                    value={billingRecurrence}
                    onValueChange={(value) => setBillingRecurrence(value as "monthly" | "annual")}
                  >
                    <SelectTrigger aria-label={t("clubFeeBillingRecurrenceLabel")}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">{t("clubFeeBillingRecurrenceMonthly")}</SelectItem>
                      <SelectItem value="annual">{t("clubFeeBillingRecurrenceAnnual")}</SelectItem>
                    </SelectContent>
                  </Select>
                ) : null}
              </div>
            </div>

            <div className="mt-6">
              <p className="text-sm font-medium text-foreground">{t("clubFeeBillingFeesLabel")}</p>
              {activeFees.length === 0 ? (
                <p className="mt-3 text-sm text-muted">{t("clubFeeEmptySubtitle")}</p>
              ) : (
                <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {activeFees.map((fee) => {
                    const selected = selectedFeeIds.includes(fee.id);
                    const hasAmount = Boolean(fee.current_amount);
                    return (
                      <button
                        key={fee.id}
                        type="button"
                        onClick={() => toggleFeeId(fee.id)}
                        className={cn(
                          "rounded-[var(--radius-card)] border p-4 text-left transition-colors",
                          selected
                            ? "border-primary bg-[var(--accent-soft)]"
                            : "border-border bg-surface hover:border-primary/40"
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-semibold text-foreground">{feeDisplayName(fee)}</p>
                          {selected ? (
                            <span className="inline-flex h-5 items-center gap-1 rounded-[var(--radius-chip)] bg-primary px-1.5 text-xs font-medium uppercase tracking-wide text-primary-foreground">
                              <Check className="h-3 w-3" />
                              {t("clubFeeBillingFeeSelected")}
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-2 text-lg font-semibold text-foreground">
                          {hasAmount
                            ? `${fee.current_amount} ${fee.current_currency ?? "EUR"}`
                            : t("clubFeeNoAmountLabel")}
                        </p>
                        <p className="mt-1 text-xs text-muted">{cadenceLabel(fee.cadence)}</p>
                      </button>
                    );
                  })}
                </div>
              )}
              {activeFees.some((fee) => selectedFeeIds.includes(fee.id) && fee.module_id) ? (
                <p className="mt-3 text-sm text-muted">{t("moduleFeeBillingHint")}</p>
              ) : null}
            </div>

            <div className="mt-6">
              <p className="text-sm font-medium text-foreground">{t("clubFeeBillingClubsLabel")}</p>
              <label className="mt-3 flex items-center gap-2 rounded-[var(--radius-form)] border border-border bg-secondary/40 px-3 py-2 text-sm">
                <Checkbox
                  checked={billAllActiveClubs}
                  onCheckedChange={(value) => setBillAllActiveClubs(Boolean(value))}
                />
                {t("clubFeeBillingAllActiveClubs")}
              </label>
              {!billAllActiveClubs ? (
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {clubs.map((club) => {
                    const selected = selectedClubIds.includes(club.id);
                    return (
                      <label
                        key={club.id}
                        className={cn(
                          "flex items-center justify-between gap-3 rounded-[var(--radius-form)] border px-3 py-2 text-sm",
                          selected ? "border-primary bg-surface" : "border-border bg-surface"
                        )}
                      >
                        <span className="flex items-center gap-2">
                          <Checkbox
                            checked={selected}
                            onCheckedChange={() => toggleClubId(club.id)}
                          />
                          {club.name}
                        </span>
                        <StatusBadge
                          label={club.is_active ? t("clubStatusActive") : t("clubStatusInactive")}
                          tone={club.is_active ? "success" : "neutral"}
                        />
                      </label>
                    );
                  })}
                </div>
              ) : null}
            </div>

            <div
              className={cn(
                "mt-6 rounded-[var(--radius-card)] border px-3 py-2",
                billingRebill
                  ? "border-[var(--warning)] bg-[var(--badge-warning-bg)]"
                  : "border-border bg-secondary/40"
              )}
            >
              <label className="flex items-start gap-2 text-sm">
                <Checkbox
                  checked={billingRebill}
                  onCheckedChange={(value) => setBillingRebill(Boolean(value))}
                  className="mt-0.5"
                />
                <span>
                  <span className="flex items-center gap-2 font-medium text-foreground">
                    <TriangleAlert className="h-4 w-4" />
                    {t("clubFeeBillingRebillLabel")}
                  </span>
                  <span className="mt-1 block text-xs text-muted">{t("clubFeeBillingRebillHint")}</span>
                </span>
              </label>
            </div>

            <div className="mt-6">
              <p className="mb-3 text-sm font-medium text-foreground">
                {t("clubFeeAlreadyBilledTitle", { year: billingYear || "—" })}
              </p>
              {billingCharges.length === 0 ? (
                <p className="text-sm text-muted">{t("clubFeeBillingNoneYet")}</p>
              ) : (
                <EntityTable
                  columns={[
                    { key: "club_name", header: t("clubLabel") },
                    { key: "fee_name", header: t("invoiceItemLabel") },
                    { key: "invoice_number", header: t("invoiceNumberLabel") },
                    {
                      key: "invoice_status",
                      header: t("statusLabel"),
                      render: (row: ClubFeeChargeStatus) => (
                        <StatusBadge
                          label={
                            row.invoice_status === "paid"
                              ? t("clubFeeInvoicePaid")
                              : t("clubFeeInvoiceIssued")
                          }
                          tone={row.invoice_status === "paid" ? "success" : "warning"}
                        />
                      ),
                    },
                  ]}
                  rows={billingCharges.map((row) => ({
                    ...row,
                    id: `${row.invoice_number}-${row.fee_type_id}-${row.club_id}`,
                  }))}
                />
              )}
            </div>
          </FormPanel>

          <FormPanel>
            <h2 className="text-section text-foreground">{t("clubFeeBillingClubsLabel")}</h2>
            <p className="mt-1 text-sm text-muted">{t("clubStatusHint")}</p>
            <div className="mt-3">
              {clubs.length === 0 ? (
                <p className="text-sm text-muted">{t("clubFeeBillingPickClubs")}</p>
              ) : (
                <EntityTable
                  columns={[
                    { key: "name", header: t("clubLabel") },
                    {
                      key: "is_active",
                      header: t("statusLabel"),
                      render: (club: Club) => (
                        <StatusBadge
                          label={club.is_active ? t("clubStatusActive") : t("clubStatusInactive")}
                          tone={club.is_active ? "success" : "neutral"}
                        />
                      ),
                    },
                    {
                      key: "actions",
                      header: t("actionLabel"),
                      render: (club: Club) => (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void toggleClubActive(club, !club.is_active)}
                        >
                          {club.is_active ? t("clubStatusInactive") : t("clubStatusActive")}
                        </Button>
                      ),
                    },
                  ]}
                  rows={clubs}
                />
              )}
            </div>
          </FormPanel>

          <FormPanel>
            <h2 className="text-section text-foreground">{t("clubFeeSchedulesTitle")}</h2>
            {schedules.length === 0 ? (
              <p className="mt-3 text-sm text-muted">{t("clubFeeSchedulesEmpty")}</p>
            ) : (
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {schedules.map((schedule) => (
                  <div
                    key={schedule.id}
                    className="flex items-center justify-between gap-3 rounded-[var(--radius-card)] border border-border bg-secondary/40 px-3 py-2"
                  >
                    <div>
                      <p className="text-sm font-semibold text-foreground">{schedule.fee_type_name}</p>
                      <p className="mt-1 text-xs text-muted">
                        {schedule.recurrence === "monthly"
                          ? t("clubFeeBillingRecurrenceMonthly")
                          : t("clubFeeBillingRecurrenceAnnual")}
                        {" · "}
                        {t("clubFeeScheduleNextLabel")}: {formatDisplayDate(schedule.next_run_on)}
                      </p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => void toggleSchedule(schedule)}>
                      {schedule.is_active ? t("clubFeeSchedulePause") : t("clubFeeScheduleResume")}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </FormPanel>
        </div>
      ) : null}

      <ClubFeeFormPanel
        open={feeEditor !== null}
        fee={feeEditor && feeEditor !== "new" ? feeEditor : null}
        saving={isSavingFee}
        onClose={() => setFeeEditor(null)}
        onSubmit={saveFeeEditor}
      />
      <LicenseTypeFormPanel
        open={typePanel !== null}
        mode={typePanel?.mode ?? "create"}
        licenseTypeId={typePanel?.mode === "edit" ? typePanel.id : null}
        onClose={() => setTypePanel(null)}
        onSaved={async () => {
          setTypePanel(null);
          await loadData();
        }}
      />
      <DeleteConfirmModal
        isOpen={isDeleteOpen}
        title={common("deleteTitle", {
          item: feeTypeToDelete ? t("clubFeesTitle") : t("licenseTypeLabel"),
        })}
        description={common("deleteDescriptionWithName", {
          name: feeTypeToDelete?.name ?? licenseTypeToDelete?.name ?? "",
        })}
        confirmLabel={common("deleteConfirmButton")}
        cancelLabel={common("deleteCancelButton")}
        onConfirm={() => {
          void confirmDelete();
        }}
        onCancel={() => {
          setIsDeleteOpen(false);
          setLicenseTypeToDelete(null);
          setFeeTypeToDelete(null);
        }}
      />
    </LtfFinanceLayout>
  );
}
