"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

export default function ClubMemberDeleteRedirect() {
  const params = useParams<{ locale: string; id: string }>();
  const router = useRouter();
  useEffect(() => {
    const locale = params.locale || "en";
    router.replace(`/${locale}/dashboard/club/members?delete=${params.id}`);
  }, [params.id, params.locale, router]);
  return null;
}
