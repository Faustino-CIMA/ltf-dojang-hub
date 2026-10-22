"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

import {
  BrandingLogoUploadPayload,
  BrandingLogosManager,
} from "@/components/branding/branding-logos-manager";
import { LtfAdminLayout } from "@/components/ltf-admin/ltf-admin-layout";
import { EmptyState } from "@/components/club-admin/empty-state";
import { LoadingCard } from "@/components/ui/loading-card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ActionNotices, FormPanel } from "@/components/ui/list-page-chrome";
import { Modal } from "@/components/ui/modal";
import { deriveBankNameFromIban, isValidIban } from "@/lib/iban";
import {
  BrandingLogo,
  LtfLicensePrefixRewritePreview,
  applyLtfLicensePrefixRewrite,
  deleteFederationLogo,
  getFederationLogos,
  getFederationProfile,
  getLtfLicensePrefixRewritePreview,
  updateFederationLogo,
  updateFederationProfile,
  uploadFederationLogo,
} from "@/lib/ltf-admin-api";

const federationSchema = z.object({
  name: z.string().min(1, "Federation name is required"),
  address_line1: z.string().optional(),
  address_line2: z.string().optional(),
  postal_code: z.string().optional(),
  locality: z.string().optional(),
  iban: z
    .string()
    .optional()
    .refine((value) => !value || isValidIban(value), "Enter a valid IBAN."),
  club_tourist_transfer_threshold: z.coerce.number().int().min(1).max(99),
});

type FederationFormValues = z.infer<typeof federationSchema>;

