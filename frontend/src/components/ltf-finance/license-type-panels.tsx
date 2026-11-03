"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PopoverSelect } from "@/components/ui/popover-select";
import { SidePanel } from "@/components/ui/side-panel";
import { exampleExpiryDate, type ValidityMode } from "@/lib/license-validity";
import {
  createFinanceLicenseType,
  getFinanceLicenseTypes,
  updateFinanceLicenseType,
  type LicenseTypePolicy,
} from "@/lib/ltf-finance-api";

const TYPE_FORM_ID = "license-type-form";

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
  validity_mode: ValidityMode;
  duration_years: number;
  duration_days: number;
  reminders_enabled: boolean;
  reminder_offsets: number[];
};

const DEFAULT_POLICY: PolicyFormState = {
  allow_current_year_order: true,
  current_start_month: 1,
  current_start_day: 1,
  current_end_month: 12,
  current_end_day: 31,
  allow_next_year_preorder: false,
  next_start_month: 12,
  next_start_day: 1,
  next_end_month: 12,
  next_end_day: 31,
  validity_mode: "calendar_year",
  duration_years: 1,
  duration_days: 0,
  reminders_enabled: false,
  reminder_offsets: [60, 30, 7],
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
    validity_mode: policy.validity_mode ?? "calendar_year",
    duration_years: policy.duration_years ?? 1,
    duration_days: policy.duration_days ?? 0,
    reminders_enabled: policy.reminders_enabled ?? false,
    reminder_offsets: policy.reminder_offsets?.length ? policy.reminder_offsets : [60, 30, 7],
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
  const locale = useLocale();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [initialPriceAmount, setInitialPriceAmount] = useState("");
  const [initialPriceEffectiveFrom, setInitialPriceEffectiveFrom] = useState("");
  const [initialPriceIsFree, setInitialPriceIsFree] = useState(false);
  const [policyForm, setPolicyForm] = useState<PolicyFormState>(DEFAULT_POLICY);
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
      setPolicyForm(DEFAULT_POLICY);
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
        setPolicyForm(match?.policy ? toPolicyForm(match.policy) : DEFAULT_POLICY);
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

  const monthOptions = useMemo(() => {
    const formatter = new Intl.DateTimeFormat(locale, { month: "long" });
    return Array.from({ length: 12 }, (_, index) => ({
      value: String(index + 1),
      label: formatter.format(new Date(2024, index, 1)),
    }));
  }, [locale]);

  const preview = useMemo(() => {
    const years = Number.isFinite(policyForm.duration_years) ? policyForm.duration_years : 0;
    const days = Number.isFinite(policyForm.duration_days) ? policyForm.duration_days : 0;
    const expiry = exampleExpiryDate(policyForm.validity_mode, years, days);
    const today = new Date();
    const formatter = new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric" });
    return t("validityPreview", {
      date: formatter.format(today),
      expiry: formatter.format(expiry),
    });
  }, [locale, policyForm.duration_days, policyForm.duration_years, policyForm.validity_mode, t]);

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
    const trimmedName = name.trim();
    if (!trimmedName) {
      setErrorMessage(t("licenseTypeNameRequiredError"));
      return;
    }
    if (
      policyForm.validity_mode === "duration" &&
      policyForm.duration_years === 0 &&
      policyForm.duration_days === 0
    ) {
      setErrorMessage(t("durationInvalid"));
      return;
    }
    if (policyForm.duration_days < 0 || policyForm.duration_days > 366 || policyForm.duration_years < 0) {
      setErrorMessage(t("durationInvalid"));
      return;
    }
    const offsets = policyForm.reminder_offsets;
    const uniqueOffsets = new Set(offsets);
    if (
      offsets.length > 5 ||
      uniqueOffsets.size !== offsets.length ||
      offsets.some((offset) => !Number.isInteger(offset) || offset < 1 || offset > 365)
    ) {
      setErrorMessage(t("offsetsInvalid"));
      return;
    }
    setIsSaving(true);
    setErrorMessage(null);
    const policy = {
      ...policyForm,
      duration_years: policyForm.validity_mode === "duration" ? policyForm.duration_years : 0,
      duration_days: policyForm.validity_mode === "duration" ? policyForm.duration_days : 0,
    };
    try {
      if (mode === "edit" && licenseTypeId) {
        await updateFinanceLicenseType(licenseTypeId, { name: trimmedName, policy });
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
          policy,
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

        <section className="space-y-3 rounded-[var(--radius-card)] border border-border p-4">
          <p className="text-sm font-medium text-foreground">{t("validitySectionLabel")}</p>
          <div className="space-y-2">
            <Label required>{t("validityModeLabel")}</Label>
            <PopoverSelect
              className="w-full"
              value={policyForm.validity_mode}
              onValueChange={(value) =>
                setPolicyForm((previous) => ({ ...previous, validity_mode: value as ValidityMode }))
              }
              ariaLabel={t("validityModeLabel")}
              options={[
                { value: "calendar_year", label: t("validityCalendarYear") },
                { value: "duration", label: t("validityDuration") },
              ]}
            />
          </div>
          {policyForm.validity_mode === "duration" ? (
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="duration-years" required>
                  {t("durationYearsLabel")}
                </Label>
                <Input
                  id="duration-years"
                  type="number"
                  min={0}
                  value={String(policyForm.duration_years)}
                  onChange={(event) =>
                    setPolicyForm((previous) => ({
                      ...previous,
                      duration_years: Math.max(0, Number(event.target.value) || 0),
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="duration-days" required>
                  {t("durationDaysLabel")}
                </Label>
                <Input
                  id="duration-days"
                  type="number"
                  min={0}
                  max={366}
                  value={String(policyForm.duration_days)}
                  onChange={(event) =>
                    setPolicyForm((previous) => ({
                      ...previous,
                      duration_days: Math.min(366, Math.max(0, Number(event.target.value) || 0)),
                    }))
                  }
                />
              </div>
            </div>
          ) : null}
          <p className="text-sm text-muted">{preview}</p>
        </section>

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

        <section className="space-y-3 rounded-[var(--radius-card)] border border-border p-4">
          <label className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Checkbox
              checked={policyForm.reminders_enabled}
              onCheckedChange={(checked) =>
                setPolicyForm((previous) => ({ ...previous, reminders_enabled: checked === true }))
              }
            />
            {t("remindersEnabledLabel")}
          </label>
          <p className="text-xs text-muted">{t("remindersNotSentYet")}</p>
          <div className="space-y-2">
            <Label>{t("reminderOffsetsLabel")}</Label>
            <div className="flex flex-wrap gap-2">
              {policyForm.reminder_offsets.map((offset, index) => (
                <div key={`${index}-${offset}`} className="flex items-center gap-1">
                  <Input
                    className="w-24"
                    type="number"
                    min={1}
                    max={365}
                    disabled={!policyForm.reminders_enabled}
                    aria-label={t("reminderOffsetsLabel")}
                    value={String(offset)}
                    onChange={(event) => {
                      const next = [...policyForm.reminder_offsets];
                      next[index] = Math.max(1, Math.min(365, Number(event.target.value) || 1));
                      setPolicyForm((previous) => ({ ...previous, reminder_offsets: next }));
                    }}
                  />
                  {policyForm.reminder_offsets.length > 1 ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!policyForm.reminders_enabled}
                      onClick={() =>
                        setPolicyForm((previous) => ({
                          ...previous,
                          reminder_offsets: previous.reminder_offsets.filter((_, item) => item !== index),
                        }))
                      }
                    >
                      {t("reminderOffsetRemove")}
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>
            {policyForm.reminder_offsets.length < 5 ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!policyForm.reminders_enabled}
                onClick={() =>
                  setPolicyForm((previous) => ({
                    ...previous,
                    reminder_offsets: [...previous.reminder_offsets, 14],
                  }))
                }
              >
                {t("reminderOffsetAdd")}
              </Button>
            ) : null}
          </div>
        </section>
      </form>
    </SidePanel>
  );
}
