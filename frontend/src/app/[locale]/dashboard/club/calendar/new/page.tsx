"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

export default function ClubCalendarNewRedirect() {
  const router = useRouter();
  const params = useParams();
  useEffect(() => {
    const locale = typeof params.locale === "string" ? params.locale : "en";
    router.replace(`/${locale}/dashboard/club/calendar?create=1`);
  }, [params, router]);
  return null;
}
