"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Landmark, Newspaper, Settings, Shirt, Users } from "lucide-react";
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
import { Label, RequiredForm } from "@/components/ui/label";
import { ActionNotices } from "@/components/ui/list-page-chrome";
import { UnderlineTabs } from "@/components/ui/underline-tabs";
import { ClothingSizesDesk } from "@/components/club-admin/clothing-sizes-desk";
import { EgearBrandsDesk } from "@/components/club-admin/egear-brands-desk";
import { ClubTrainersPanel } from "@/components/club-admin/club-trainers-panel";
import { CommitteePage } from "@/components/clubmgmt/committee-page";
import { ClubModulePrices } from "@/components/club-admin/club-module-prices";
import { LuAddressFields } from "@/components/clubmgmt/lu-address-fields";
import { TrainingVenuesSection } from "@/components/clubs/training-venues-section";
import { PopoverSelect } from "@/components/ui/popover-select";
import { isValidRcsNumber, LBR_SEARCH_URL, normalizeRcsNumber } from "@/lib/rcs-number";
import { PublicationConsentPanel } from "@/components/clubmgmt/publication-consent-panel";
import { CLUB_MANAGEMENT_MODULE_ID, COMPETITION_MODULE_ID, getModuleStatus, isClubModuleAssigned } from "@/lib/modules-api";
import { joinStreetLine, splitStreetLine } from "@/lib/address-suggestion";
import { getClubModuleFees, type ClubModuleFeeQuote } from "@/lib/ltf-finance-api";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";

