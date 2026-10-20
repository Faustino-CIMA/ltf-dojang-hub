"use client";

import { FormEvent, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PopoverSelect } from "@/components/ui/popover-select";
import { SidePanel } from "@/components/ui/side-panel";
import { getClubCommunicationLanguages, type ClubCommunicationLanguage } from "@/lib/club-admin-api";
import { deriveBankNameFromIban, isValidIban } from "@/lib/iban";
import { Club, createClub, updateClub } from "@/lib/ltf-admin-api";

const FORM_ID = "club-form";

type ClubFormValues = {
  name: string;
  address_line1: string;
  address_line2: string;
  postal_code: string;
  locality: string;
  iban: string;
  email: string;
  website: string;
  is_active: boolean;
  communication_language: string;
};

const EMPTY_VALUES: ClubFormValues = {
  name: "",
  address_line1: "",
  address_line2: "",
  postal_code: "",
  locality: "",
  iban: "",
  email: "",
  website: "",
  is_active: true,
  communication_language: "en",
};

function valuesFromClub(club: Club): ClubFormValues {
  return {
    name: club.name ?? "",
    address_line1: club.address_line1 || club.address || "",
    address_line2: club.address_line2 ?? "",
    postal_code: club.postal_code ?? "",
    locality: club.locality || club.city || "",
    iban: club.iban ?? "",
    email: club.email ?? "",
    website: club.website ?? "",
    is_active: club.is_active !== false,
    communication_language: club.communication_language || "en",
  };
}

export function ClubFormPanel({
  open,
  mode,
  club,
  onClose,
  onSaved,
}: {
  open: boolean;
  mode: "create" | "edit";
  club?: Club | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const t = useTranslations("LtfAdmin");
  const common = useTranslations("Common");
  const [values, setValues] = useState<ClubFormValues>(EMPTY_VALUES);
  const [languages, setLanguages] = useState<ClubCommunicationLanguage[]>([
    { code: "en", name: "English" },
    { code: "lb", name: "Lëtzebuergesch" },
  ]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }
    setErrorMessage(null);
    setValues(mode === "edit" && club ? valuesFromClub(club) : EMPTY_VALUES);
  }, [open, mode, club]);

  useEffect(() => {
    if (!open || mode !== "edit") {
      return;
    }
    void getClubCommunicationLanguages()
      .then(setLanguages)
      .catch(() => undefined);
  }, [open, mode]);

  const setField = (field: keyof ClubFormValues, value: string | boolean) => {
    setValues((previous) => ({ ...previous, [field]: value }));
  };

  const derivedBankName = deriveBankNameFromIban(values.iban);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = values.name.trim();
    if (!name) {
      setErrorMessage("Club name is required");
      return;
    }
    const postalCode = values.postal_code.trim();
    const normalizedIban = values.iban.trim();
    if (postalCode && !/^\d{4}$/.test(postalCode)) {
      setErrorMessage("Postal code must be 4 digits for Luxembourg.");
      return;
    }
    if (normalizedIban && !isValidIban(normalizedIban)) {
      setErrorMessage("Enter a valid IBAN.");
      return;
    }
    setIsSaving(true);
    setErrorMessage(null);
    const payload = {
      name,
      address_line1: values.address_line1.trim(),
      address_line2: values.address_line2.trim(),
      postal_code: postalCode,
      locality: values.locality.trim(),
      iban: normalizedIban,
      email: values.email.trim(),
      website: values.website.trim(),
      city: values.locality.trim(),
      address: values.address_line1.trim(),
      ...(mode === "edit"
        ? {
            is_active: values.is_active,
            communication_language: values.communication_language,
          }
        : {}),
    };
    try {
      if (mode === "edit" && club) {
        await updateClub(club.id, payload);
      } else {
        await createClub(payload);
      }
      await onSaved();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to save club details.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SidePanel
      open={open}
      wide
      title={mode === "edit" ? t("editAction") : t("createClub")}
      description={t("clubFormSubtitle")}
      closeLabel={common("modalClose")}
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>
            {t("cancelEdit")}
          </Button>
          <Button type="submit" form={FORM_ID} disabled={isSaving}>
            {isSaving ? t("savingAction") : mode === "edit" ? t("saveChanges") : t("createClub")}
          </Button>
        </>
      }
    >
      <form id={FORM_ID} className="grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
        {errorMessage ? <p className="text-sm text-destructive md:col-span-2">{errorMessage}</p> : null}
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="club-name" required>
            {t("clubNameLabel")}
          </Label>
          <Input
            id="club-name"
            value={values.name}
            placeholder="LTF Central Club"
            onChange={(event) => setField("name", event.target.value)}
          />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="club-address-1">{t("addressLine1Label")}</Label>
          <Input
            id="club-address-1"
            value={values.address_line1}
            placeholder="12 Rue de la Gare"
            onChange={(event) => setField("address_line1", event.target.value)}
          />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="club-address-2">{t("addressLine2Label")}</Label>
          <Input
            id="club-address-2"
            value={values.address_line2}
            placeholder="Building, floor, unit (optional)"
            onChange={(event) => setField("address_line2", event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="club-postal">{t("postalCodeLabel")}</Label>
          <Input
            id="club-postal"
            value={values.postal_code}
            placeholder="1234"
            onChange={(event) => setField("postal_code", event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="club-locality">{t("localityLabel")}</Label>
          <Input
            id="club-locality"
            value={values.locality}
            placeholder="Luxembourg"
            onChange={(event) => setField("locality", event.target.value)}
          />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="club-email">{t("clubEmailLabel")}</Label>
          <Input
            id="club-email"
            type="email"
            value={values.email}
            placeholder="club@example.com"
            onChange={(event) => setField("email", event.target.value)}
          />
          <p className="text-xs text-muted">{t("clubEmailHint")}</p>
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="club-website">{t("clubWebsiteLabel")}</Label>
          <Input
            id="club-website"
            type="url"
            value={values.website}
            placeholder="https://www.club.lu"
            onChange={(event) => setField("website", event.target.value)}
          />
          <p className="text-xs text-muted">{t("clubWebsiteHint")}</p>
        </div>
        {mode === "edit" ? (
          <>
            <div className="flex items-center gap-2 md:col-span-2">
              <Checkbox
                id="club-is-active"
                checked={values.is_active}
                onCheckedChange={(value) => setField("is_active", value === true)}
              />
              <Label htmlFor="club-is-active">{t("clubStatusActive")}</Label>
              <p className="text-xs text-muted">{t("clubStatusHint")}</p>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="club-language">{t("clubLanguageLabel")}</Label>
              <PopoverSelect
                className="w-full"
                value={values.communication_language}
                onValueChange={(value) => setField("communication_language", value)}
                ariaLabel={t("clubLanguageLabel")}
                options={languages.map((language) => ({ value: language.code, label: language.name }))}
              />
              <p className="text-xs text-muted">{t("clubLanguageHint")}</p>
            </div>
          </>
        ) : null}
        <div className="space-y-2">
          <Label htmlFor="club-iban">{t("ibanLabel")}</Label>
          <Input
            id="club-iban"
            value={values.iban}
            placeholder="LU28 0019 4006 4475 0000"
            onChange={(event) => setField("iban", event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="club-bank">{t("bankNameLabel")}</Label>
          <Input id="club-bank" value={derivedBankName || "-"} readOnly />
        </div>
      </form>
    </SidePanel>
  );
}
