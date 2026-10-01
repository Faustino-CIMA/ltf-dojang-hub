"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import { ClubAdminLayout } from "@/components/club-admin/club-admin-layout";
import { ClubFinanceTabs } from "@/components/club-admin/club-finance-tabs";
import { useClubFinanceAccess } from "@/components/club-admin/use-club-finance-access";
import { EmptyState } from "@/components/club-admin/empty-state";
import { EntityTable } from "@/components/club-admin/entity-table";
import { useClubSelection } from "@/components/club-selection-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AppTextarea, FormPanel, PageNotice, ActionNotices } from "@/components/ui/list-page-chrome";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BudgetPanel } from "@/components/finance/budget-panel";
import {
  downloadClubFinanceReportExcel,
  getClubFinanceBudget,
  getClubFinanceReport,
  saveClubFinanceBudget,
  saveClubFinanceYearOpening,
} from "@/lib/club-finance-api";
import { formatDisplayDate } from "@/lib/date-display";
import { FinanceBudgetResponse, FinanceReportResponse } from "@/lib/ltf-finance-api";

function yearOptions(currentYear: number) {
  return [currentYear + 1, currentYear, currentYear - 1, currentYear - 2, currentYear - 3];
}

function moneyLabel(amount: string, currency: string) {
  return `${amount} ${currency}`;
}

