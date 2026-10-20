"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

export default function MemberCalendarEventRedirect() {
  const router = useRouter();
  const params = useParams();
  useEffect(() => {
    const locale = typeof params.locale === "string" ? params.locale : "en";
    const rawId = params.id;
    const id = typeof rawId === "string" ? rawId : Array.isArray(rawId) ? rawId[0] : "";
    router.replace(`/${locale}/dashboard/member/calendar?edit=${id}`);
  }, [params, router]);
  return null;
}
