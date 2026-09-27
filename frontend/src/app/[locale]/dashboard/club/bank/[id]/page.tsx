"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useParams } from "next/navigation";

import { ClubAdminLayout } from "@/components/club-admin/club-admin-layout";
import { ClubFinanceTabs } from "@/components/club-admin/club-finance-tabs";
import { useClubFinanceAccess } from "@/components/club-admin/use-club-finance-access";
import { EmptyState } from "@/components/club-admin/empty-state";
import { BankStatementWorkspace } from "@/components/finance/bank-statement-workspace";
import { Button } from "@/components/ui/button";
import {
  completeClubBankStatement,
  getClubBankStatement,
  getClubBankSuggestions,
  ignoreClubBankLine,
  matchClubBankLine,
  unmatchClubBankLine,
} from "@/lib/club-finance-api";
import { BankStatement } from "@/lib/ltf-finance-api";

export default function ClubBankStatementDetailPage() {
  const t = useTranslations("LtfFinance");
  const locale = useLocale();
  const params = useParams();
  const [statement, setStatement] = useState<BankStatement | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { canRecordPayments } = useClubFinanceAccess(statement?.club ?? null);

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
      setStatement(await getClubBankStatement(statementId));
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
    async (line: number) => (await getClubBankSuggestions(statementId, line)).candidates,
    [statementId]
  );

  if (isLoading) {
    return (
      <ClubAdminLayout title={t("bankDetailTitle")} subtitle={t("bankDetailSubtitle")}>
        <EmptyState title={t("loadingTitle")} description={t("loadingSubtitle")} loading />
      </ClubAdminLayout>
    );
  }

  if (errorMessage || !statement) {
    return (
      <ClubAdminLayout title={t("bankDetailTitle")} subtitle={t("bankDetailSubtitle")}>
        <EmptyState title={t("bankLoadError")} description={errorMessage ?? ""} />
      </ClubAdminLayout>
    );
  }

  return (
    <ClubAdminLayout title={t("bankDetailTitle")} subtitle={t("bankDetailSubtitle")}>
      <div className="space-y-6">
        <ClubFinanceTabs />
        <Button asChild variant="outline" className="w-fit">
          <Link href={`/${locale}/dashboard/club/bank`}>{t("backToBank")}</Link>
        </Button>
        <BankStatementWorkspace
          statement={statement}
          canMutate={canRecordPayments}
          onMatch={async (input) => setStatement(await matchClubBankLine(statement.id, input))}
          onUnmatch={async (line) => setStatement(await unmatchClubBankLine(statement.id, line))}
          onIgnore={async (line) => setStatement(await ignoreClubBankLine(statement.id, line))}
          onComplete={async () => setStatement(await completeClubBankStatement(statement.id))}
          loadSuggestions={loadSuggestions}
        />
      </div>
    </ClubAdminLayout>
  );
}
