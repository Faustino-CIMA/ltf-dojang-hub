"use client";

import { useTranslations } from "next-intl";

import { ClubAdminLayout } from "@/components/club-admin/club-admin-layout";
import { TrainingMonthView } from "@/components/club-admin/training-calendar";

export default function TrainingMonthPage() {
  const t = useTranslations("ClubAdmin");
  return (
    <ClubAdminLayout title={t("trainingTitle")} subtitle={t("trainingMonth")}>
      <TrainingMonthView />
    </ClubAdminLayout>
  );
}
