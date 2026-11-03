"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

export default function ClubMemberBatchDeleteRedirect() {
  const params = useParams<{ locale: string }>();
  const router = useRouter();
  useEffect(() => {
    router.replace(`/${params.locale || "en"}/dashboard/club/members?batchDelete=1`);
  }, [params.locale, router]);
  return null;
}
