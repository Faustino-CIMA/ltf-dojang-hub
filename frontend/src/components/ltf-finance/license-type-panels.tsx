"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PopoverSelect } from "@/components/ui/popover-select";
import { SidePanel } from "@/components/ui/side-panel";
import {
  FinanceLicenseType,
  LicenseTypePolicy,
  createFinanceLicenseType,
  getFinanceLicenseTypePolicy,
  getFinanceLicenseTypes,
  updateFinanceLicenseType,
  updateFinanceLicenseTypePolicy,
} from "@/lib/ltf-finance-api";

const TYPE_FORM_ID = "license-type-form";
const WINDOW_FORM_ID = "order-window-form";

type PolicyFormState = {
  allow_current_year_order: boolean;
  current_start_month: number;
  current_start_day: number;
  current_end_month: number;
  current_end_day: number;
  allow_next_year_preorder: boolean;
  next_start_month: number;
  next_start_day: number;
  next_end_month: number;
  next_end_day: number;
};

const DEFAULT_POLICY: PolicyFormState = {
  allow_current_year_order: true,
  current_start_month: 1,
  current_start_day: 1,
  current_end_month: 12,
  current_end_day: 31,
  allow_next_year_preorder: false,
  next_start_month: 9,
  next_start_day: 1,
  next_end_month: 12,
  next_end_day: 31,
};

function getMaxDaysInMonth(month: number) {
  return new Date(2024, month, 0).getDate();
}

function toPolicyForm(policy: LicenseTypePolicy): PolicyFormState {
  return {
    allow_current_year_order: policy.allow_current_year_order,
    current_start_month: policy.current_start_month,
    current_start_day: policy.current_start_day,
    current_end_month: policy.current_end_month,
    current_end_day: policy.current_end_day,
    allow_next_year_preorder: policy.allow_next_year_preorder,
    next_start_month: policy.next_start_month,
    next_start_day: policy.next_start_day,
    next_end_month: policy.next_end_month,
    next_end_day: policy.next_end_day,
  };
}

function MonthDayFields({
  month,
  day,
  disabled,
  monthLabel,
  dayLabel,
  monthOptions,
  onMonthChange,
  onDayChange,
}: {
  month: number;
  day: number;
  disabled: boolean;
  monthLabel: string;
  dayLabel: string;
  monthOptions: { value: string; label: string }[];
  onMonthChange: (value: string) => void;
  onDayChange: (value: string) => void;
}) {
  const dayOptions = Array.from({ length: getMaxDaysInMonth(month) }, (_, index) => index + 1);
  return (
    <div className="grid grid-cols-2 gap-2">
      <PopoverSelect
        className="w-full"
        value={String(month)}
        onValueChange={onMonthChange}
        ariaLabel={monthLabel}
        placeholder={monthLabel}
        disabled={disabled}
        options={monthOptions}
      />
      <PopoverSelect
        className="w-full"
        value={String(day)}
        onValueChange={onDayChange}
        ariaLabel={dayLabel}
        placeholder={dayLabel}
        disabled={disabled}
        options={dayOptions.map((option) => ({ value: String(option), label: String(option) }))}
      />
    </div>
  );
}

