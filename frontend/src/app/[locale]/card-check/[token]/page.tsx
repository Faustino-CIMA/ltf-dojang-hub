"use client";

import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";

import { MemberVerifyScreen } from "@/components/members/member-verify-screen";

export default function CardCheckPage() {
  const t = useTranslations("Verification");
  const params = useParams();
  const locale = typeof params?.locale === "string" ? params.locale : "en";
  const token = typeof params?.token === "string" ? params.token : "";
  return (
    <main className="mx-auto w-full max-w-lg space-y-3 px-4 py-6">
      <h1 className="text-section text-foreground">{t("title")}</h1>
      <MemberVerifyScreen handoffToken={token} locale={locale} backHref={`/${locale}`} />
    </main>
  );
}
