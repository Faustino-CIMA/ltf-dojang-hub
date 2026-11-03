"use client";

import { useTranslations } from "next-intl";

import { LtfFinanceLayout } from "@/components/ltf-finance/ltf-finance-layout";
import { NationalTeamDesk } from "@/components/national-team/national-team-desk";

export default function FinanceNationalTeamPage() {
  const t = useTranslations("LtfAdmin");
  return (
    <LtfFinanceLayout title={t("nationalTeamTitle")} subtitle={t("nationalTeamSubtitle")}>
      <NationalTeamDesk canManage={false} />
    </LtfFinanceLayout>
  );
}
