"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";

import { ClubAdminLayout } from "@/components/club-admin/club-admin-layout";
import { ClubFinanceTabs } from "@/components/club-admin/club-finance-tabs";
import { useClubFinanceAccess } from "@/components/club-admin/use-club-finance-access";
import { EmptyState } from "@/components/club-admin/empty-state";
import { EntityTable } from "@/components/club-admin/entity-table";
import { useClubSelection } from "@/components/club-selection-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormPanel, ActionNotices } from "@/components/ui/list-page-chrome";
import { StatusBadge } from "@/components/ui/status-badge";
import { getClubBankStatements, importClubBankStatement } from "@/lib/club-finance-api";
import { formatDisplayDate } from "@/lib/date-display";
import { BankStatement } from "@/lib/ltf-finance-api";

export default function ClubBankStatementsPage() {
  const t = useTranslations("LtfFinance");
  const locale = useLocale();
  const router = useRouter();
  const { selectedClubId } = useClubSelection();
  const { canRecordPayments } = useClubFinanceAccess();
  const [statements, setStatements] = useState<BankStatement[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [opening, setOpening] = useState("");
  const [closing, setClosing] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!selectedClubId) return;
    setIsLoading(true);
    setErrorMessage(null);
    try {
      setStatements(await getClubBankStatements(selectedClubId));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("bankLoadError"));
    } finally {
      setIsLoading(false);
    }
  }, [selectedClubId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleImport = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedClubId || !file) {
      setErrorMessage(t("bankFileRequiredError"));
      return;
    }
    setIsSaving(true);
    setErrorMessage(null);
    try {
      const statement = await importClubBankStatement(selectedClubId, file, opening.trim() || undefined, closing.trim() || undefined);
      router.push(`/${locale}/dashboard/club/bank/${statement.id}`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("bankImportError"));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ClubAdminLayout title={t("bankTitle")} subtitle={t("bankSubtitle")}>
      <div className="space-y-6">
        <ClubFinanceTabs />
        <ActionNotices error={errorMessage} onDismiss={() => setErrorMessage(null)} />
        {canRecordPayments ? (
          <FormPanel>
            <h2 className="text-section text-foreground">{t("importStatementAction")}</h2>
            <p className="mt-1 text-sm text-muted">{t("bankImportHint")}</p>
            <form className="mt-4 grid gap-4 md:grid-cols-2" onSubmit={handleImport}>
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium" htmlFor="bank-file">{t("bankFileLabel")}</label>
                <Input id="bank-file" type="file" accept=".csv,.txt,.xml" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="bank-opening">{t("openingCashLabel")}</label>
                <Input id="bank-opening" value={opening} onChange={(event) => setOpening(event.target.value)} placeholder="0.00" inputMode="decimal" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="bank-closing">{t("closingCashLabel")}</label>
                <Input id="bank-closing" value={closing} onChange={(event) => setClosing(event.target.value)} placeholder="0.00" inputMode="decimal" />
              </div>
              <div>
                <Button type="submit" variant="primary" disabled={isSaving}>
                  {isSaving ? t("savingAction") : t("importStatementAction")}
                </Button>
              </div>
            </form>
          </FormPanel>
        ) : null}
        {isLoading ? (
          <EmptyState title={t("loadingTitle")} description={t("loadingSubtitle")} loading />
        ) : statements.length === 0 ? (
          <EmptyState title={t("bankEmptyTitle")} description={t("bankEmptySubtitle")} />
        ) : (
          <EntityTable
            columns={[
              { key: "statement_number", header: t("bankStatementNumberLabel") },
              {
                key: "status",
                header: t("statusLabel"),
                render: (row: BankStatement) => (
                  <StatusBadge
                    label={row.status === "completed" ? t("bankStatusCompleted") : t("bankStatusOpen")}
                    tone={row.status === "completed" ? "success" : "warning"}
                  />
                ),
              },
              {
                key: "period_end",
                header: t("bankPeriodLabel"),
                render: (row: BankStatement) =>
                  `${formatDisplayDate(row.period_start)} – ${formatDisplayDate(row.period_end)}`,
              },
              { key: "unmatched_count", header: t("bankUnmatchedLabel") },
            ]}
            rows={statements}
            onRowClick={(row: BankStatement) => router.push(`/${locale}/dashboard/club/bank/${row.id}`)}
          />
        )}
      </div>
    </ClubAdminLayout>
  );
}
