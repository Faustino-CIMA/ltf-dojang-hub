"use client";

import { useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AppTextarea } from "@/components/ui/list-page-chrome";
import { SidePanel } from "@/components/ui/side-panel";
import type { PrinterProfile } from "@/lib/license-card-api";

export type PrinterProfileFormValues = {
  name: string;
  x_offset_mm: number;
  y_offset_mm: number;
  description: string;
};

export const EMPTY_PRINTER_PROFILE: PrinterProfileFormValues = {
  name: "",
  x_offset_mm: 0,
  y_offset_mm: 0,
  description: "",
};

export function printerProfileInitial(profile: PrinterProfile | null): PrinterProfileFormValues {
  if (!profile) {
    return EMPTY_PRINTER_PROFILE;
  }
  const xOffset = Number(profile.x_offset_mm);
  const yOffset = Number(profile.y_offset_mm);
  return {
    name: profile.name,
    x_offset_mm: Number.isFinite(xOffset) ? xOffset : 0,
    y_offset_mm: Number.isFinite(yOffset) ? yOffset : 0,
    description: profile.description ?? "",
  };
}

const FORM_ID = "printer-profile-form";

export function PrinterProfilePanel({
  open,
  editing,
  formKey,
  initialValues,
  onClose,
  onSubmit,
}: {
  open: boolean;
  editing: boolean;
  formKey: string;
  initialValues: PrinterProfileFormValues;
  onClose: () => void;
  onSubmit: (values: PrinterProfileFormValues) => Promise<void>;
}) {
  const t = useTranslations("LtfAdmin");
  const common = useTranslations("Common");
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PrinterProfileFormValues>({
    defaultValues: initialValues,
  });
  const initialRef = useRef(initialValues);
  initialRef.current = initialValues;

  useEffect(() => {
    if (open) {
      reset(initialRef.current);
    }
  }, [open, formKey, reset]);

  return (
    <SidePanel
      open={open}
      title={editing ? t("printerProfilesEditModalTitle") : t("printerProfilesCreateModalTitle")}
      description={t("printerProfilesFormSubtitle")}
      closeLabel={common("modalClose")}
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
            {t("cancelEdit")}
          </Button>
          <Button type="submit" form={FORM_ID} disabled={isSubmitting}>
            {isSubmitting
              ? t("printerProfilesSavingAction")
              : editing
                ? t("printerProfilesUpdateAction")
                : t("printerProfilesCreateAction")}
          </Button>
        </>
      }
    >
      <form
        id={FORM_ID}
        className="space-y-3"
        onSubmit={handleSubmit(async (values) => {
          await onSubmit(values);
        })}
      >
        <div className="space-y-2">
          <Label htmlFor="printer-profile-name" required>
            {t("printerProfilesNameLabel")}
          </Label>
          <Input
            id="printer-profile-name"
            placeholder={t("printerProfilesNamePlaceholder")}
            {...register("name", {
              validate: (value) => value.trim().length > 0 || t("printerProfilesNameRequiredError"),
            })}
          />
          {errors.name ? <p className="text-sm text-destructive">{errors.name.message}</p> : null}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="printer-profile-x" required>
              {t("printerProfilesXOffsetLabel")}
            </Label>
            <Input
              id="printer-profile-x"
              type="number"
              step="0.1"
              placeholder={t("printerProfilesOffsetPlaceholder")}
              {...register("x_offset_mm", {
                valueAsNumber: true,
                validate: (value) => Number.isFinite(value) || t("printerProfilesOffsetRequiredError"),
              })}
            />
            {errors.x_offset_mm ? <p className="text-sm text-destructive">{errors.x_offset_mm.message}</p> : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="printer-profile-y" required>
              {t("printerProfilesYOffsetLabel")}
            </Label>
            <Input
              id="printer-profile-y"
              type="number"
              step="0.1"
              placeholder={t("printerProfilesOffsetPlaceholder")}
              {...register("y_offset_mm", {
                valueAsNumber: true,
                validate: (value) => Number.isFinite(value) || t("printerProfilesOffsetRequiredError"),
              })}
            />
            {errors.y_offset_mm ? <p className="text-sm text-destructive">{errors.y_offset_mm.message}</p> : null}
          </div>
        </div>
        <p className="text-xs text-muted">{t("printerProfilesOffsetHelpText")}</p>
        <div className="space-y-2">
          <Label htmlFor="printer-profile-description">{t("printerProfilesDescriptionLabel")}</Label>
          <AppTextarea
            id="printer-profile-description"
            rows={4}
            placeholder={t("printerProfilesDescriptionPlaceholder")}
            {...register("description")}
          />
        </div>
      </form>
    </SidePanel>
  );
}
