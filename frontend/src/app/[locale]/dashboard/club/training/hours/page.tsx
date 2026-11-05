"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { EntityTable } from "@/components/club-admin/entity-table";
import { ClubAdminLayout } from "@/components/club-admin/club-admin-layout";
import { EmptyState } from "@/components/club-admin/empty-state";
import { useCanManageTraining } from "@/components/club-admin/use-training-access";
import { useClubSelection } from "@/components/club-selection-provider";
import { Button } from "@/components/ui/button";
import { DeleteConfirmModal } from "@/components/ui/delete-confirm-modal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ActionNotices, FormPanel } from "@/components/ui/list-page-chrome";
import { PopoverSelect } from "@/components/ui/popover-select";
import { RowActionMenu } from "@/components/ui/row-action-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SidePanel } from "@/components/ui/side-panel";
import {
  deleteCoachOuting,
  deleteCoachPayRate,
  getCoachHours,
  saveCoachOuting,
  saveCoachPayRate,
  savePaydays,
  type CoachHourReport,
  type CoachOutingRow,
  type CoachPayBasis,
  type CoachPayRateRow,
  type PayFrequency,
} from "@/lib/training-api";

const PAY_FREQUENCIES: { value: PayFrequency; label: "trainingPayMonthly" | "trainingPayQuarterly" | "trainingPayTwice" }[] = [
  { value: "monthly", label: "trainingPayMonthly" },
  { value: "quarterly", label: "trainingPayQuarterly" },
  { value: "twice", label: "trainingPayTwice" },
];
const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

type RateDraft = { basis: CoachPayBasis; rate: string };
type OutingDraft = {
  id: number | null;
  coachId: string;
  heldOn: string;
  name: string;
  quantity: string;
  coachingAmount: string;
  fuel: string;
  hotel: string;
};

function emptyOuting(): OutingDraft {
  return { id: null, coachId: "", heldOn: "", name: "", quantity: "", coachingAmount: "", fuel: "", hotel: "" };
}

const RATE_FORM_ID = "coach-rate-form";
const OUTING_FORM_ID = "coach-outing-form";

function monthName(month: number, locale: string) {
  return new Date(2026, month - 1, 1).toLocaleDateString(locale, { month: "long" });
}

function euros(value: string, locale: string) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "—";
  return new Intl.NumberFormat(locale === "lb" ? "de-LU" : "en-GB", { style: "currency", currency: "EUR" }).format(amount);
}

