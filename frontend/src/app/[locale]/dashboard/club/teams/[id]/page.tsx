"use client";

import { useParams, useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

import { ClubAdminLayout } from "@/components/club-admin/club-admin-layout";
import { TeamRoster } from "@/components/club-admin/team-roster";

export default function ClubTeamPage() {
  const t = useTranslations("ClubAdmin");
  const locale = useLocale();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const teamId = Number(params.id);
  return (
    <ClubAdminLayout title={t("teamsTitle")} subtitle={t("teamsSubtitle")}>
      {Number.isFinite(teamId) ? (
        <TeamRoster teamId={teamId} onBack={() => router.push(`/${locale}/dashboard/club/teams`)} />
      ) : null}
    </ClubAdminLayout>
  );
}
