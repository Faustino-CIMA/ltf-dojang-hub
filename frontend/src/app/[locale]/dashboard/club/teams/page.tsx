"use client";

import { useTranslations } from "next-intl";

import { ClubAdminLayout } from "@/components/club-admin/club-admin-layout";
import { ClubTeamsDesk } from "@/components/club-admin/club-teams-desk";
import { useClubSelection } from "@/components/club-selection-provider";

export default function ClubTeamsPage() {
  const t = useTranslations("ClubAdmin");
  const { selectedClubId } = useClubSelection();
  return (
    <ClubAdminLayout title={t("teamsTitle")} subtitle={t("teamsSubtitle")}>
      {selectedClubId != null ? <ClubTeamsDesk clubId={selectedClubId} /> : null}
    </ClubAdminLayout>
  );
}
