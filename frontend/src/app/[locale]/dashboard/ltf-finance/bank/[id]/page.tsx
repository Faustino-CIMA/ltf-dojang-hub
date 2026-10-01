"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useParams } from "next/navigation";

import { EmptyState } from "@/components/club-admin/empty-state";
import { BankStatementWorkspace } from "@/components/finance/bank-statement-workspace";
import { LtfFinanceLayout } from "@/components/ltf-finance/ltf-finance-layout";
import { Button } from "@/components/ui/button";
import {
  BankStatement,
  completeFinanceBankStatement,
  getFinanceBankStatement,
  getFinanceBankSuggestions,
  ignoreFinanceBankLine,
  matchFinanceBankLine,
  unmatchFinanceBankLine,
} from "@/lib/ltf-finance-api";

export default function LtfFinanceBankDetailPage() {
  const t = useTranslations("LtfFinance");
  const locale = useLocale();
  const params = useParams();
  const [statement, setStatement] = useState<BankStatement | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const statementId = useMemo(() => {
    const rawId = params?.id;
    return Number(Array.isArray(rawId) ? rawId[0] : rawId);
  }, [params]);

  const load = useCallback(async () => {
    if (!statementId || Number.isNaN(statementId)) {
      setErrorMessage(t("bankLoadError"));
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      setStatement(await getFinanceBankStatement(statementId));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("bankLoadError"));
    } finally {
      setIsLoading(false);
    }
  }, [statementId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadSuggestions = useCallback(
    async (line: number) => (await getFinanceBankSuggestions(statementId, line)).candidates,
    [statementId]
  );

  if (isLoading) {
    return (
      <LtfFinanceLayout title={t("bankDetailTitle")} subtitle={t("bankDetailSubtitle")}>
        <EmptyState title={t("loadingTitle")} description={t("loadingSubtitle")} loading />
      </LtfFinanceLayout>
    );
  }

  if (errorMessage || !statement) {
    return (
      <LtfFinanceLayout title={t("bankDetailTitle")} subtitle={t("bankDetailSubtitle")}>
        <EmptyState title={t("bankLoadError")} description={errorMessage ?? ""} />
      </LtfFinanceLayout>
    );
  }

  return (
    <LtfFinanceLayout title={t("bankDetailTitle")} subtitle={t("bankDetailSubtitle")}>
      <Button asChild variant="outline" className="w-fit">
        <Link href={`/${locale}/dashboard/ltf-finance/bank`}>{t("backToBank")}</Link>
      </Button>
      <BankStatementWorkspace
        statement={statement}
        canMutate
        onMatch={async (input) => setStatement(await matchFinanceBankLine(statement.id, input))}
        onUnmatch={async (line) => setStatement(await unmatchFinanceBankLine(statement.id, line))}
        onIgnore={async (line) => setStatement(await ignoreFinanceBankLine(statement.id, line))}
        onComplete={async () => setStatement(await completeFinanceBankStatement(statement.id))}
        loadSuggestions={loadSuggestions}
      />
    </LtfFinanceLayout>
  );
}
