"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { LtfAdminLayout } from "@/components/ltf-admin/ltf-admin-layout";
import { NationalTeamDesk } from "@/components/national-team/national-team-desk";
import { apiRequest } from "@/lib/api";

export default function LtfNationalTeamPage() {
  const t = useTranslations("LtfAdmin");
  const [canManage, setCanManage] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiRequest<{ role: string }>("/api/auth/me/")
      .then((me) => {
        if (!cancelled) setCanManage(me.role === "ltf_admin");
      })
      .catch(() => {
        if (!cancelled) setCanManage(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <LtfAdminLayout title={t("nationalTeamTitle")} subtitle={t("nationalTeamSubtitle")}>
      <NationalTeamDesk canManage={canManage} />
    </LtfAdminLayout>
  );
}