export default function ClubFinanceReportsPage() {
  const t = useTranslations("LtfFinance");
  const currentYear = new Date().getFullYear();
  const { selectedClubId } = useClubSelection();
  const { canRecordPayments } = useClubFinanceAccess();
  const [year, setYear] = useState(String(currentYear));
  const [report, setReport] = useState<FinanceReportResponse | null>(null);
  const [budget, setBudget] = useState<FinanceBudgetResponse | null>(null);
  const [openingCash, setOpeningCash] = useState("");
  const [openingNotes, setOpeningNotes] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingOpening, setIsSavingOpening] = useState(false);
  const [isSavingBudget, setIsSavingBudget] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const loadReport = useCallback(async () => {
    if (!selectedClubId) return;
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const [response, budgetResponse] = await Promise.all([
        getClubFinanceReport(selectedClubId, Number(year)),
        getClubFinanceBudget(selectedClubId, Number(year)),
      ]);
      setReport(response);
      setBudget(budgetResponse);
      setOpeningCash(response.opening.cash);
      setOpeningNotes(response.opening.notes);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("reportsLoadError"));
    } finally {
      setIsLoading(false);
    }
  }, [selectedClubId, t, year]);

  useEffect(() => { void loadReport(); }, [loadReport]);

  const handleSaveOpening = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedClubId) return;
    setIsSavingOpening(true);
    try {
      await saveClubFinanceYearOpening({
        club: selectedClubId,
        year: Number(year),
        opening_cash: openingCash.trim(),
        notes: openingNotes.trim() || undefined,
      });
      setSuccessMessage(t("openingCashSavedMessage"));
      await loadReport();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("openingCashSaveError"));
    } finally {
      setIsSavingOpening(false);
    }
  };

  const years = useMemo(() => yearOptions(currentYear), [currentYear]);

  return (
    <ClubAdminLayout title={t("reportsTitle")} subtitle={t("reportsSubtitle")}>
      <div className="space-y-6">
        <ClubFinanceTabs />
        <ActionNotices error={errorMessage} success={successMessage} onDismiss={() => { setErrorMessage(null); setSuccessMessage(null); }} />
        <div className="flex flex-wrap items-end justify-between gap-4 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
          <div className="space-y-2">
            <label className="text-sm font-medium">{t("reportYearLabel")}</label>
            <Select value={year} onValueChange={setYear}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {years.map((option) => (
                  <SelectItem key={option} value={String(option)}>{option}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={() => { if (selectedClubId) void downloadClubFinanceReportExcel(selectedClubId, Number(year)); }} disabled={isExporting || isLoading}>
            {isExporting ? t("reportExportingAction") : t("exportExcelAction")}
          </Button>
        </div>
        {isLoading ? (
          <EmptyState title={t("loadingTitle")} description={t("loadingSubtitle")} loading />
        ) : !report ? (
          <EmptyState title={t("reportsEmptyTitle")} description={t("reportsEmptySubtitle")} />
        ) : (
          <>
            <PageNotice tone="info">{report.methodology}</PageNotice>
            {budget ? (
              <BudgetPanel
                key={`${selectedClubId}-${year}`}
                budget={budget}
                currency={report.currency}
                canEdit={canRecordPayments}
                isSaving={isSavingBudget}
                onSave={async (lines) => {
                  if (!selectedClubId) return;
                  setIsSavingBudget(true);
                  try {
                    setBudget(await saveClubFinanceBudget(selectedClubId, Number(year), lines));
                    setSuccessMessage(t("budgetSavedMessage"));
                  } catch (error) {
                    setErrorMessage(error instanceof Error ? error.message : t("budgetSaveError"));
                    throw error;
                  } finally {
                    setIsSavingBudget(false);
                  }
                }}
              />
            ) : null}
            <FormPanel>
              <h2 className="text-section">{t("openingCashTitle")}</h2>
              <form className="mt-4 grid gap-4 md:grid-cols-3" onSubmit={handleSaveOpening}>
                <Input value={openingCash} onChange={(e) => setOpeningCash(e.target.value)} disabled={!canRecordPayments} />
                <AppTextarea className="md:col-span-2 min-h-[2.75rem]" value={openingNotes} onChange={(e) => setOpeningNotes(e.target.value)} disabled={!canRecordPayments} />
                {canRecordPayments ? (
                  <Button type="submit" disabled={isSavingOpening}>{isSavingOpening ? t("savingAction") : t("saveOpeningCashAction")}</Button>
                ) : null}
              </form>
            </FormPanel>
            <div className="grid gap-6 lg:grid-cols-2">
              <FormPanel>
                <h2 className="text-section">{t("incomeStatementTitle")}</h2>
                <dl className="mt-4 space-y-3 text-sm">
                  <div className="flex justify-between"><dt className="text-muted">{t("licenseFeeIncomeLabel")}</dt><dd>{moneyLabel(report.income_statement.revenue_license_fees, report.currency)}</dd></div>
                  <div className="flex justify-between"><dt className="text-muted">{t("otherIncomeLabel")}</dt><dd>{moneyLabel(report.income_statement.other_income, report.currency)}</dd></div>
                  <div className="flex justify-between"><dt className="text-muted">{t("operatingExpensesLabel")}</dt><dd>{moneyLabel(report.income_statement.expenses_total, report.currency)}</dd></div>
                  <div className="flex justify-between border-t pt-3 font-semibold"><dt>{t("surplusLabel")}</dt><dd>{moneyLabel(report.income_statement.surplus, report.currency)}</dd></div>
                </dl>
              </FormPanel>
              <FormPanel>
                <h2 className="text-section">{t("cashMovementTitle")}</h2>
                <dl className="mt-4 space-y-3 text-sm">
                  <div className="flex justify-between"><dt className="text-muted">{t("openingCashLabel")}</dt><dd>{moneyLabel(report.cash_movement.opening_cash, report.currency)}</dd></div>
                  <div className="flex justify-between"><dt className="text-muted">{t("receiptsLabel")}</dt><dd>{moneyLabel(report.cash_movement.receipts, report.currency)}</dd></div>
                  <div className="flex justify-between"><dt className="text-muted">{t("disbursementsLabel")}</dt><dd>{moneyLabel(report.cash_movement.disbursements, report.currency)}</dd></div>
                  <div className="flex justify-between border-t pt-3 font-semibold"><dt>{t("closingCashLabel")}</dt><dd>{moneyLabel(report.cash_movement.closing_cash, report.currency)}</dd></div>
                </dl>
              </FormPanel>
            </div>
            {report.aging ? (
              <FormPanel>
                <h2 className="text-section">{t("accountsReceivableLabel")}</h2>
                <EntityTable
                  columns={[
                    { key: "key", header: t("statusLabel") },
                    { key: "count", header: t("totalLabel") },
                    { key: "amount", header: t("expenseAmountLabel"), render: (row: { amount: string }) => moneyLabel(row.amount, report.currency) },
                  ]}
                  rows={report.aging.buckets.map((bucket) => ({ ...bucket, id: bucket.key }))}
                />
              </FormPanel>
            ) : null}
            <section className="space-y-3">
              <h2 className="text-section">{t("accountsReceivableLabel")}</h2>
              {report.registers.receivables.length === 0 ? (
                <p className="text-sm text-muted">{t("reportsEmptySubtitle")}</p>
              ) : (
                <EntityTable
                  columns={[
                    { key: "invoice_number", header: t("invoiceNumberLabel") },
                    { key: "issued_at", header: t("issuedAtLabel"), render: (row: { issued_at: string }) => formatDisplayDate(row.issued_at) },
                    { key: "amount", header: t("expenseAmountLabel"), render: (row: { amount: string }) => moneyLabel(row.amount, report.currency) },
                  ]}
                  rows={report.registers.receivables}
                />
              )}
            </section>
          </>
        )}
      </div>
    </ClubAdminLayout>
  );
}
