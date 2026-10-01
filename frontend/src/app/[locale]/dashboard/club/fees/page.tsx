"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { ClubAdminLayout } from "@/components/club-admin/club-admin-layout";
import { ClubFinanceTabs } from "@/components/club-admin/club-finance-tabs";
import { EmptyState } from "@/components/club-admin/empty-state";
import { MembershipFeePanel } from "@/components/clubmgmt/membership-fee-panel";
import { useClubSelection } from "@/components/club-selection-provider";
import { ActionNotices } from "@/components/ui/list-page-chrome";

export default function ClubMembershipFeesPage() {
  const t = useTranslations("ClubMgmt");
  const { selectedClubId } = useClubSelection();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  return (
    <ClubAdminLayout title={t("feesTitle")} subtitle={t("feesSubtitle")}>
      <div className="space-y-6">
        <ClubFinanceTabs />
        <ActionNotices
          error={errorMessage}
          success={successMessage}
          onDismiss={() => {
            setErrorMessage(null);
            setSuccessMessage(null);
          }}
        />
        {!selectedClubId ? (
          <EmptyState title={t("feesTitle")} description={t("loadError")} />
        ) : (
          <MembershipFeePanel
            clubId={selectedClubId}
            onSuccess={setSuccessMessage}
            onError={setErrorMessage}
          />
        )}
      </div>
    </ClubAdminLayout>
  );
}
