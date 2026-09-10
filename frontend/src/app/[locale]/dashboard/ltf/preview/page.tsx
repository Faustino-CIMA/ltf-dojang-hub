"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

import { LtfAdminLayout } from "@/components/ltf-admin/ltf-admin-layout";
import { ComingSoonPanel } from "@/components/modules/coming-soon-panel";
import { getPreviewModule } from "@/lib/modules-api";

export default function LtfPreviewPage() {
  const t = useTranslations("LtfAdmin");
  const locale = useLocale();
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    getPreviewModule()
      .then(() => {
        if (!cancelled) setAllowed(true);
      })
      .catch(() => {
        if (!cancelled) {
          setAllowed(false);
          router.replace(`/${locale}/dashboard/ltf`);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [locale, router]);

  return (
    <LtfAdminLayout title={t("previewTitle")} subtitle={t("previewSubtitle")}>
      {allowed ? (
        <ComingSoonPanel title={t("previewComingSoonTitle")} description={t("previewComingSoonBody")} />
      ) : (
        <ComingSoonPanel title={t("previewUnavailableTitle")} description={t("previewUnavailableBody")} />
      )}
    </LtfAdminLayout>
  );
}
