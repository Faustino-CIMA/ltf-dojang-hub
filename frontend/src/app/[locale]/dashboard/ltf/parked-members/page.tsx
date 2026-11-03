"use client";

import { useTranslations } from "next-intl";

import { ParkedMembersDesk } from "@/components/ltf-admin/parked-members-desk";
import { LtfAdminLayout } from "@/components/ltf-admin/ltf-admin-layout";

export default function ParkedMembersPage() {
  const t = useTranslations("LtfAdmin");
  return (
    <LtfAdminLayout title={t("parkedTitle")} subtitle={t("parkedSubtitle")}>
      <ParkedMembersDesk />
    </LtfAdminLayout>
  );
}