export function LicenseTypeFormPanel({
  open,
  mode,
  licenseTypeId,
  onClose,
  onSaved,
}: {
  open: boolean;
  mode: "create" | "edit";
  licenseTypeId?: number | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const t = useTranslations("LtfFinance");
  const common = useTranslations("Common");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [initialPriceAmount, setInitialPriceAmount] = useState("");
  const [initialPriceEffectiveFrom, setInitialPriceEffectiveFrom] = useState("");
  const [initialPriceIsFree, setInitialPriceIsFree] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    setErrorMessage(null);
    if (mode === "create") {
      setName("");
      setCode("");
      setInitialPriceAmount("");
      setInitialPriceEffectiveFrom("");
      setInitialPriceIsFree(false);
      return;
    }
    if (!licenseTypeId) {
      return;
    }
    let cancelled = false;
    void getFinanceLicenseTypes()
      .then((rows) => {
        if (cancelled) {
          return;
        }
        const match = rows.find((row) => row.id === licenseTypeId);
        setName(match?.name ?? "");
        setCode(match?.code ?? "");
      })
      .catch((error) => {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : t("licenseSettingsLoadError"));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, mode, licenseTypeId, t]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setErrorMessage(t("licenseTypeNameRequiredError"));
      return;
    }
    setIsSaving(true);
    setErrorMessage(null);
    try {
      if (mode === "edit" && licenseTypeId) {
        await updateFinanceLicenseType(licenseTypeId, { name: trimmedName });
      } else {
        const normalizedInitialAmount = initialPriceIsFree ? "0.00" : initialPriceAmount.trim();
        if (!normalizedInitialAmount) {
          setErrorMessage(t("initialPriceRequiredError"));
          setIsSaving(false);
          return;
        }
        await createFinanceLicenseType({
          name: trimmedName,
          initial_price_amount: normalizedInitialAmount,
          initial_price_currency: "EUR",
          initial_price_effective_from: initialPriceEffectiveFrom || undefined,
        });
      }
      await onSaved();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("licenseTypeSaveError"));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SidePanel
      open={open}
      wide
      title={mode === "edit" ? t("licenseTypeLabel") : t("createLicenseType")}
      description={mode === "edit" ? t("licenseTypeDetailSubtitle") : t("licenseTypeFormSubtitle")}
      closeLabel={common("modalClose")}
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>
            {common("deleteCancelButton")}
          </Button>
          <Button type="submit" form={TYPE_FORM_ID} disabled={isSaving}>
            {isSaving ? t("savingAction") : mode === "edit" ? t("saveChanges") : t("createLicenseType")}
          </Button>
        </>
      }
    >
      <form id={TYPE_FORM_ID} className="space-y-3" onSubmit={handleSubmit}>
        {errorMessage ? <p className="text-sm text-destructive">{errorMessage}</p> : null}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="license-type-name" required>
              {t("licenseTypeNameLabel")}
            </Label>
            <Input
              id="license-type-name"
              value={name}
              placeholder={t("licenseTypeNamePlaceholder")}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          {mode === "edit" ? (
            <div className="space-y-2">
              <Label htmlFor="license-type-code">{t("licenseTypeCodeLabel")}</Label>
              <Input id="license-type-code" value={code} disabled />
            </div>
          ) : null}
        </div>
        {mode === "create" ? (
          <div className="space-y-3 rounded-[var(--radius-card)] border border-border p-4">
            <p className="text-sm font-medium text-foreground">{t("initialPriceSectionLabel")}</p>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <Checkbox
                checked={initialPriceIsFree}
                onCheckedChange={(checked) => {
                  const nextValue = checked === true;
                  setInitialPriceIsFree(nextValue);
                  setInitialPriceAmount(nextValue ? "0.00" : "");
                }}
              />
              {t("initialPriceFreeLabel")}
            </label>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="license-type-price" required>
                  {t("priceAmountLabel")}
                </Label>
                <Input
                  id="license-type-price"
                  value={initialPriceAmount}
                  placeholder="0.00"
                  inputMode="decimal"
                  disabled={initialPriceIsFree}
                  onChange={(event) => setInitialPriceAmount(event.target.value)}
                />
                <p className="text-xs text-muted">{t("initialPriceHint")}</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="license-type-effective">{t("priceEffectiveFromLabel")}</Label>
                <Input
                  id="license-type-effective"
                  type="date"
                  value={initialPriceEffectiveFrom}
                  onChange={(event) => setInitialPriceEffectiveFrom(event.target.value)}
                />
                <p className="text-xs text-muted">{t("priceEffectiveFromHint")}</p>
              </div>
            </div>
          </div>
        ) : null}
      </form>
    </SidePanel>
  );
}

