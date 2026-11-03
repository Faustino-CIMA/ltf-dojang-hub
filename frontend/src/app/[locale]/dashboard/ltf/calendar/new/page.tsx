"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

export default function LtfCalendarNewRedirect() {
  const router = useRouter();
  const params = useParams();
  useEffect(() => {
    const locale = typeof params.locale === "string" ? params.locale : "en";
    router.replace(`/${locale}/dashboard/ltf/calendar?create=1`);
  }, [params, router]);
  return null;
}
