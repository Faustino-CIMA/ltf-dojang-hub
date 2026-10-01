"use client";

import { useTranslations } from "next-intl";

import { ClubAdminLayout } from "@/components/club-admin/club-admin-layout";
import { TrainingYearView } from "@/components/club-admin/training-calendar";

export default function TrainingYearPage() {
  const t = useTranslations("ClubAdmin");
  return (
    <ClubAdminLayout title={t("trainingTitle")} subtitle={t("trainingYear")}>
      <TrainingYearView />
    </ClubAdminLayout>
  );
}