const clubSchema = z.object({
  name: z.string().min(1),
  federation: z.enum(["WT", "ITF"]),
  rcs_number: z.string().optional(),
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

const SETTINGS_TABS = ["profile", "trainers", "committee", "publication", "equipment"] as const;
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
  const [competitionOn, setCompetitionOn] = useState(false);
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
  const [moduleFees, setModuleFees] = useState<ClubModuleFeeQuote | null>(null);
  const [languages, setLanguages] = useState<ClubCommunicationLanguage[]>([
    { code: "en", name: "English" },
    { code: "lb", name: "Lëtzebuergesch" },
  ]);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    control,
    formState: { errors, isSubmitting },
  } = useForm<ClubFormValues>({
    resolver: zodResolver(clubSchema),
    defaultValues: {
      name: "",
      federation: "WT",
      rcs_number: "",
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
  const addressLine1 = useWatch({ control, name: "address_line1", defaultValue: "" }) ?? "";
  const addressLine2 = useWatch({ control, name: "address_line2", defaultValue: "" }) ?? "";
  const postalCode = useWatch({ control, name: "postal_code", defaultValue: "" }) ?? "";
  const localityValue = useWatch({ control, name: "locality", defaultValue: "" }) ?? "";
  const derivedBankName = useMemo(
    () => deriveBankNameFromIban(watchedIban),
    [watchedIban]
  );

  const resetToEmpty = useCallback(() => {
    reset({
      name: "",
      federation: "WT",
      rcs_number: "",
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
        federation: club.federation === "ITF" ? "ITF" : "WT",
        rcs_number: club.rcs_number ?? "",
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
    if (!selectedClubId) {
      setModuleFees(null);
      return;
    }
    let cancelled = false;
    getClubModuleFees(selectedClubId)
      .then((quote) => {
        if (!cancelled) setModuleFees(quote);
      })
      .catch(() => {
        if (!cancelled) setModuleFees(null);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedClubId]);

  useEffect(() => {
    let cancelled = false;
    getModuleStatus()
      .then((status) => {
        if (!cancelled) {
          setClubMgmtOn(isClubModuleAssigned(status, CLUB_MANAGEMENT_MODULE_ID, selectedClubId));
          setCompetitionOn(isClubModuleAssigned(status, COMPETITION_MODULE_ID, selectedClubId));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setClubMgmtOn(false);
          setCompetitionOn(false);
        }
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
    const rcsNumber = normalizeRcsNumber(values.rcs_number ?? "");
    if (normalizedIban && !isValidIban(normalizedIban)) {
      setErrorMessage("Enter a valid IBAN.");
      return;
    }
    if (!isValidRcsNumber(rcsNumber)) {
      setErrorMessage(t("rcsNumberInvalid"));
      return;
    }
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await updateClub(selectedClubId, {
        ...values,
        rcs_number: rcsNumber,
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

  const managementHidden = (activeTab === "committee" || activeTab === "publication") && !clubMgmtOn;
  const equipmentHidden = activeTab === "equipment" && !competitionOn;

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
        <div className="space-y-3">
          <UnderlineTabs
            idPrefix="club-settings"
            ariaLabel={t("clubSettingsTabsAriaLabel")}
            value={managementHidden || equipmentHidden ? "profile" : activeTab}
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
              ...(competitionOn
                ? [{ value: "equipment" as const, label: t("clubSettingsEquipmentTab"), icon: Shirt }]
                : []),
            ]}
          />

          {activeTab === "committee" && clubMgmtOn ? <CommitteePage variant="club" embed /> : null}
          {activeTab === "publication" && clubMgmtOn ? <PublicationConsentPanel clubId={selectedClubId} /> : null}
          {activeTab === "equipment" && competitionOn ? (
            <div className="space-y-6">
              <EgearBrandsDesk clubId={selectedClubId} />
              <ClothingSizesDesk clubId={selectedClubId} />
            </div>
          ) : null}

          {activeTab === "trainers" ? (
            <ClubTrainersPanel
              clubId={selectedClubId}
              onError={setErrorMessage}
              onSuccess={setSuccessMessage}
            />
          ) : null}

          {activeTab === "profile" || managementHidden || equipmentHidden ? (
          <>
          <section className="rounded-[var(--radius-card)] border border-border bg-card p-3">
            <h2 className="text-lg font-semibold text-foreground">{t("clubFormTitle")}</h2>
            <p className="mt-2 text-sm text-muted">{t("clubFormSubtitle")}</p>

            <form className="mt-6" onSubmit={handleSubmit(onSubmit)}>
              <RequiredForm>
                <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="club-name" required>{t("clubNameLabel")}</Label>
                <Input id="club-name" placeholder={t("clubNamePlaceholder")} {...register("name")} />
                {errors.name ? <p className="text-sm text-destructive">{t("clubNameRequired")}</p> : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="club-federation">{t("federationLabel")}</Label>
                <Controller
                  name="federation"
                  control={control}
                  render={({ field }) => (
                    <PopoverSelect
                      className="w-full"
                      value={field.value || "WT"}
                      onValueChange={field.onChange}
                      ariaLabel={t("federationLabel")}
                      options={[
                        { value: "WT", label: t("federationWt") },
                        { value: "ITF", label: t("federationItf") },
                      ]}
                    />
                  )}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="club-rcs">{t("rcsNumberLabel")}</Label>
                <Input id="club-rcs" placeholder={t("rcsNumberPlaceholder")} {...register("rcs_number")} />
                <a
                  href={LBR_SEARCH_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-primary underline-offset-2 hover:underline"
                >
                  {t("openLbrSearch")}
                </a>
              </div>

              <div className="md:col-span-2 space-y-2">
                <div>
                  <h3 className="text-sm font-medium text-foreground">{t("headOfficeLabel")}</h3>
                  <p className="text-xs text-muted">{t("headOfficeHint")}</p>
                </div>
                <LuAddressFields
                  idPrefix="club"
                  showCountry={false}
                  value={{
                    ...splitStreetLine(addressLine1, { postal_code: postalCode, locality: localityValue }),
                    line2: addressLine2,
                    postal_code: postalCode,
                    locality: localityValue,
                    country: "Luxembourg",
                    use_for_invoice: false,
                  }}
                  onChange={(next) => {
                    setValue("address_line1", joinStreetLine(next.house_number, next.street), { shouldDirty: true });
                    setValue("address_line2", next.line2, { shouldDirty: true });
                    setValue("postal_code", next.postal_code, { shouldDirty: true });
                    setValue("locality", next.locality, { shouldDirty: true });
                  }}
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="club-email">{t("clubEmailLabel")}</Label>
                <Input id="club-email" type="email" placeholder={t("clubEmailPlaceholder")} {...register("email")} />
                <p className="text-xs text-muted">{t("clubEmailHint")}</p>
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="club-website">{t("clubWebsiteLabel")}</Label>
                <Input id="club-website" type="url" placeholder={t("clubWebsitePlaceholder")} {...register("website")} />
                <p className="text-xs text-muted">{t("clubWebsiteHint")}</p>
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label>{t("clubStatusLabel")}</Label>
                <StatusBadge
                  label={clubIsActive ? t("clubStatusActive") : t("clubStatusInactive")}
                  tone={clubIsActive ? "success" : "neutral"}
                />
                <p className="text-xs text-muted">{t("clubStatusHint")}</p>
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="club-language">{t("clubLanguageLabel")}</Label>
                <Controller
                  name="communication_language"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value || "en"} onValueChange={field.onChange}>
                      <SelectTrigger id="club-language">
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
                <Label htmlFor="club-iban">{t("ibanLabel")}</Label>
                <Input id="club-iban" placeholder={t("ibanPlaceholder")} {...register("iban")} />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="club-bank">{t("bankNameLabel")}</Label>
                <Input id="club-bank" value={derivedBankName || "-"} readOnly disabled />
              </div>

              <div className="flex items-center gap-3">
                <Button type="submit" disabled={isSubmitting}>
                  {t("saveClub")}
                </Button>
              </div>
                </div>
              </RequiredForm>
            </form>
          </section>

          <TrainingVenuesSection
            clubId={selectedClubId}
            onError={setErrorMessage}
            onSuccess={setSuccessMessage}
          />

          {moduleFees ? <ClubModulePrices quote={moduleFees} /> : null}

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