export default function TrainingHoursPage() {
  const t = useTranslations("ClubAdmin");
  const common = useTranslations("Common");
  const locale = useLocale();
  const canManage = useCanManageTraining();
  const { selectedClubId } = useClubSelection();
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [report, setReport] = useState<CoachHourReport | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [rateOpen, setRateOpen] = useState(false);
  const [rateTarget, setRateTarget] = useState<CoachPayRateRow | null>(null);
  const [rateDraft, setRateDraft] = useState<RateDraft>({ basis: "hourly", rate: "" });
  const [savingRateId, setSavingRateId] = useState<number | null>(null);
  const [pendingRate, setPendingRate] = useState<CoachPayRateRow | null>(null);
  const [outingOpen, setOutingOpen] = useState(false);
  const [outing, setOuting] = useState<OutingDraft>(emptyOuting);
  const [isSavingOuting, setIsSavingOuting] = useState(false);
  const [pendingOuting, setPendingOuting] = useState<CoachOutingRow | null>(null);
  const reportYear = Number(year) || new Date().getFullYear();

  const load = useCallback(async () => {
    if (!selectedClubId) return;
    try {
      setReport(await getCoachHours(selectedClubId, reportYear));
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("loadError"));
      setReport(null);
    }
  }, [reportYear, selectedClubId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setOuting(emptyOuting());
  }, [selectedClubId, year]);

  const save = async () => {
    if (!selectedClubId || !report) return;
    setIsSaving(true);
    setSuccessMessage(null);
    try {
      setReport(await savePaydays(selectedClubId, reportYear, {
        pay_frequency: report.pay_frequency,
        payday_day: report.payday_day,
        quarter_anchor_month: report.quarter_anchor_month,
        first_payday_month: report.first_payday_month,
        first_payday_day: report.first_payday_day,
        second_payday_month: report.second_payday_month,
        second_payday_day: report.second_payday_day,
      }));
      setErrorMessage(null);
      setSuccessMessage(t("trainingPaydaysSaved"));
    } catch (error) {
      setSuccessMessage(null);
      setErrorMessage(error instanceof Error ? error.message : t("saveError"));
    } finally {
      setIsSaving(false);
    }
  };

  const openRate = (row: CoachPayRateRow) => {
    setRateTarget(row);
    setRateDraft({ basis: row.basis === "" ? "hourly" : row.basis, rate: row.rate });
    setRateOpen(true);
  };

  const saveRate = async () => {
    if (!selectedClubId || !rateTarget) return;
    setSavingRateId(rateTarget.user_id);
    setSuccessMessage(null);
    try {
      setReport(await saveCoachPayRate(selectedClubId, reportYear, {
        coach_id: rateTarget.user_id,
        basis: rateDraft.basis,
        rate: rateDraft.rate.trim() === "" ? "0" : rateDraft.rate,
      }));
      setRateOpen(false);
      setRateTarget(null);
      setErrorMessage(null);
      setSuccessMessage(t("trainingRateSaved"));
    } catch (error) {
      setSuccessMessage(null);
      setErrorMessage(error instanceof Error ? error.message : t("saveError"));
    } finally {
      setSavingRateId(null);
    }
  };

  const confirmRemoveRate = async () => {
    if (!selectedClubId || !pendingRate) return;
    setSavingRateId(pendingRate.user_id);
    setSuccessMessage(null);
    try {
      setReport(await deleteCoachPayRate(selectedClubId, reportYear, pendingRate.user_id));
      if (rateTarget?.user_id === pendingRate.user_id) {
        setRateOpen(false);
        setRateTarget(null);
      }
      setPendingRate(null);
      setErrorMessage(null);
      setSuccessMessage(t("trainingRateRemoved"));
    } catch (error) {
      setSuccessMessage(null);
      setPendingRate(null);
      setErrorMessage(error instanceof Error ? error.message : t("saveError"));
    } finally {
      setSavingRateId(null);
    }
  };

  const saveOuting = async () => {
    if (!selectedClubId || outing.coachId === "" || outing.heldOn === "" || outing.name.trim() === "") return;
    setIsSavingOuting(true);
    setSuccessMessage(null);
    const name = outing.name.trim();
    try {
      const saved = await saveCoachOuting(
        selectedClubId,
        reportYear,
        {
          coach_id: Number(outing.coachId),
          held_on: outing.heldOn,
          name,
          quantity: outing.quantity.trim() === "" ? "0" : outing.quantity,
          coaching_amount: outing.coachingAmount.trim() === "" ? null : outing.coachingAmount,
          fuel_amount: outing.fuel.trim() === "" ? "0" : outing.fuel,
          hotel_amount: outing.hotel.trim() === "" ? "0" : outing.hotel,
        },
        outing.id ?? undefined,
      );
      const visible = saved.outings?.some(
        (row) => row.user_id === Number(outing.coachId) && row.held_on === outing.heldOn && row.tournament === name,
      );
      setReport(saved);
      setOuting(emptyOuting());
      setOutingOpen(false);
      setErrorMessage(null);
      setSuccessMessage(visible ? t("trainingOutingSaved") : t("trainingOutingSavedOtherYear"));
    } catch (error) {
      setSuccessMessage(null);
      setErrorMessage(error instanceof Error ? error.message : t("saveError"));
    } finally {
      setIsSavingOuting(false);
    }
  };

  const beginOutingEdit = (row: CoachOutingRow) => {
    setOuting({
      id: row.id,
      coachId: String(row.user_id),
      heldOn: row.held_on,
      name: row.tournament,
      quantity: row.quantity,
      coachingAmount: row.coaching_amount ?? "",
      fuel: row.fuel_amount,
      hotel: row.hotel_amount,
    });
    setOutingOpen(true);
  };

  const openNewOuting = () => {
    setOuting(emptyOuting());
    setOutingOpen(true);
  };

  const confirmRemoveOuting = async () => {
    if (!selectedClubId || !pendingOuting) return;
    setSuccessMessage(null);
    try {
      setReport(await deleteCoachOuting(selectedClubId, reportYear, pendingOuting.id));
      if (outing.id === pendingOuting.id) {
        setOuting(emptyOuting());
        setOutingOpen(false);
      }
      setPendingOuting(null);
      setErrorMessage(null);
      setSuccessMessage(t("trainingOutingRemoved"));
    } catch (error) {
      setSuccessMessage(null);
      setPendingOuting(null);
      setErrorMessage(error instanceof Error ? error.message : t("saveError"));
    }
  };

  const paydayFields = (which: "first" | "second") => {
    if (!report) return null;
    const monthKey = which === "first" ? "first_payday_month" : "second_payday_month";
    const dayKey = which === "first" ? "first_payday_day" : "second_payday_day";
    return (
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label>{t("trainingPaydayMonth")}</Label>
          <Input
            className="mt-1"
            inputMode="numeric"
            disabled={!canManage}
            value={String(report[monthKey])}
            onChange={(event) => setReport({ ...report, [monthKey]: Number(event.target.value) })}
          />
        </div>
        <div>
          <Label>{t("trainingPaydayDay")}</Label>
          <Input
            className="mt-1"
            inputMode="numeric"
            disabled={!canManage}
            value={String(report[dayKey])}
            onChange={(event) => setReport({ ...report, [dayKey]: Number(event.target.value) })}
          />
        </div>
      </div>
    );
  };

  const showPay = report?.rates !== undefined && report.outings !== undefined;
  const rates = report?.rates ?? [];
  const outings = report?.outings ?? [];
  const selectedBasis = rates.find((row) => String(row.user_id) === outing.coachId)?.basis ?? "";
  const quantityLabel =
    selectedBasis === "unit"
      ? t("trainingOutingQuantityUnits")
      : selectedBasis === "hourly"
        ? t("trainingOutingQuantityHours")
        : t("trainingOutingQuantityUnknown");

  return (
    <ClubAdminLayout title={t("trainingTitle")} subtitle={t("trainingCoachHours")}>
      {!selectedClubId ? (
        <EmptyState title={t("selectClubPlaceholder")} description={t("trainingChooseClub")} />
      ) : (
        <div className="space-y-3">
          <ActionNotices
            error={errorMessage}
            success={successMessage}
            onDismiss={() => {
              setErrorMessage(null);
              setSuccessMessage(null);
            }}
          />
          <div className="max-w-xs rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-4">
            <Label>{t("subsidiesYear")}</Label>
            <Input className="mt-1" value={year} onChange={(event) => setYear(event.target.value)} />
          </div>
          {!report && !errorMessage ? (
            <EmptyState title={t("loadingTitle")} description={t("loadingSubtitle")} loading />
          ) : report ? (
            <>
              <FormPanel>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="flex flex-col gap-2">
                    <Label>{t("trainingPayFrequency")}</Label>
                    <Select
                      value={report.pay_frequency}
                      onValueChange={(value) => setReport({ ...report, pay_frequency: value as PayFrequency })}
                      disabled={!canManage}
                    >
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {PAY_FREQUENCIES.map((item) => (
                          <SelectItem key={item.value} value={item.value}>{t(item.label)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {report.pay_frequency === "twice" ? (
                    <>
                      <div />
                      <div>
                        <h2 className="text-section text-foreground">{t("trainingFirstPayday")}</h2>
                        <div className="mt-3">{paydayFields("first")}</div>
                      </div>
                      <div>
                        <h2 className="text-section text-foreground">{t("trainingSecondPayday")}</h2>
                        <div className="mt-3">{paydayFields("second")}</div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <Label>{t("trainingPaydayDayOfMonth")}</Label>
                        <Input
                          className="mt-1"
                          inputMode="numeric"
                          disabled={!canManage}
                          value={String(report.payday_day)}
                          onChange={(event) => setReport({ ...report, payday_day: Number(event.target.value) })}
                        />
                      </div>
                      {report.pay_frequency === "quarterly" ? (
                        <div className="flex flex-col gap-2">
                          <Label>{t("trainingQuarterAnchor")}</Label>
                          <Select
                            value={String(report.quarter_anchor_month)}
                            onValueChange={(value) => setReport({ ...report, quarter_anchor_month: Number(value) })}
                            disabled={!canManage}
                          >
                            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {MONTHS.map((month) => (
                                <SelectItem key={month} value={String(month)}>{monthName(month, locale)}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
                <p className="mt-3 text-xs text-muted">
                  {report.pay_frequency === "monthly"
                    ? t("trainingMonthlyHint")
                    : report.pay_frequency === "quarterly"
                      ? t("trainingQuarterHint")
                      : t("trainingPaydayHint")}
                </p>
                <p className="mt-1 text-xs text-muted">{report.pay_frequency === "twice" ? null : t("trainingPaydayHint")}</p>
                {canManage ? (
                  <Button className="mt-4" type="button" variant="primary" disabled={isSaving} onClick={() => void save()}>
                    {isSaving ? t("saving") : t("trainingSavePaydays")}
                  </Button>
                ) : null}
              </FormPanel>
              {showPay ? (
                <FormPanel>
                  <h2 className="text-section text-foreground">{t("trainingPayRateTitle")}</h2>
                  <p className="mt-2 text-sm text-muted">{t("trainingPayRateHint")}</p>
                  {rates.length === 0 ? (
                    <p className="mt-3 text-sm text-muted">{t("trainingNoCoaches")}</p>
                  ) : (
                    <div className="mt-3">
                      <EntityTable
                        rows={rates.map((row) => ({ ...row, id: row.user_id }))}
                        onRowClick={canManage ? openRate : undefined}
                        columns={[
                          { key: "name", header: t("trainingCoachColumn") },
                          {
                            key: "basis",
                            header: t("trainingBasisColumn"),
                            render: (row) =>
                              row.basis === "hourly"
                                ? t("trainingBasisHourly")
                                : row.basis === "unit"
                                  ? t("trainingBasisUnit")
                                  : t("trainingNoRate"),
                          },
                          {
                            key: "rate",
                            header: t("trainingRateColumn"),
                            render: (row) => (row.basis === "" ? "—" : euros(row.rate, locale)),
                          },
                          ...(canManage
                            ? [
                                {
                                  key: "actions",
                                  header: "",
                                  render: (row: CoachPayRateRow & { id: number }) => (
                                    <RowActionMenu
                                      label={common("rowActionsLabel")}
                                      actions={[
                                        {
                                          key: "edit",
                                          label: t("editAction"),
                                          onSelect: () => openRate(row),
                                        },
                                        ...(row.basis !== ""
                                          ? [
                                              {
                                                key: "delete",
                                                label: t("trainingRemove"),
                                                destructive: true,
                                                disabled: savingRateId === row.user_id,
                                                onSelect: () => setPendingRate(row),
                                              },
                                            ]
                                          : []),
                                      ]}
                                    />
                                  ),
                                },
                              ]
                            : []),
                        ]}
                      />
                    </div>
                  )}
                </FormPanel>
              ) : null}
              {showPay ? (
                <FormPanel>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 className="text-section text-foreground">{t("trainingOutingsTitle")}</h2>
                    {canManage ? (
                      <Button type="button" variant="primary" onClick={openNewOuting}>
                        {t("trainingAddOuting")}
                      </Button>
                    ) : null}
                  </div>
                  <p className="mt-2 text-sm text-muted">{t("trainingOutingsHint")}</p>
                  {outings.length === 0 ? (
                    <p className="mt-3 text-sm text-muted">{t("trainingNoOutings")}</p>
                  ) : (
                    <div className="mt-3">
                      <EntityTable
                        rows={outings}
                        onRowClick={canManage ? beginOutingEdit : undefined}
                        columns={[
                          { key: "held_on", header: t("trainingDate") },
                          { key: "name", header: t("trainingCoachColumn") },
                          { key: "tournament", header: t("trainingTournamentName") },
                          {
                            key: "quantity",
                            header: t("trainingOutingQuantityUnknown"),
                            render: (row) => {
                              const basis = rates.find((rate) => rate.user_id === row.user_id)?.basis;
                              return basis === "hourly" ? `${row.quantity} h` : row.quantity;
                            },
                          },
                          { key: "coaching_pay", header: t("trainingCoachingFee"), render: (row) => euros(row.coaching_pay, locale) },
                          { key: "fuel_amount", header: t("trainingFuelColumn"), render: (row) => euros(row.fuel_amount, locale) },
                          { key: "hotel_amount", header: t("trainingHotelColumn"), render: (row) => euros(row.hotel_amount, locale) },
                          ...(canManage
                            ? [
                                {
                                  key: "actions",
                                  header: "",
                                  render: (row: CoachOutingRow) => (
                                    <RowActionMenu
                                      label={common("rowActionsLabel")}
                                      actions={[
                                        { key: "edit", label: t("editAction"), onSelect: () => beginOutingEdit(row) },
                                        {
                                          key: "delete",
                                          label: t("trainingRemove"),
                                          destructive: true,
                                          onSelect: () => setPendingOuting(row),
                                        },
                                      ]}
                                    />
                                  ),
                                },
                              ]
                            : []),
                        ]}
                      />
                    </div>
                  )}
                </FormPanel>
              ) : null}
              <EntityTable
                rows={report.periods.flatMap((period) => {
                  const title = period.label === "first" || period.label === "second"
                    ? `${t(`trainingPeriod_${period.label}`)} · ${period.starts_on} – ${period.ends_on}`
                    : `${period.starts_on} – ${period.ends_on}`;
                  if (period.coaches.length === 0) {
                    return [{
                      id: period.label,
                      period: title,
                      name: "—",
                      hours: "—",
                      units: "—",
                      training: "—",
                      tournament: "—",
                      fuel: "—",
                      hotel: "—",
                      total: "—",
                    }];
                  }
                  return period.coaches.map((coach) => ({
                    id: `${period.label}-${coach.user_id}`,
                    period: title,
                    name: coach.name,
                    hours: `${coach.hours} h`,
                    units: coach.units,
                    training: coach.training_pay === undefined ? "—" : euros(coach.training_pay, locale),
                    tournament: coach.tournament_pay === undefined ? "—" : euros(coach.tournament_pay, locale),
                    fuel: coach.fuel === undefined ? "—" : euros(coach.fuel, locale),
                    hotel: coach.hotel === undefined ? "—" : euros(coach.hotel, locale),
                    total: coach.total === undefined ? "—" : euros(coach.total, locale),
                  }));
                })}
                columns={[
                  { key: "period", header: t("trainingSeason") },
                  { key: "name", header: t("trainingCoachColumn") },
                  { key: "hours", header: t("trainingHoursColumn") },
                  { key: "units", header: t("trainingUnitsColumn") },
                  ...(showPay
                    ? [
                        { key: "training", header: t("trainingTrainingPayColumn") },
                        { key: "tournament", header: t("trainingTournamentColumn") },
                        { key: "fuel", header: t("trainingFuelColumn") },
                        { key: "hotel", header: t("trainingHotelColumn") },
                        { key: "total", header: t("trainingTotalColumn") },
                      ]
                    : []),
                ]}
              />
              <SidePanel
                open={rateOpen}
                title={t("trainingPayRateTitle")}
                description={rateTarget?.name}
                closeLabel={t("cancelEdit")}
                onClose={() => setRateOpen(false)}
                footer={
                  <>
                    <Button type="button" variant="outline" onClick={() => setRateOpen(false)}>
                      {t("cancelEdit")}
                    </Button>
                    <Button type="submit" form={RATE_FORM_ID} variant="primary" disabled={savingRateId !== null}>
                      {savingRateId !== null ? t("saving") : t("trainingSaveRate")}
                    </Button>
                  </>
                }
              >
                <form
                  id={RATE_FORM_ID}
                  className="grid gap-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void saveRate();
                  }}
                >
                  <div>
                    <Label>{t("trainingBasisColumn")}</Label>
                    <PopoverSelect
                      className="mt-1 w-full"
                      value={rateDraft.basis}
                      onValueChange={(value) => setRateDraft((current) => ({ ...current, basis: value as CoachPayBasis }))}
                      ariaLabel={t("trainingBasisColumn")}
                      options={[
                        { value: "hourly", label: t("trainingBasisHourly") },
                        { value: "unit", label: t("trainingBasisUnit") },
                      ]}
                    />
                  </div>
                  <div>
                    <Label htmlFor="coach-rate">{t("trainingRateColumn")}</Label>
                    <Input
                      id="coach-rate"
                      className="mt-1"
                      inputMode="decimal"
                      value={rateDraft.rate}
                      placeholder="0.00"
                      onChange={(event) => setRateDraft((current) => ({ ...current, rate: event.target.value }))}
                    />
                  </div>
                </form>
              </SidePanel>
              <SidePanel
                open={outingOpen}
                wide
                title={outing.id === null ? t("trainingAddOuting") : t("trainingOutingsTitle")}
                closeLabel={t("cancelEdit")}
                onClose={() => setOutingOpen(false)}
                footer={
                  <>
                    <Button type="button" variant="outline" onClick={() => setOutingOpen(false)}>
                      {t("cancelEdit")}
                    </Button>
                    <Button
                      type="submit"
                      form={OUTING_FORM_ID}
                      variant="primary"
                      disabled={isSavingOuting || outing.coachId === "" || outing.heldOn === "" || outing.name.trim() === ""}
                    >
                      {isSavingOuting ? t("saving") : outing.id === null ? t("trainingAddOuting") : t("trainingUpdateRule")}
                    </Button>
                  </>
                }
              >
                <form
                  id={OUTING_FORM_ID}
                  className="grid gap-4 md:grid-cols-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void saveOuting();
                  }}
                >
                  <div className="flex flex-col gap-2">
                    <Label required>{t("trainingCoachColumn")}</Label>
                    <PopoverSelect
                      className="w-full"
                      value={outing.coachId}
                      onValueChange={(value) => setOuting({ ...outing, coachId: value })}
                      ariaLabel={t("trainingCoachColumn")}
                      placeholder={t("trainingCoachColumn")}
                      options={rates.map((row) => ({ value: String(row.user_id), label: row.name }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="outing-date" required>
                      {t("trainingDate")}
                    </Label>
                    <Input id="outing-date" className="mt-1" type="date" required value={outing.heldOn} onChange={(event) => setOuting({ ...outing, heldOn: event.target.value })} />
                  </div>
                  <div className="md:col-span-2">
                    <Label htmlFor="outing-name" required>
                      {t("trainingTournamentName")}
                    </Label>
                    <Input id="outing-name" className="mt-1" required value={outing.name} onChange={(event) => setOuting({ ...outing, name: event.target.value })} />
                  </div>
                  <div>
                    <Label htmlFor="outing-quantity">{quantityLabel}</Label>
                    <Input id="outing-quantity" className="mt-1" inputMode="decimal" value={outing.quantity} onChange={(event) => setOuting({ ...outing, quantity: event.target.value })} />
                  </div>
                  <div>
                    <Label htmlFor="outing-fee">{t("trainingCoachingFee")}</Label>
                    <Input
                      id="outing-fee"
                      className="mt-1"
                      inputMode="decimal"
                      placeholder={t("trainingCoachingFeePlaceholder")}
                      value={outing.coachingAmount}
                      onChange={(event) => setOuting({ ...outing, coachingAmount: event.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="outing-fuel">{t("trainingFuelColumn")}</Label>
                    <Input id="outing-fuel" className="mt-1" inputMode="decimal" placeholder="0.00" value={outing.fuel} onChange={(event) => setOuting({ ...outing, fuel: event.target.value })} />
                  </div>
                  <div>
                    <Label htmlFor="outing-hotel">{t("trainingHotelColumn")}</Label>
                    <Input id="outing-hotel" className="mt-1" inputMode="decimal" placeholder="0.00" value={outing.hotel} onChange={(event) => setOuting({ ...outing, hotel: event.target.value })} />
                  </div>
                </form>
              </SidePanel>
              <DeleteConfirmModal
                isOpen={pendingRate !== null}
                title={t("trainingRemove")}
                description={t("trainingRemoveRateConfirm")}
                confirmLabel={t("trainingRemove")}
                cancelLabel={t("cancelEdit")}
                listItems={pendingRate ? [pendingRate.name] : []}
                onCancel={() => setPendingRate(null)}
                onConfirm={() => void confirmRemoveRate()}
              />
              <DeleteConfirmModal
                isOpen={pendingOuting !== null}
                title={t("trainingRemove")}
                description={t("trainingRemoveOutingConfirm")}
                confirmLabel={t("trainingRemove")}
                cancelLabel={t("cancelEdit")}
                listItems={pendingOuting ? [`${pendingOuting.tournament} · ${pendingOuting.held_on}`] : []}
                onCancel={() => setPendingOuting(null)}
                onConfirm={() => void confirmRemoveOuting()}
              />
            </>
          ) : null}
        </div>
      )}
    </ClubAdminLayout>
  );
}
