"use client";

import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

import { ClubAdminLayout } from "@/components/club-admin/club-admin-layout";
import { ClubTeamsDesk } from "@/components/club-admin/club-teams-desk";
import { useClubSelection } from "@/components/club-selection-provider";

export default function ClubTeamsPage() {
  const t = useTranslations("ClubAdmin");
  const locale = useLocale();
  const router = useRouter();
  const { selectedClubId } = useClubSelection();
  return (
    <ClubAdminLayout title={t("teamsTitle")} subtitle={t("teamsSubtitle")}>
      {selectedClubId != null ? (
        <ClubTeamsDesk
          clubId={selectedClubId}
          onOpenTeam={(team) => router.push(`/${locale}/dashboard/club/teams/${team.id}`)}
        />
      ) : null}
    </ClubAdminLayout>
  );
}
