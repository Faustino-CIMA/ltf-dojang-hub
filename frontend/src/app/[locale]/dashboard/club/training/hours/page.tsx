"use client";

import { useCallback, useEffect, useState } from "react";
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
import { getCoachHours, savePaydays, type CoachHourReport, type PayFrequency } from "@/lib/training-api";

const PAY_FREQUENCIES: { value: PayFrequency; label: "trainingPayMonthly" | "trainingPayQuarterly" | "trainingPayTwice" }[] = [
  { value: "monthly", label: "trainingPayMonthly" },
  { value: "quarterly", label: "trainingPayQuarterly" },
  { value: "twice", label: "trainingPayTwice" },
];
const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

function monthName(month: number, locale: string) {
  return new Date(2026, month - 1, 1).toLocaleDateString(locale, { month: "long" });
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

  const load = useCallback(async () => {
    if (!selectedClubId) return;
    try {
      setReport(await getCoachHours(selectedClubId, Number(year) || new Date().getFullYear()));
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("loadError"));
      setReport(null);
    }
  }, [selectedClubId, t, year]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!selectedClubId || !report) return;
    setIsSaving(true);
    setSuccessMessage(null);
    try {
      setReport(await savePaydays(selectedClubId, Number(year), {
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
                  <div>
                    <Label>{t("trainingPayFrequency")}</Label>
                    <Select
                      value={report.pay_frequency}
                      onValueChange={(value) => setReport({ ...report, pay_frequency: value as PayFrequency })}
                      disabled={!canManage}
                    >
                      <SelectTrigger className="mt-1 w-full"><SelectValue /></SelectTrigger>
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
                        <div>
                          <Label>{t("trainingQuarterAnchor")}</Label>
                          <Select
                            value={String(report.quarter_anchor_month)}
                            onValueChange={(value) => setReport({ ...report, quarter_anchor_month: Number(value) })}
                            disabled={!canManage}
                          >
                            <SelectTrigger className="mt-1 w-full"><SelectValue /></SelectTrigger>
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
                  <Button className="mt-4" type="button" variant="outline" disabled={isSaving} onClick={() => void save()}>
                    {isSaving ? t("saving") : t("trainingSavePaydays")}
                  </Button>
                ) : null}
              </FormPanel>
              <EntityTable
                rows={report.periods.flatMap((period) => {
                  const title = period.label === "first" || period.label === "second"
                    ? `${t(`trainingPeriod_${period.label}`)} · ${period.starts_on} – ${period.ends_on}`
                    : `${period.starts_on} – ${period.ends_on}`;
                  if (period.coaches.length === 0) {
                    return [{ id: period.label, period: title, name: "—", hours: "—" }];
                  }
                  return period.coaches.map((coach) => ({
                    id: `${period.label}-${coach.user_id}`,
                    period: title,
                    name: coach.name,
                    hours: `${coach.hours} h`,
                  }));
                })}
                columns={[
                  { key: "period", header: t("trainingSeason") },
                  { key: "name", header: t("trainingCoachColumn") },
                  { key: "hours", header: t("trainingHoursColumn") },
                ]}
              />
            </>
          ) : null}
        </div>
      )}
    </ClubAdminLayout>
  );
}
