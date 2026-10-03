"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Landmark, Newspaper, Settings, Users } from "lucide-react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

import {
  BrandingLogoUploadPayload,
  BrandingLogosManager,
} from "@/components/branding/branding-logos-manager";
import { ClubAdminLayout } from "@/components/club-admin/club-admin-layout";
import { EmptyState } from "@/components/club-admin/empty-state";
import { useClubSelection } from "@/components/club-selection-provider";
import { deriveBankNameFromIban, isValidIban } from "@/lib/iban";
import {
  BrandingLogo,
  deleteClubLogo,
  getClubLogos,
  getClubCommunicationLanguages,
  getClubs,
  updateClub,
  updateClubLogo,
  uploadClubLogo,
  type ClubCommunicationLanguage,
} from "@/lib/club-admin-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ActionNotices } from "@/components/ui/list-page-chrome";
import { UnderlineTabs } from "@/components/ui/underline-tabs";
import { ClubTrainersPanel } from "@/components/club-admin/club-trainers-panel";
import { CommitteePage } from "@/components/clubmgmt/committee-page";
import { PublicationConsentPanel } from "@/components/clubmgmt/publication-consent-panel";
import { CLUB_MANAGEMENT_MODULE_ID, getModuleStatus, isClubModuleAssigned } from "@/lib/modules-api";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";

const clubSchema = z.object({
  name: z.string().min(1, "Club name is required"),
  address_line1: z.string().optional(),
  address_line2: z.string().optional(),
  postal_code: z.string().optional(),
  locality: z.string().optional(),
  iban: z.string().optional(),
  email: z.string().optional(),
  website: z.string().optional(),
  communication_language: z.string().optional(),
});

type ClubFormValues = z.infer<typeof clubSchema>;

const SETTINGS_TABS = ["profile", "trainers", "committee", "publication"] as const;
type SettingsTab = (typeof SETTINGS_TABS)[number];

function parseSettingsTab(value: string | null): SettingsTab {
  if (value && (SETTINGS_TABS as readonly string[]).includes(value)) {
    return value as SettingsTab;
  }
  return "profile";
}

