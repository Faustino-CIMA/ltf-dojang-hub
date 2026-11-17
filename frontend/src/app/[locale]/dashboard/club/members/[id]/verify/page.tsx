"use client";

import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";

import { ClubAdminLayout } from "@/components/club-admin/club-admin-layout";
import { MemberVerifyScreen } from "@/components/members/member-verify-screen";

export default function ClubMemberVerifyPage() {
  const t = useTranslations("Verification");
  const params = useParams();
  const locale = typeof params?.locale === "string" ? params.locale : "en";
  const rawId = params?.id;
  const memberId = typeof rawId === "string" ? Number(rawId) : Number(rawId?.[0]);
  return (
    <ClubAdminLayout title={t("title")}>
      <MemberVerifyScreen memberId={memberId} backHref={`/${locale}/dashboard/club/members/${memberId}`} />
    </ClubAdminLayout>
  );
}
