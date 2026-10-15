"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

import { useClubSelection } from "@/components/club-selection-provider";
import { LtfAdminLayout } from "@/components/ltf-admin/ltf-admin-layout";
import { ImportWizardPage } from "@/components/import/import-wizard-page";
import { ActionNotices } from "@/components/ui/list-page-chrome";
import { LoadingCardGrid } from "@/components/ui/loading-card";
import { getClubs } from "@/lib/ltf-admin-api";

type ClubOption = {
  id: number;
  name: string;
};

export default function LtfImportPage() {
  const t = useTranslations("Import");
  const ltfT = useTranslations("LtfAdmin");
  const pathname = usePathname();
  const router = useRouter();
  const locale = pathname?.split("/")[1] || "en";
  const searchParams = useSearchParams();
  const legacyMemberImport = searchParams.get("type") === "members";

  const [clubOptions, setClubOptions] = useState<ClubOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { selectedClubId } = useClubSelection();

  useEffect(() => {
    if (legacyMemberImport) {
      router.replace(`/${locale}/dashboard/ltf/members/import`);
    }
  }, [legacyMemberImport, locale, router]);

  useEffect(() => {
    let isMounted = true;
    const loadClubs = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const clubs = await getClubs();
        if (!isMounted) {
          return;
        }
        setClubOptions(clubs.map((club) => ({ id: club.id, name: club.name })));
      } catch (loadError) {
        if (!isMounted) {
          return;
        }
        setError(loadError instanceof Error ? loadError.message : t("loadClubsFailed"));
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void loadClubs();

    return () => {
      isMounted = false;
    };
  }, [t]);

  const fieldsByType = useMemo(
    () => ({
      clubs: [
        { key: "name", label: t("clubNameLabel"), required: true },
        { key: "address_line1", label: t("addressLine1Label") },
        { key: "address_line2", label: t("addressLine2Label") },
        { key: "postal_code", label: t("postalCodeLabel") },
        { key: "locality", label: t("localityLabel") },
        { key: "iban", label: t("ibanLabel") },
      ],
      members: [
        { key: "first_name", label: t("firstNameLabel"), required: true },
        { key: "last_name", label: t("lastNameLabel"), required: true },
        { key: "sex", label: t("sexLabel") },
        { key: "email", label: t("emailLabel") },
        { key: "date_of_birth", label: t("dobLabel") },
        { key: "belt_rank", label: t("beltRankLabel") },
        { key: "wt_licenseid", label: t("wtLicenseLabel") },
        { key: "ltf_licenseid", label: t("ltfLicenseLabel") },
        { key: "primary_license_role", label: t("primaryLicenseRoleLabel") },
        { key: "secondary_license_role", label: t("secondaryLicenseRoleLabel") },
        { key: "is_active", label: t("isActiveLabel") },
      ],
    }),
    [t]
  );

  if (legacyMemberImport) {
    return (
      <LtfAdminLayout title={t("importMembers")} subtitle={t("wizardSubtitleMembers")}>
        <LoadingCardGrid title={ltfT("loadingTitle")} description={ltfT("loadingSubtitle")} />
      </LtfAdminLayout>
    );
  }

  return (
    <LtfAdminLayout title={t("importClubs")} subtitle={t("importClubsSubtitle")}>
      <ActionNotices error={error} onDismiss={() => setError(null)} />
      {isLoading && clubOptions.length === 0 ? (
        <LoadingCardGrid title={ltfT("loadingTitle")} description={ltfT("loadingSubtitle")} />
      ) : null}
      <ImportWizardPage
        allowedTypes={["clubs"]}
        defaultType="clubs"
        allowClubSelection={!selectedClubId}
        fixedClubId={selectedClubId}
        clubOptions={clubOptions}
        fieldsByType={fieldsByType}
        backHrefByType={{
          clubs: `/${locale}/dashboard/ltf/clubs`,
          members: `/${locale}/dashboard/ltf/members`,
        }}
        successHrefByType={{
          clubs: `/${locale}/dashboard/ltf/clubs`,
          members: `/${locale}/dashboard/ltf/members`,
        }}
      />
    </LtfAdminLayout>
  );
}