export function OrderWindowPanel({
  open,
  licenseTypeId,
  licenseTypeName,
  onClose,
  onSaved,
}: {
  open: boolean;
  licenseTypeId: number | null;
  licenseTypeName?: string;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const t = useTranslations("LtfFinance");
  const common = useTranslations("Common");
  const locale = useLocale();
  const [policyForm, setPolicyForm] = useState<PolicyFormState>(DEFAULT_POLICY);
  const [resolvedName, setResolvedName] = useState(licenseTypeName ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !licenseTypeId) {
      return;
    }
    let cancelled = false;
    setErrorMessage(null);
    setResolvedName(licenseTypeName ?? "");
    void Promise.all([getFinanceLicenseTypePolicy(licenseTypeId), getFinanceLicenseTypes()])
      .then(([policy, types]) => {
        if (cancelled) {
          return;
        }
        setPolicyForm(toPolicyForm(policy));
        const match = types.find((row: FinanceLicenseType) => row.id === licenseTypeId);
        if (match) {
          setResolvedName(match.name);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : t("licenseSettingsLoadError"));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, licenseTypeId, licenseTypeName, t]);

  const monthOptions = useMemo(() => {
    const formatter = new Intl.DateTimeFormat(locale, { month: "long" });
    return Array.from({ length: 12 }, (_, index) => ({
      value: String(index + 1),
      label: formatter.format(new Date(2024, index, 1)),
    }));
  }, [locale]);

  const setMonth = (field: "current_start" | "current_end" | "next_start" | "next_end", value: string) => {
    const month = Number(value);
    setPolicyForm((previous) => ({
      ...previous,
      [`${field}_month`]: month,
      [`${field}_day`]: Math.min(previous[`${field}_day`], getMaxDaysInMonth(month)),
    }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!licenseTypeId) {
      return;
    }
    setIsSaving(true);
    setErrorMessage(null);
    try {
      await updateFinanceLicenseTypePolicy(licenseTypeId, policyForm);
      await onSaved();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("licenseTypeSaveError"));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SidePanel
      open={open}
      wide
      title={t("editPolicyAction")}
      description={resolvedName || t("licenseTypeDetailSubtitle")}
      closeLabel={common("modalClose")}
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>
            {common("deleteCancelButton")}
          </Button>
          <Button type="submit" form={WINDOW_FORM_ID} disabled={isSaving}>
            {isSaving ? t("savingAction") : t("saveChanges")}
          </Button>
        </>
      }
    >
      <form id={WINDOW_FORM_ID} className="space-y-3" onSubmit={handleSubmit}>
        {errorMessage ? <p className="text-sm text-destructive">{errorMessage}</p> : null}
        <section className="space-y-3 rounded-[var(--radius-card)] border border-border p-4">
          <label className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Checkbox
              checked={policyForm.allow_current_year_order}
              onCheckedChange={(checked) =>
                setPolicyForm((previous) => ({ ...previous, allow_current_year_order: checked === true }))
              }
            />
            {t("allowCurrentYearOrderingLabel")}
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{t("windowStartLabel")}</Label>
              <MonthDayFields
                month={policyForm.current_start_month}
                day={policyForm.current_start_day}
                disabled={!policyForm.allow_current_year_order}
                monthLabel={t("monthLabel")}
                dayLabel={t("dayLabel")}
                monthOptions={monthOptions}
                onMonthChange={(value) => setMonth("current_start", value)}
                onDayChange={(value) =>
                  setPolicyForm((previous) => ({ ...previous, current_start_day: Number(value) }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>{t("windowEndLabel")}</Label>
              <MonthDayFields
                month={policyForm.current_end_month}
                day={policyForm.current_end_day}
                disabled={!policyForm.allow_current_year_order}
                monthLabel={t("monthLabel")}
                dayLabel={t("dayLabel")}
                monthOptions={monthOptions}
                onMonthChange={(value) => setMonth("current_end", value)}
                onDayChange={(value) =>
                  setPolicyForm((previous) => ({ ...previous, current_end_day: Number(value) }))
                }
              />
            </div>
          </div>
        </section>
        <section className="space-y-3 rounded-[var(--radius-card)] border border-border p-4">
          <label className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Checkbox
              checked={policyForm.allow_next_year_preorder}
              onCheckedChange={(checked) =>
                setPolicyForm((previous) => ({ ...previous, allow_next_year_preorder: checked === true }))
              }
            />
            {t("allowNextYearPreorderLabel")}
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{t("windowStartLabel")}</Label>
              <MonthDayFields
                month={policyForm.next_start_month}
                day={policyForm.next_start_day}
                disabled={!policyForm.allow_next_year_preorder}
                monthLabel={t("monthLabel")}
                dayLabel={t("dayLabel")}
                monthOptions={monthOptions}
                onMonthChange={(value) => setMonth("next_start", value)}
                onDayChange={(value) =>
                  setPolicyForm((previous) => ({ ...previous, next_start_day: Number(value) }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>{t("windowEndLabel")}</Label>
              <MonthDayFields
                month={policyForm.next_end_month}
                day={policyForm.next_end_day}
                disabled={!policyForm.allow_next_year_preorder}
                monthLabel={t("monthLabel")}
                dayLabel={t("dayLabel")}
                monthOptions={monthOptions}
                onMonthChange={(value) => setMonth("next_end", value)}
                onDayChange={(value) => setPolicyForm((previous) => ({ ...previous, next_end_day: Number(value) }))}
              />
            </div>
          </div>
        </section>
      </form>
    </SidePanel>
  );
}
