"use client";

import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";

import { LtfAdminLayout } from "@/components/ltf-admin/ltf-admin-layout";
import { MemberVerifyScreen } from "@/components/members/member-verify-screen";

export default function LtfMemberVerifyPage() {
  const t = useTranslations("Verification");
  const params = useParams();
  const locale = typeof params?.locale === "string" ? params.locale : "en";
  const rawId = params?.id;
  const memberId = typeof rawId === "string" ? Number(rawId) : Number(rawId?.[0]);
  return (
    <LtfAdminLayout title={t("title")}>
      <MemberVerifyScreen memberId={memberId} backHref={`/${locale}/dashboard/ltf/members/${memberId}`} />
    </LtfAdminLayout>
  );
}
