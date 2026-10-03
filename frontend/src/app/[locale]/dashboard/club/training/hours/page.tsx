"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { EntityTable } from "@/components/club-admin/entity-table";
import { ClubAdminLayout } from "@/components/club-admin/club-admin-layout";
import { EmptyState } from "@/components/club-admin/empty-state";
import { useCanManageTraining } from "@/components/club-admin/use-training-access";
import { useClubSelection } from "@/components/club-selection-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ActionNotices, FormPanel } from "@/components/ui/list-page-chrome";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  const locale = useLocale();
  const canManage = useCanManageTraining();
  const { selectedClubId } = useClubSelection();
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [report, setReport] = useState<CoachHourReport | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [rateDrafts, setRateDrafts] = useState<Record<number, RateDraft>>({});
  const [savingRateId, setSavingRateId] = useState<number | null>(null);
  const [outing, setOuting] = useState<OutingDraft>(emptyOuting);
  const [isSavingOuting, setIsSavingOuting] = useState(false);
  const outingFormRef = useRef<HTMLFormElement>(null);
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

  const draftFor = (row: CoachPayRateRow): RateDraft => {
    const existing = rateDrafts[row.user_id];
    if (existing) return existing;
    return { basis: row.basis === "" ? "hourly" : row.basis, rate: row.rate };
  };

  const saveRate = async (row: CoachPayRateRow) => {
    if (!selectedClubId) return;
    const draft = draftFor(row);
    setSavingRateId(row.user_id);
    setSuccessMessage(null);
    try {
      setReport(await saveCoachPayRate(selectedClubId, reportYear, {
        coach_id: row.user_id,
        basis: draft.basis,
        rate: draft.rate.trim() === "" ? "0" : draft.rate,
      }));
      setRateDrafts((current) => {
        const next = { ...current };
        delete next[row.user_id];
        return next;
      });
      setErrorMessage(null);
      setSuccessMessage(t("trainingRateSaved"));
    } catch (error) {
      setSuccessMessage(null);
      setErrorMessage(error instanceof Error ? error.message : t("saveError"));
    } finally {
      setSavingRateId(null);
    }
  };

  const removeRate = async (userId: number) => {
    if (!selectedClubId || !window.confirm(t("trainingRemoveRateConfirm"))) return;
    setSavingRateId(userId);
    setSuccessMessage(null);
    try {
      setReport(await deleteCoachPayRate(selectedClubId, reportYear, userId));
      setRateDrafts((current) => {
        const next = { ...current };
        delete next[userId];
        return next;
      });
      setErrorMessage(null);
      setSuccessMessage(t("trainingRateRemoved"));
    } catch (error) {
      setSuccessMessage(null);
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
    outingFormRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  const removeOuting = async (outingId: number) => {
    if (!selectedClubId || !window.confirm(t("trainingRemoveOutingConfirm"))) return;
    setSuccessMessage(null);
    try {
      setReport(await deleteCoachOuting(selectedClubId, reportYear, outingId));
      if (outing.id === outingId) setOuting(emptyOuting());
      setErrorMessage(null);
      setSuccessMessage(t("trainingOutingRemoved"));
    } catch (error) {
      setSuccessMessage(null);
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
        <div className="space-y-6">
          <ActionNotices
            error={errorMessage}
            success={successMessage}
            onDismiss={() => {
              setErrorMessage(null);
              setSuccessMessage(null);
            }}
          />
          <div className="max-w-xs rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
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
                    <p className="mt-4 text-sm text-muted">{t("trainingNoCoaches")}</p>
                  ) : (
                    <div className="mt-4">
                      <EntityTable
                        rows={rates.map((row) => ({ ...row, id: row.user_id }))}
                        columns={[
                          { key: "name", header: t("trainingCoachColumn") },
                          {
                            key: "basis",
                            header: t("trainingBasisColumn"),
                            render: (row) => (
                              <Select
                                value={draftFor(row).basis}
                                onValueChange={(value) =>
                                  setRateDrafts((current) => ({
                                    ...current,
                                    [row.user_id]: { ...draftFor(row), basis: value as CoachPayBasis },
                                  }))
                                }
                              >
                                <SelectTrigger className="w-full min-w-36" aria-label={t("trainingBasisColumn")}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="hourly">{t("trainingBasisHourly")}</SelectItem>
                                  <SelectItem value="unit">{t("trainingBasisUnit")}</SelectItem>
                                </SelectContent>
                              </Select>
                            ),
                          },
                          {
                            key: "rate",
                            header: t("trainingRateColumn"),
                            render: (row) => (
                              <Input
                                aria-label={t("trainingRateColumn")}
                                inputMode="decimal"
                                value={draftFor(row).rate}
                                placeholder="0.00"
                                onChange={(event) =>
                                  setRateDrafts((current) => ({
                                    ...current,
                                    [row.user_id]: { ...draftFor(row), rate: event.target.value },
                                  }))
                                }
                              />
                            ),
                          },
                          {
                            key: "actions",
                            header: "",
                            render: (row) => (
                              <div className="flex flex-wrap items-center gap-2">
                                {row.basis === "" ? <span className="text-xs text-muted">{t("trainingNoRate")}</span> : null}
                                <Button
                                  type="button"
                                  variant="primary"
                                  size="sm"
                                  disabled={savingRateId === row.user_id}
                                  onClick={() => void saveRate(row)}
                                >
                                  {savingRateId === row.user_id ? t("saving") : t("trainingSaveRate")}
                                </Button>
                                {row.basis !== "" ? (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    aria-label={t("trainingRemove")}
                                    disabled={savingRateId === row.user_id}
                                    onClick={() => void removeRate(row.user_id)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                ) : null}
                              </div>
                            ),
                          },
                        ]}
                      />
                    </div>
                  )}
                </FormPanel>
              ) : null}
              {showPay ? (
                <FormPanel>
                  <h2 className="text-section text-foreground">{t("trainingOutingsTitle")}</h2>
                  <p className="mt-2 text-sm text-muted">{t("trainingOutingsHint")}</p>
                  <form
                    ref={outingFormRef}
                    className="mt-4"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void saveOuting();
                    }}
                  >
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                      <div className="flex flex-col gap-2">
                        <Label>{t("trainingCoachColumn")}</Label>
                        <Select value={outing.coachId || undefined} onValueChange={(value) => setOuting({ ...outing, coachId: value })}>
                          <SelectTrigger className="w-full"><SelectValue placeholder={t("trainingCoachColumn")} /></SelectTrigger>
                          <SelectContent>
                            {rates.map((row) => (
                              <SelectItem key={row.user_id} value={String(row.user_id)}>{row.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>{t("trainingDate")}</Label>
                        <Input className="mt-1" type="date" value={outing.heldOn} onChange={(event) => setOuting({ ...outing, heldOn: event.target.value })} />
                      </div>
                      <div>
                        <Label>{t("trainingTournamentName")}</Label>
                        <Input className="mt-1" value={outing.name} onChange={(event) => setOuting({ ...outing, name: event.target.value })} />
                      </div>
                      <div>
                        <Label>{quantityLabel}</Label>
                        <Input className="mt-1" inputMode="decimal" value={outing.quantity} onChange={(event) => setOuting({ ...outing, quantity: event.target.value })} />
                      </div>
                      <div>
                        <Label>{t("trainingCoachingFee")}</Label>
                        <Input
                          className="mt-1"
                          inputMode="decimal"
                          placeholder={t("trainingCoachingFeePlaceholder")}
                          value={outing.coachingAmount}
                          onChange={(event) => setOuting({ ...outing, coachingAmount: event.target.value })}
                        />
                      </div>
                      <div>
                        <Label>{t("trainingFuelColumn")}</Label>
                        <Input className="mt-1" inputMode="decimal" placeholder="0.00" value={outing.fuel} onChange={(event) => setOuting({ ...outing, fuel: event.target.value })} />
                      </div>
                      <div>
                        <Label>{t("trainingHotelColumn")}</Label>
                        <Input className="mt-1" inputMode="decimal" placeholder="0.00" value={outing.hotel} onChange={(event) => setOuting({ ...outing, hotel: event.target.value })} />
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button
                        type="submit"
                        variant="primary"
                        disabled={isSavingOuting || outing.coachId === "" || outing.heldOn === "" || outing.name.trim() === ""}
                      >
                        {isSavingOuting ? t("saving") : outing.id === null ? t("trainingAddOuting") : t("trainingUpdateRule")}
                      </Button>
                      {outing.id !== null ? (
                        <Button type="button" variant="outline" onClick={() => setOuting(emptyOuting())}>
                          {t("cancelEdit")}
                        </Button>
                      ) : null}
                    </div>
                  </form>
                  {outings.length === 0 ? (
                    <p className="mt-4 text-sm text-muted">{t("trainingNoOutings")}</p>
                  ) : (
                    <div className="mt-4">
                      <EntityTable
                        rows={outings}
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
                          {
                            key: "actions",
                            header: "",
                            render: (row) => (
                              <div className="flex flex-wrap gap-2">
                                <Button type="button" variant="outline" size="sm" aria-label={t("editAction")} onClick={() => beginOutingEdit(row)}>
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button type="button" variant="outline" size="sm" aria-label={t("trainingRemove")} onClick={() => void removeOuting(row.id)}>
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            ),
                          },
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
            </>
          ) : null}
        </div>
      )}
    </ClubAdminLayout>
  );
}