export default function ClubAdminSettingsPage() {
  const t = useTranslations("ClubAdmin");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { selectedClubId } = useClubSelection();
  const [clubMgmtOn, setClubMgmtOn] = useState(false);
  const [activeTab, setActiveTabState] = useState<SettingsTab>(parseSettingsTab(searchParams.get("tab")));
  const requestIdRef = useRef(0);
  const logoRequestIdRef = useRef(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [clubLogos, setClubLogos] = useState<BrandingLogo[]>([]);
  const [isLoadingLogos, setIsLoadingLogos] = useState(false);
  const [logosLoadError, setLogosLoadError] = useState<string | null>(null);
  const [clubIsActive, setClubIsActive] = useState(true);
  const [languages, setLanguages] = useState<ClubCommunicationLanguage[]>([
    { code: "en", name: "English" },
    { code: "lb", name: "Lëtzebuergesch" },
  ]);

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors, isSubmitting },
  } = useForm<ClubFormValues>({
    resolver: zodResolver(clubSchema),
    defaultValues: {
      name: "",
      address_line1: "",
      address_line2: "",
      postal_code: "",
      locality: "",
      iban: "",
      email: "",
      website: "",
      communication_language: "en",
    },
  });
  const watchedIban = useWatch({ control, name: "iban", defaultValue: "" });
  const derivedBankName = useMemo(
    () => deriveBankNameFromIban(watchedIban),
    [watchedIban]
  );

  const resetToEmpty = useCallback(() => {
    reset({
      name: "",
      address_line1: "",
      address_line2: "",
      postal_code: "",
      locality: "",
      iban: "",
      email: "",
      website: "",
      communication_language: "en",
    });
    setClubIsActive(true);
  }, [reset]);

  const loadSelectedClub = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setIsLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    if (!selectedClubId) {
      resetToEmpty();
      setIsLoading(false);
      return;
    }
    try {
      const clubsResponse = await getClubs();
      if (requestId !== requestIdRef.current) {
        return;
      }
      const club = clubsResponse.find((record) => record.id === selectedClubId);
      if (!club) {
        resetToEmpty();
        return;
      }
      reset({
        name: club.name,
        address_line1: club.address_line1 ?? club.address ?? "",
        address_line2: club.address_line2 ?? "",
        postal_code: club.postal_code ?? "",
        locality: club.locality ?? club.city ?? "",
        iban: club.iban ?? "",
        email: club.email ?? "",
        website: club.website ?? "",
        communication_language: club.communication_language || "en",
      });
      setClubIsActive(club.is_active !== false);
    } catch (error) {
      if (requestId !== requestIdRef.current) {
        return;
      }
      setErrorMessage(error instanceof Error ? error.message : "Failed to load club.");
      resetToEmpty();
    } finally {
      if (requestId === requestIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [reset, resetToEmpty, selectedClubId]);

  const loadLogos = useCallback(async () => {
    const requestId = ++logoRequestIdRef.current;
    if (!selectedClubId) {
      setClubLogos([]);
      setLogosLoadError(null);
      setIsLoadingLogos(false);
      return;
    }
    setIsLoadingLogos(true);
    try {
      const response = await getClubLogos(selectedClubId);
      if (requestId !== logoRequestIdRef.current) {
        return;
      }
      setClubLogos(response.logos);
      setLogosLoadError(null);
    } catch (error) {
      if (requestId !== logoRequestIdRef.current) {
        return;
      }
      setLogosLoadError(error instanceof Error ? error.message : "Failed to load logos.");
    } finally {
      if (requestId === logoRequestIdRef.current) {
        setIsLoadingLogos(false);
      }
    }
  }, [selectedClubId]);

  useEffect(() => {
    void getClubCommunicationLanguages()
      .then(setLanguages)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    void loadSelectedClub();
  }, [loadSelectedClub]);

  useEffect(() => {
    void loadLogos();
  }, [loadLogos]);

  useEffect(() => {
    let cancelled = false;
    getModuleStatus()
      .then((status) => {
        if (!cancelled) {
          setClubMgmtOn(isClubModuleAssigned(status, CLUB_MANAGEMENT_MODULE_ID, selectedClubId));
        }
      })
      .catch(() => {
        if (!cancelled) setClubMgmtOn(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedClubId]);

  useEffect(() => {
    if (searchParams.get("tab") === "membership") {
      router.replace(`/${locale}/dashboard/club/fees`);
    }
  }, [locale, router, searchParams]);

  const setActiveTab = useCallback(
    (tab: SettingsTab) => {
      setActiveTabState(tab);
      const next = new URLSearchParams(searchParams.toString());
      if (tab === "profile") {
        next.delete("tab");
      } else {
        next.set("tab", tab);
      }
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const onSubmit = async (values: ClubFormValues) => {
    if (!selectedClubId) {
      return;
    }
    const normalizedIban = values.iban?.trim() ?? "";
    if (normalizedIban && !isValidIban(normalizedIban)) {
      setErrorMessage("Enter a valid IBAN.");
      return;
    }
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await updateClub(selectedClubId, {
        ...values,
        iban: normalizedIban,
        address: values.address_line1 ?? "",
        city: values.locality ?? "",
      });
      setSuccessMessage(t("clubSaved"));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to update club.");
    }
  };

  const handleUploadLogo = async (payload: BrandingLogoUploadPayload) => {
    if (!selectedClubId) {
      throw new Error("Select a club before uploading a logo.");
    }
    await uploadClubLogo(selectedClubId, payload);
    await loadLogos();
  };

  const handleSelectLogo = async (logoId: number) => {
    if (!selectedClubId) {
      throw new Error("Select a club before choosing a logo.");
    }
    await updateClubLogo(selectedClubId, logoId, { is_selected: true });
    await loadLogos();
  };

  const handleDeleteLogo = async (logoId: number) => {
    if (!selectedClubId) {
      throw new Error("Select a club before deleting a logo.");
    }
    await deleteClubLogo(selectedClubId, logoId);
    await loadLogos();
  };

  return (
    <ClubAdminLayout title={t("clubProfileTitle")} subtitle={t("clubProfileSubtitle")}>
      <ActionNotices
        error={errorMessage}
        success={successMessage}
        onDismiss={() => {
          setErrorMessage(null);
          setSuccessMessage(null);
        }}
      />
      {isLoading ? (
        <EmptyState title={t("loadingTitle")} description={t("loadingSubtitle")} loading />
      ) : !selectedClubId ? (
        <EmptyState title={t("clubProfileTitle")} description={t("selectClubPlaceholder")} />
      ) : (
        <div className="space-y-6">
          <UnderlineTabs
            idPrefix="club-settings"
            ariaLabel={t("clubSettingsTabsAriaLabel")}
            value={(activeTab === "committee" || activeTab === "publication") && !clubMgmtOn ? "profile" : activeTab}
            onChange={setActiveTab}
            options={[
              { value: "profile", label: t("clubSettingsProfileTab"), icon: Settings },
              { value: "trainers", label: t("clubSettingsTrainersTab"), icon: Users },
              ...(clubMgmtOn
                ? [
                    { value: "committee" as const, label: t("clubSettingsCommitteeTab"), icon: Landmark },
                    { value: "publication" as const, label: t("clubSettingsPublicationTab"), icon: Newspaper },
                  ]
                : []),
            ]}
          />

          {activeTab === "committee" && clubMgmtOn ? <CommitteePage variant="club" embed /> : null}
          {activeTab === "publication" && clubMgmtOn ? <PublicationConsentPanel clubId={selectedClubId} /> : null}

          {activeTab === "trainers" ? (
            <ClubTrainersPanel
              clubId={selectedClubId}
              onError={setErrorMessage}
              onSuccess={setSuccessMessage}
            />
          ) : null}

          {activeTab === "profile" || ((activeTab === "committee" || activeTab === "publication") && !clubMgmtOn) ? (
          <>
          <section className="rounded-[var(--radius-card)] border border-border bg-card p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-foreground">{t("clubFormTitle")}</h2>
            <p className="mt-2 text-sm text-muted">{t("clubFormSubtitle")}</p>

            <form className="mt-6 grid gap-4 md:grid-cols-2" onSubmit={handleSubmit(onSubmit)}>
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium text-foreground">{t("clubNameLabel")}</label>
                <Input placeholder="LTF Central Club" {...register("name")} />
                {errors.name ? <p className="text-sm text-destructive">{errors.name.message}</p> : null}
              </div>

              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium text-foreground">{t("addressLine1Label")}</label>
                <Input placeholder="12 Rue de la Gare" {...register("address_line1")} />
              </div>

              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium text-foreground">{t("addressLine2Label")}</label>
                <Input
                  placeholder="Building, floor, unit (optional)"
                  {...register("address_line2")}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">{t("postalCodeLabel")}</label>
                <Input placeholder="1234" {...register("postal_code")} />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">{t("localityLabel")}</label>
                <Input placeholder="Luxembourg" {...register("locality")} />
              </div>

              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium text-foreground">{t("clubEmailLabel")}</label>
                <Input type="email" placeholder="club@example.com" {...register("email")} />
                <p className="text-xs text-muted">{t("clubEmailHint")}</p>
              </div>

              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium text-foreground">{t("clubWebsiteLabel")}</label>
                <Input type="url" placeholder="https://www.club.lu" {...register("website")} />
                <p className="text-xs text-muted">{t("clubWebsiteHint")}</p>
              </div>

              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium text-foreground">{t("clubStatusLabel")}</label>
                <StatusBadge
                  label={clubIsActive ? t("clubStatusActive") : t("clubStatusInactive")}
                  tone={clubIsActive ? "success" : "neutral"}
                />
                <p className="text-xs text-muted">{t("clubStatusHint")}</p>
              </div>

              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium text-foreground">{t("clubLanguageLabel")}</label>
                <Controller
                  name="communication_language"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value || "en"} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {languages.map((language) => (
                          <SelectItem key={language.code} value={language.code}>
                            {language.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <p className="text-xs text-muted">{t("clubLanguageHint")}</p>
              </div>

              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium text-foreground">{t("ibanLabel")}</label>
                <Input placeholder="LU00 0000 0000 0000" {...register("iban")} />
              </div>

              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium text-foreground">{t("bankNameLabel")}</label>
                <Input value={derivedBankName || "-"} readOnly disabled />
              </div>

              <div className="flex items-center gap-3">
                <Button type="submit" disabled={isSubmitting}>
                  {t("saveClub")}
                </Button>
              </div>
            </form>
          </section>

          <BrandingLogosManager
            logos={clubLogos}
            isLoading={isLoadingLogos}
            loadError={logosLoadError}
            onUpload={handleUploadLogo}
            onSelect={handleSelectLogo}
            onDelete={handleDeleteLogo}
          />
          </>
          ) : null}
        </div>
      )}
    </ClubAdminLayout>
  );
}
