"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

import { ClubAdminLayout } from "@/components/club-admin/club-admin-layout";
import { useClubSelection } from "@/components/club-selection-provider";
import { ComingSoonPanel } from "@/components/modules/coming-soon-panel";
import { getPreviewModule } from "@/lib/modules-api";

export default function ClubPreviewPage() {
  const t = useTranslations("ClubAdmin");
  const locale = useLocale();
  const router = useRouter();
  const { selectedClubId } = useClubSelection();
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (selectedClubId == null) {
      setAllowed(false);
      return;
    }
    getPreviewModule(selectedClubId)
      .then(() => {
        if (!cancelled) setAllowed(true);
      })
      .catch(() => {
        if (!cancelled) {
          setAllowed(false);
          router.replace(`/${locale}/dashboard/club`);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [locale, router, selectedClubId]);

  return (
    <ClubAdminLayout title={t("previewTitle")} subtitle={t("previewSubtitle")}>
      {allowed ? (
        <ComingSoonPanel title={t("previewComingSoonTitle")} description={t("previewComingSoonBody")} />
      ) : (
        <ComingSoonPanel title={t("previewUnavailableTitle")} description={t("previewUnavailableBody")} />
      )}
    </ClubAdminLayout>
  );
}