export default function LtfAdminSettingsPage() {
  const t = useTranslations("LtfAdmin");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [logos, setLogos] = useState<BrandingLogo[]>([]);
  const [isLoadingLogos, setIsLoadingLogos] = useState(false);
  const [logosLoadError, setLogosLoadError] = useState<string | null>(null);
  const [rewriteOnImport, setRewriteOnImport] = useState(false);
  const [savedRewriteOnImport, setSavedRewriteOnImport] = useState(false);
  const [importRewriteSuccess, setImportRewriteSuccess] = useState<string | null>(null);
  const [importRewriteError, setImportRewriteError] = useState<string | null>(null);
  const [isSavingRewrite, setIsSavingRewrite] = useState(false);
  const [rewritePreview, setRewritePreview] = useState<LtfLicensePrefixRewritePreview | null>(null);
  const [isLoadingRewritePreview, setIsLoadingRewritePreview] = useState(false);
  const [isApplyingRewrite, setIsApplyingRewrite] = useState(false);
  const [isRewriteConfirmOpen, setIsRewriteConfirmOpen] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors, isSubmitting },
  } = useForm<FederationFormValues>({
    resolver: zodResolver(federationSchema),
    defaultValues: {
      name: "",
      address_line1: "",
      address_line2: "",
      postal_code: "",
      locality: "",
      iban: "",
      club_tourist_transfer_threshold: 3,
    },
  });
  const watchedIban = useWatch({ control, name: "iban", defaultValue: "" });
  const derivedBankName = deriveBankNameFromIban(watchedIban);

  const loadProfile = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const profile = await getFederationProfile();
      reset({
        name: profile.name,
        address_line1: profile.address_line1 ?? "",
        address_line2: profile.address_line2 ?? "",
        postal_code: profile.postal_code ?? "",
        locality: profile.locality ?? "",
        iban: profile.iban ?? "",
        club_tourist_transfer_threshold: profile.club_tourist_transfer_threshold ?? 3,
      });
      const rewriteEnabled = Boolean(profile.rewrite_lux_prefix_on_member_import);
      setRewriteOnImport(rewriteEnabled);
      setSavedRewriteOnImport(rewriteEnabled);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : t("federationSettingsLoadError")
      );
    } finally {
      setIsLoading(false);
    }
  }, [reset, t]);

  const loadLogos = useCallback(async () => {
    setIsLoadingLogos(true);
    try {
      const response = await getFederationLogos();
      setLogos(response.logos);
      setLogosLoadError(null);
    } catch (error) {
      setLogosLoadError(error instanceof Error ? error.message : "Failed to load logos.");
    } finally {
      setIsLoadingLogos(false);
    }
  }, []);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    void loadLogos();
  }, [loadLogos]);

  const loadRewritePreview = useCallback(async () => {
    setIsLoadingRewritePreview(true);
    try {
      const preview = await getLtfLicensePrefixRewritePreview();
      setRewritePreview(preview);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : t("existingPrefixRewriteLoadError")
      );
    } finally {
      setIsLoadingRewritePreview(false);
    }
  }, [t]);

  useEffect(() => {
    void loadRewritePreview();
  }, [loadRewritePreview]);

  const handleSaveImportRewrite = async () => {
    setImportRewriteError(null);
    setImportRewriteSuccess(null);
    setIsSavingRewrite(true);
    try {
      await updateFederationProfile({
        rewrite_lux_prefix_on_member_import: rewriteOnImport,
      });
      setSavedRewriteOnImport(rewriteOnImport);
      setImportRewriteSuccess(t("importPrefixRewriteSaved"));
    } catch (error) {
      setImportRewriteError(
        error instanceof Error ? error.message : t("federationSettingsSaveError")
      );
    } finally {
      setIsSavingRewrite(false);
    }
  };

  const handleApplyExistingRewrite = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsApplyingRewrite(true);
    try {
      const result = await applyLtfLicensePrefixRewrite();
      setRewritePreview(result);
      setIsRewriteConfirmOpen(false);
      setSuccessMessage(
        t("existingPrefixRewriteSuccess", {
          rewritten: result.rewritten,
          skipped: result.conflict_count,
        })
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : t("existingPrefixRewriteError")
      );
    } finally {
      setIsApplyingRewrite(false);
    }
  };

  const onSubmit = async (values: FederationFormValues) => {
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const saved = await updateFederationProfile(values);
      reset({
        name: saved.name,
        address_line1: saved.address_line1 ?? "",
        address_line2: saved.address_line2 ?? "",
        postal_code: saved.postal_code ?? "",
        locality: saved.locality ?? "",
        iban: saved.iban ?? "",
        club_tourist_transfer_threshold: saved.club_tourist_transfer_threshold ?? 3,
      });
      setSuccessMessage(t("federationSettingsSaved"));
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : t("federationSettingsSaveError")
      );
    }
  };

  const handleUploadLogo = async (payload: BrandingLogoUploadPayload) => {
    await uploadFederationLogo(payload);
    await loadLogos();
  };

  const handleSelectLogo = async (logoId: number) => {
    await updateFederationLogo(logoId, { is_selected: true });
    await loadLogos();
  };

  const handleDeleteLogo = async (logoId: number) => {
    await deleteFederationLogo(logoId);
    await loadLogos();
  };

  return (
    <LtfAdminLayout
      title={t("federationSettingsTitle")}
      subtitle={t("federationSettingsSubtitle")}
    >
      <ActionNotices
        error={errorMessage || importRewriteError}
        success={successMessage || importRewriteSuccess}
        onDismiss={() => {
          setErrorMessage(null);
          setSuccessMessage(null);
          setImportRewriteError(null);
          setImportRewriteSuccess(null);
        }}
      />
      {isLoading ? (
        <EmptyState title={t("loadingTitle")} description={t("loadingSubtitle")} loading />
      ) : (
        <div className="space-y-3">
          <FormPanel>
          <h2 className="text-section text-foreground">
            {t("federationSettingsFormTitle")}
          </h2>
          <p className="mt-2 text-sm text-muted">
            {t("federationSettingsFormSubtitle")}
          </p>

          <form className="mt-6" onSubmit={handleSubmit(onSubmit)}>
            <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="federation-name" required>{t("federationNameLabel")}</Label>
              <Input id="federation-name" placeholder={t("federationNamePlaceholder")} {...register("name")} />
              {errors.name ? <p className="text-sm text-destructive">{t("federationNameRequired")}</p> : null}
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="federation-address-1">{t("addressLine1Label")}</Label>
              <Input id="federation-address-1" placeholder={t("addressLine1Placeholder")} {...register("address_line1")} />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="federation-address-2">{t("addressLine2Label")}</Label>
              <Input
                id="federation-address-2"
                placeholder={t("addressLine2Placeholder")}
                {...register("address_line2")}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="federation-postal">{t("postalCodeLabel")}</Label>
              <Input id="federation-postal" placeholder={t("postalCodePlaceholder")} {...register("postal_code")} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="federation-locality">{t("localityLabel")}</Label>
              <Input id="federation-locality" placeholder={t("localityPlaceholder")} {...register("locality")} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="federation-iban">{t("ibanLabel")}</Label>
              <Input id="federation-iban" placeholder={t("ibanPlaceholder")} {...register("iban")} />
              {errors.iban ? <p className="text-sm text-destructive">{errors.iban.message}</p> : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="federation-bank">{t("bankNameLabel")}</Label>
              <Input id="federation-bank" value={derivedBankName || "-"} readOnly />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label required>
                {t("clubTouristThresholdLabel")}
              </Label>
              <Input
                type="number"
                min={1}
                max={99}
                {...register("club_tourist_transfer_threshold")}
              />
              <p className="text-xs text-muted">{t("clubTouristThresholdHint")}</p>
              {errors.club_tourist_transfer_threshold ? (
                <p className="text-sm text-destructive">
                  {errors.club_tourist_transfer_threshold.message}
                </p>
              ) : null}
            </div>

            <div className="flex items-center gap-3">
              <Button type="submit" disabled={isSubmitting}>
                {t("saveFederationSettings")}
              </Button>
            </div>
            </div>
          </form>

          </FormPanel>

          <FormPanel className="space-y-3">
            <h2 className="text-section text-foreground">{t("importPrefixRewriteTitle")}</h2>
            <p className="text-sm text-muted">{t("importPrefixRewriteHint")}</p>
            <label className="flex items-start gap-2 text-sm text-foreground">
              <Checkbox
                checked={rewriteOnImport}
                onCheckedChange={(checked) => {
                  setRewriteOnImport(checked === true);
                  setImportRewriteSuccess(null);
                  setImportRewriteError(null);
                }}
              />
              <span>{t("importPrefixRewriteLabel")}</span>
            </label>
            <Button
              type="button"
              onClick={() => void handleSaveImportRewrite()}
              disabled={isSavingRewrite || rewriteOnImport === savedRewriteOnImport}
            >
              {isSavingRewrite ? t("savingAction") : t("saveImportPrefixRewrite")}
            </Button>
          </FormPanel>

          <FormPanel className="space-y-3">
            <h2 className="text-section text-foreground">{t("existingPrefixRewriteTitle")}</h2>
            <p className="text-sm text-muted">{t("existingPrefixRewriteSubtitle")}</p>
            {isLoadingRewritePreview ? (
              <LoadingCard title={t("loadingTitle")} description={t("loadingSubtitle")} />
            ) : rewritePreview ? (
              <p className="text-sm text-foreground">
                {t("existingPrefixRewritePreview", {
                  count: rewritePreview.candidate_count,
                  conflicts: rewritePreview.conflict_count,
                })}
              </p>
            ) : null}
            <Button
              type="button"
              variant="outline"
              disabled={!rewritePreview || rewritePreview.candidate_count === 0 || isApplyingRewrite}
              onClick={() => setIsRewriteConfirmOpen(true)}
            >
              {t("existingPrefixRewriteAction")}
            </Button>
          </FormPanel>

          <Modal
            title={t("existingPrefixRewriteAction")}
            isOpen={isRewriteConfirmOpen}
            onClose={() => setIsRewriteConfirmOpen(false)}
          >
            <p className="text-sm text-muted">
              {t("existingPrefixRewriteConfirm", {
                count: rewritePreview?.candidate_count ?? 0,
              })}
            </p>
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <Button variant="outline" onClick={() => setIsRewriteConfirmOpen(false)}>
                {t("existingPrefixRewriteCancel")}
              </Button>
              <Button onClick={() => void handleApplyExistingRewrite()} disabled={isApplyingRewrite}>
                {isApplyingRewrite ? t("savingAction") : t("existingPrefixRewriteAction")}
              </Button>
            </div>
          </Modal>

          <BrandingLogosManager
            logos={logos}
            isLoading={isLoadingLogos}
            loadError={logosLoadError}
            onUpload={handleUploadLogo}
            onSelect={handleSelectLogo}
            onDelete={handleDeleteLogo}
          />
        </div>
      )}
    </LtfAdminLayout>
  );
}
