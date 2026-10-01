"use client";

import { useEffect } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";

import { EmptyState } from "@/components/club-admin/empty-state";

export default function ClubShopHomePage() {
  const t = useTranslations("ClubMgmt");
  const locale = useLocale();
  const router = useRouter();

  useEffect(() => {
    router.replace(`/${locale}/dashboard/club/shop/sell`);
  }, [locale, router]);

  return <EmptyState title={t("shopLoadingTitle")} description={t("shopLoadingSell")} loading />;
}
