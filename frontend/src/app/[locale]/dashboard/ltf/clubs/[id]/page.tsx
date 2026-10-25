"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";

import {
  BrandingLogoUploadPayload,
  BrandingLogosManager,
  } from "@/components/branding/branding-logos-manager";
import { TrainingVenuesSection } from "@/components/clubs/training-venues-section";
import { ClubFormPanel } from "@/components/ltf-admin/club-form-panel";
import { LtfAdminLayout } from "@/components/ltf-admin/ltf-admin-layout";
import { EmptyState } from "@/components/club-admin/empty-state";
import { Button } from "@/components/ui/button";
import {
  FormPanel,
  ActionNotices
} from "@/components/ui/list-page-chrome";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  BrandingLogo,
  Club,
  deleteClubLogo,
  getClub,
  getClubLogos,
  updateClubLogo,
  uploadClubLogo,
} from "@/lib/ltf-admin-api";
import { getClubCommunicationLanguages, type ClubCommunicationLanguage } from "@/lib/club-admin-api";

export default function LtfClubDetailPage() {
  const t = useTranslations("LtfAdmin");
  const params = useParams();
  const rawLocale = params?.locale;
  const rawId = params?.id;
  const locale = typeof rawLocale === "string" ? rawLocale : "en";
  const clubId = typeof rawId === "string" ? Number(rawId) : Number(rawId?.[0]);

  const [club, setClub] = useState<Club | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [overviewOpen, setOverviewOpen] = useState(false);
  const [clubLogos, setClubLogos] = useState<BrandingLogo[]>([]);
  const [isLoadingLogos, setIsLoadingLogos] = useState(false);
  const [logosLoadError, setLogosLoadError] = useState<string | null>(null);
  const [languages, setLanguages] = useState<ClubCommunicationLanguage[]>([
    { code: "en", name: "English" },
    { code: "lb", name: "Lëtzebuergesch" },
  ]);

  useEffect(() => {
    void getClubCommunicationLanguages()
      .then(setLanguages)
      .catch(() => undefined);
  }, []);

  const loadClub = useCallback(async () => {
    if (!clubId) {
      setErrorMessage(t("unknownClub"));
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await getClub(clubId);
      setClub(response);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load club.");
    } finally {
      setIsLoading(false);
    }
  }, [clubId, t]);

  const loadLogos = useCallback(async () => {
    if (!clubId) {
      return;
    }
    setIsLoadingLogos(true);
    setLogosLoadError(null);
    try {
      const response = await getClubLogos(clubId);
      setClubLogos(response.logos);
    } catch (error) {
      setLogosLoadError(error instanceof Error ? error.message : "Failed to load logos.");
    } finally {
      setIsLoadingLogos(false);
    }
  }, [clubId]);

  useEffect(() => {
    void loadClub();
  }, [loadClub]);

  useEffect(() => {
    void loadLogos();
  }, [loadLogos]);

  const handleUploadLogo = async (payload: BrandingLogoUploadPayload) => {
    if (!clubId) {
      throw new Error("Club not found.");
    }
    await uploadClubLogo(clubId, payload);
    await loadLogos();
  };

  const handleSelectLogo = async (logoId: number) => {
    if (!clubId) {
      throw new Error("Club not found.");
    }
    await updateClubLogo(clubId, logoId, { is_selected: true });
    await loadLogos();
  };

  const handleDeleteLogo = async (logoId: number) => {
    if (!clubId) {
      throw new Error("Club not found.");
    }
    await deleteClubLogo(clubId, logoId);
    await loadLogos();
  };

  const title = club ? t("clubDetailTitle", { club: club.name }) : t("clubDetailTitleFallback");

  return (
    <LtfAdminLayout title={title} subtitle={t("clubDetailSubtitle")}>
      <div className="space-y-3">
        <div className="flex flex-col gap-3">
          <Button variant="outline" className="w-fit" asChild>
            <Link href={`/${locale}/dashboard/ltf/clubs`}>{t("backToClubs")}</Link>
          </Button>
        </div>

        <ActionNotices error={errorMessage} onDismiss={() => setErrorMessage(null)} />

        {isLoading ? (
          <EmptyState title={t("loadingTitle")} description={t("loadingSubtitle")} loading />
        ) : !club ? (
          <EmptyState title={t("noResultsTitle")} description={t("noClubsResultsSubtitle")} />
        ) : (
          <div className="space-y-3">
            <FormPanel>
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-section text-foreground">{t("clubOverviewTab")}</h2>
                <Button size="sm" variant="outline" onClick={() => setOverviewOpen(true)}>
                  {t("editAction")}
                </Button>
              </div>

                              <div className="mt-4 grid gap-3 text-sm text-foreground md:grid-cols-2">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted">{t("clubNameLabel")}</span>
                    <span className="font-medium">{club.name}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted">{t("federationLabel")}</span>
                    <StatusBadge label={club.federation === "ITF" ? t("federationItf") : t("federationWt")} tone="neutral" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted">{t("rcsNumberLabel")}</span>
                    <span className="font-medium">{club.rcs_number || "-"}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted">{t("postalCodeLabel")}</span>
                    <span className="font-medium">{club.postal_code || "-"}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted">{t("localityLabel")}</span>
                    <span className="font-medium">{club.locality || club.city || "-"}</span>
                  </div>
                  <div className="flex flex-col gap-1 md:col-span-2">
                    <span className="text-xs text-muted">{t("headOfficeLabel")}</span>
                    <span className="font-medium">{club.address_line1 || club.address || "-"}</span>
                  </div>
                  <div className="flex flex-col gap-1 md:col-span-2">
                    <span className="text-xs text-muted">{t("addressLine2Label")}</span>
                    <span className="font-medium">{club.address_line2 || "-"}</span>
                  </div>
                  <div className="flex flex-col gap-1 md:col-span-2">
                    <span className="text-xs text-muted">{t("clubEmailLabel")}</span>
                    <span className="font-medium">{club.email || "-"}</span>
                  </div>
                  <div className="flex flex-col gap-1 md:col-span-2">
                    <span className="text-xs text-muted">{t("clubWebsiteLabel")}</span>
                    <span className="font-medium">{club.website || "-"}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted">{t("ibanLabel")}</span>
                    <span className="font-medium">{club.iban || "-"}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted">{t("bankNameLabel")}</span>
                    <span className="font-medium">{club.bank_name || "-"}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted">{t("maxAdminsLabel")}</span>
                    <span className="font-medium">{club.max_admins}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted">{t("clubStatusLabel")}</span>
                    <StatusBadge
                      label={club.is_active ? t("clubStatusActive") : t("clubStatusInactive")}
                      tone={club.is_active ? "success" : "neutral"}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted">{t("clubLanguageLabel")}</span>
                    <span className="font-medium">
                      {languages.find((item) => item.code === club.communication_language)?.name ||
                        club.communication_language ||
                        "en"}
                    </span>
                  </div>
                </div>
            </FormPanel>

            {Number.isFinite(clubId) ? (
              <TrainingVenuesSection clubId={clubId} onError={setErrorMessage} />
            ) : null}

            <BrandingLogosManager
              logos={clubLogos}
              isLoading={isLoadingLogos}
              loadError={logosLoadError}
              onUpload={handleUploadLogo}
              onSelect={handleSelectLogo}
              onDelete={handleDeleteLogo}
            />
          </div>
        )}
      </div>
      <ClubFormPanel
        open={overviewOpen}
        mode="edit"
        club={club}
        onClose={() => setOverviewOpen(false)}
        onSaved={async () => {
          setOverviewOpen(false);
          await loadClub();
        }}
      />
    </LtfAdminLayout>
  );
}

