"use client";

import { useEffect } from "react";
import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";

export default function ClubCommitteeRoute() {
  const locale = useLocale();
  const router = useRouter();

  useEffect(() => {
    router.replace(`/${locale}/dashboard/club/settings?tab=committee`);
  }, [locale, router]);

  return null;
}
