"use client";

import { useEffect, useMemo, useState } from "react";
import { Flag, IdCard } from "lucide-react";

import { FieldLock } from "@/components/members/field-lock";
import { SecretNumberField } from "@/components/members/secret-number-field";
import { isMaskedSecretNumber } from "@/lib/mask-secret";
import { useLocale, useTranslations } from "next-intl";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PopoverSelect } from "@/components/ui/popover-select";
import { SidePanel } from "@/components/ui/side-panel";
import { NationalityField } from "@/components/clubmgmt/member-club-record-panel";
import { Club, Member, createMember, getClubs, updateMember } from "@/lib/club-admin-api";
import { sanitizeStoredNumber } from "@/lib/card-read";
import { nationalityCodeFromStored } from "@/lib/nationalities";
import { parseDisplayDateToIso, formatDateInputValue } from "@/lib/date-display";
import { LICENSE_ROLE_VALUES, canonicalizeLicenseRole, type LicenseRoleValue } from "@/lib/license-roles";

const createSchema = z
  .object({
    club: z.string().min(1, "Club is required"),
    first_name: z.string().trim().min(1, "First name is required"),
    last_name: z.string().trim().min(1, "Last name is required"),
    sex: z.enum(["M", "F"]),
    wt_licenseid: z.string().max(20, "WT license ID must be at most 20 characters."),
    ltf_license_prefix: z.enum(["LTF", "LUX"]),
    date_of_birth: z.string().optional().refine(
      (value) => !String(value ?? "").trim() || parseDisplayDateToIso(String(value)) !== null,
      "Use date format 29 Nov 2026.",
    ),
    primary_license_role: z.enum(LICENSE_ROLE_VALUES).or(z.literal("")).optional(),
    secondary_license_role: z.enum(LICENSE_ROLE_VALUES).or(z.literal("")).optional(),
    is_active: z.boolean(),
    social_security_number: z.string().optional(),
    social_security_country: z.enum(["LU", "DE", "FR", "BE"]),
    nationality_1: z.string().optional(),
    nationality_2: z.string().optional(),
  })
  .superRefine((values, context) => {
    if (values.secondary_license_role && !values.primary_license_role) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["secondary_license_role"],
        message: "Secondary role requires a primary role.",
      });
    }
    if (
      values.primary_license_role &&
      values.secondary_license_role &&
      values.primary_license_role === values.secondary_license_role
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["secondary_license_role"],
        message: "Secondary role must differ from primary role.",
      });
    }
  });

const editSchema = z.object({
  first_name: z.string().trim().min(1, "First name is required."),
  last_name: z.string().trim().min(1, "Last name is required."),
  sex: z.enum(["M", "F"]),
  email: z.union([z.literal(""), z.string().email("Please enter a valid email address.")]),
  wt_licenseid: z.string().max(32, "WT license ID must be at most 32 characters."),
  ltf_licenseid: z.string().max(20, "LTF license ID must be at most 20 characters."),
  date_of_birth: z.string().refine(
    (value) => !String(value ?? "").trim() || parseDisplayDateToIso(value) !== null,
    "Use date format 29 Nov 2026.",
  ),
  primary_license_role: z.enum(LICENSE_ROLE_VALUES).or(z.literal("")),
  secondary_license_role: z.enum(LICENSE_ROLE_VALUES).or(z.literal("")),
  is_active: z.boolean(),
  usual_name: z.string().max(150),
  social_security_number: z.string().optional(),
  social_security_country: z.enum(["LU", "DE", "FR", "BE"]),
  nationality_1: z.string().optional(),
  nationality_2: z.string().optional(),
});

type CreateValues = z.infer<typeof createSchema>;
type EditValues = z.infer<typeof editSchema>;

const CREATE_ID = "member-create-form";
const EDIT_ID = "member-edit-form";

function normalizeSex(value: unknown): "M" | "F" {
  const normalized = String(value ?? "").trim().toUpperCase();
  return normalized === "F" || normalized === "FEMALE" ? "F" : "M";
}

export function MemberFormPanel({
  open,
  mode,
  member,
  clubs,
  selectedClubId,
  requireSsn = false,
  onClose,
  onSaved,
}: {
  open: boolean;
  mode: "create" | "edit";
  member?: Member | null;
  clubs: Club[];
  selectedClubId: number | null;
  requireSsn?: boolean;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const t = useTranslations("ClubAdmin");
  const locale = useLocale();
  const verifyT = useTranslations("Verification");
  const clubT = useTranslations("ClubMgmt");
  const importT = useTranslations("Import");
  const common = useTranslations("Common");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loadedClubs, setLoadedClubs] = useState<Club[]>(clubs);
  const clubOptions = clubs.length > 0 ? clubs : loadedClubs;

  const roleLabelByValue = useMemo(
    () => ({
      Athlete: t("licenseRoleAthlete"),
      Coach: t("licenseRoleCoach"),
      Referee: t("licenseRoleReferee"),
      Official: t("licenseRoleOfficial"),
      Doctor: t("licenseRoleDoctor"),
      Physiotherapist: t("licenseRolePhysiotherapist"),
      Volunteer: t("licenseRoleVolunteer"),
      Staff: t("licenseRoleStaff"),
      Media: t("licenseRoleMedia"),
      Fan: t("licenseRoleFan"),
    }),
    [t],
  );

  const createForm = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      club: "",
      first_name: "",
      last_name: "",
      sex: "M",
      wt_licenseid: "",
      ltf_license_prefix: "LTF",
      date_of_birth: "",
      primary_license_role: "",
      secondary_license_role: "",
      is_active: true,
      social_security_country: "LU",
      nationality_1: "",
      nationality_2: "",
    },
  });
  const editForm = useForm<EditValues>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      first_name: "",
      last_name: "",
      sex: "M",
      email: "",
      wt_licenseid: "",
      ltf_licenseid: "",
      date_of_birth: "",
      primary_license_role: "",
      secondary_license_role: "",
      is_active: true,
      usual_name: "",
      social_security_number: "",
      social_security_country: "LU",
      nationality_1: "",
      nationality_2: "",
    },
  });

  useEffect(() => {
    if (!open || mode !== "create" || clubs.length > 0) {
      return;
    }
    let cancelled = false;
    getClubs()
      .then((rows) => {
        if (!cancelled) {
          setLoadedClubs(rows);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : "Failed to load member form.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, mode, clubs.length]);

  useEffect(() => {
    if (!open || mode !== "create") {
      return;
    }
    const preferred =
      selectedClubId && clubOptions.some((club) => club.id === selectedClubId) ? selectedClubId : clubOptions[0]?.id;
    createForm.reset({
      club: preferred ? String(preferred) : "",
      first_name: "",
      last_name: "",
      sex: "M",
      wt_licenseid: "",
      ltf_license_prefix: "LTF",
      date_of_birth: "",
      primary_license_role: "",
      secondary_license_role: "",
      is_active: true,
      social_security_number: "",
      social_security_country: "LU",
      nationality_1: "",
      nationality_2: "",
    });
    setErrorMessage(null);
  }, [open, mode, selectedClubId, clubOptions, createForm]);

  useEffect(() => {
    if (!open || mode !== "edit" || !member) {
      return;
    }
    editForm.reset({
      first_name: member.first_name,
      last_name: member.last_name,
      sex: normalizeSex(member.sex),
      email: member.email ?? "",
      wt_licenseid: member.wt_licenseid ?? "",
      ltf_licenseid: member.ltf_licenseid ?? "",
      date_of_birth: formatDateInputValue(member.date_of_birth),
      primary_license_role: canonicalizeLicenseRole(member.primary_license_role),
      secondary_license_role: canonicalizeLicenseRole(member.secondary_license_role),
      is_active: member.is_active,
      usual_name: member.usual_name ?? "",
      social_security_number: member.social_security_number ?? "",
      social_security_country: (member.social_security_country || "LU") as "LU" | "DE" | "FR" | "BE",
      nationality_1: nationalityCodeFromStored(member.nationality_1 ?? ""),
      nationality_2: nationalityCodeFromStored(member.nationality_2 ?? ""),
    });
    setErrorMessage(null);
  }, [open, mode, member, editForm]);

  const roleOptions = (exclude?: string) => [
    { value: "none", label: t("roleNoneOption") },
    ...LICENSE_ROLE_VALUES.filter((role) => role !== exclude).map((role) => ({
      value: role,
      label: roleLabelByValue[role],
    })),
  ];

  const submitCreate = createForm.handleSubmit(async (values) => {
    setErrorMessage(null);
    try {
      await createMember({
        club: Number(values.club),
        first_name: values.first_name.trim(),
        last_name: values.last_name.trim(),
        sex: values.sex,
        wt_licenseid: values.wt_licenseid.trim() || undefined,
        ltf_license_prefix: values.ltf_license_prefix,
        date_of_birth: parseDisplayDateToIso(values.date_of_birth),
        primary_license_role: (values.primary_license_role ?? "") as LicenseRoleValue | "",
        secondary_license_role: (values.secondary_license_role ?? "") as LicenseRoleValue | "",
        is_active: values.is_active,
        social_security_number: values.social_security_number?.trim() ?? "",
        social_security_country: values.social_security_country,
        nationality_1: values.nationality_1 ?? "",
        nationality_2: values.nationality_2 ?? "",
      });
      await onSaved();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to create member.");
    }
  });

  const submitEdit = editForm.handleSubmit(async (values) => {
    if (!member) {
      return;
    }
    setErrorMessage(null);
    try {
      const locked = Boolean(member.card_verified);
      await updateMember(member.id, {
        club: member.club,
        ...(locked
          ? {}
          : {
              first_name: values.first_name.trim(),
              last_name: values.last_name.trim(),
              sex: values.sex,
              date_of_birth: parseDisplayDateToIso(values.date_of_birth),
            }),
        usual_name: values.usual_name.trim(),
        ...(locked
          ? {}
          : {
              social_security_number: values.social_security_number?.trim() ?? "",
              social_security_country: values.social_security_country,
            }),
        nationality_1: values.nationality_1 ?? "",
        nationality_2: values.nationality_2 ?? "",
        email: values.email.trim(),
        wt_licenseid: values.wt_licenseid.trim(),
        ltf_licenseid: values.ltf_licenseid.trim(),
        primary_license_role: values.primary_license_role,
        secondary_license_role: values.secondary_license_role,
        is_active: values.is_active,
      });
      await onSaved();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to update member.");
    }
  });

  const createPrimary = createForm.watch("primary_license_role") || "";
  const editPrimary = editForm.watch("primary_license_role") || "";
  const editing = mode === "edit";
  const formId = editing ? EDIT_ID : CREATE_ID;
  const isSubmitting = editing ? editForm.formState.isSubmitting : createForm.formState.isSubmitting;

  return (
    <SidePanel
      open={open}
      wide
      title={editing ? t("updateMember") : t("createMember")}
      description={editing ? member?.ltf_licenseid || undefined : t("memberCreatePageSubtitle")}
      closeLabel={common("modalClose")}
      onClose={onClose}
      footer={
        <>
          <Button type="submit" form={formId} disabled={isSubmitting}>
            {editing ? t("updateMember") : t("createMember")}
          </Button>
        </>
      }
    >
      <form id={formId} className="grid gap-3 sm:grid-cols-2" onSubmit={editing ? submitEdit : submitCreate}>
        {errorMessage ? <p className="text-sm text-destructive sm:col-span-2">{errorMessage}</p> : null}
        {!editing ? (
          <div className="space-y-2 sm:col-span-2">
            <Label required>{t("clubLabel")}</Label>
            <PopoverSelect
              ariaLabel={t("clubLabel")}
              className="w-full"
              value={createForm.watch("club")}
              onValueChange={(value) => createForm.setValue("club", value, { shouldValidate: true })}
              placeholder={t("selectClubPlaceholder")}
              searchable
              searchPlaceholder={t("selectClubPlaceholder")}
              options={clubOptions.map((club) => ({ value: String(club.id), label: club.name }))}
            />
            {createForm.formState.errors.club ? (
              <p className="text-sm text-destructive">{createForm.formState.errors.club.message}</p>
            ) : null}
          </div>
        ) : null}
        {editing && member?.card_verified ? (
          <p className="text-sm text-muted sm:col-span-2">{verifyT("lockedHint")}</p>
        ) : null}
        <div className="space-y-2">
          <div className="flex min-h-[var(--control-height)] flex-wrap items-center gap-2">
            <Label htmlFor="member-panel-last-name" required className="w-auto">{t("lastNameLabel")}</Label>
            <FieldLock
              locked={Boolean(editing && member?.card_verified)}
              lockedLabel={verifyT("fieldLocked")}
              openLabel={verifyT("fieldOpen")}
            />
          </div>
          <Input
            id="member-panel-last-name"
            disabled={Boolean(editing && member?.card_verified)}
            {...(editing ? editForm.register("last_name") : createForm.register("last_name"))}
          />
          {(editing ? editForm.formState.errors.last_name : createForm.formState.errors.last_name) ? (
            <p className="text-sm text-destructive">
              {(editing ? editForm.formState.errors.last_name : createForm.formState.errors.last_name)?.message}
            </p>
          ) : null}
        </div>
        <div className="space-y-2">
          <div className="flex min-h-[var(--control-height)] flex-wrap items-center gap-2">
            <Label htmlFor="member-panel-first-name" required className="w-auto">{t("firstNameLabel")}</Label>
            <FieldLock
              locked={Boolean(editing && member?.card_verified)}
              lockedLabel={verifyT("fieldLocked")}
              openLabel={verifyT("fieldOpen")}
            />
          </div>
          <Input
            id="member-panel-first-name"
            disabled={Boolean(editing && member?.card_verified)}
            {...(editing ? editForm.register("first_name") : createForm.register("first_name"))}
          />
          {(editing ? editForm.formState.errors.first_name : createForm.formState.errors.first_name) ? (
            <p className="text-sm text-destructive">
              {(editing ? editForm.formState.errors.first_name : createForm.formState.errors.first_name)?.message}
            </p>
          ) : null}
        </div>
        <div className="space-y-2">
          <div className="flex min-h-[var(--control-height)] flex-wrap items-center gap-2">
            <Label className="w-auto">{t("sexLabel")}</Label>
            <FieldLock
              locked={Boolean(editing && member?.card_verified)}
              lockedLabel={verifyT("fieldLocked")}
              openLabel={verifyT("fieldOpen")}
            />
          </div>
          <PopoverSelect
            ariaLabel={t("sexLabel")}
            className="w-full"
            disabled={Boolean(editing && member?.card_verified)}
            value={editing ? editForm.watch("sex") : createForm.watch("sex")}
            onValueChange={(value) => {
              const sex = value as "M" | "F";
              if (editing) {
                editForm.setValue("sex", sex, { shouldValidate: true });
              } else {
                createForm.setValue("sex", sex, { shouldValidate: true });
              }
            }}
            options={[
              { value: "M", label: t("sexMale") },
              { value: "F", label: t("sexFemale") },
            ]}
          />
        </div>
        {editing ? (
          <div className="space-y-2">
            <Label htmlFor="member-panel-email">{t("emailLabel")}</Label>
            <Input id="member-panel-email" type="email" {...editForm.register("email")} />
            {editForm.formState.errors.email ? (
              <p className="text-sm text-destructive">{editForm.formState.errors.email.message}</p>
            ) : null}
          </div>
        ) : (
          <div className="space-y-2">
            <Label>{t("ltfLicensePrefixLabel")}</Label>
            <PopoverSelect
              ariaLabel={t("ltfLicensePrefixLabel")}
              className="w-full"
              value={createForm.watch("ltf_license_prefix")}
              onValueChange={(value) =>
                createForm.setValue("ltf_license_prefix", value as "LTF" | "LUX", { shouldValidate: true })
              }
              options={[
                { value: "LTF", label: t("ltfLicensePrefixLtf") },
                { value: "LUX", label: t("ltfLicensePrefixLux") },
              ]}
            />
            <p className="text-xs text-muted">{t("ltfLicensePrefixHint")}</p>
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="member-panel-wt">{importT("wtLicenseLabel")}</Label>
          <Input
            id="member-panel-wt"
            {...(editing ? editForm.register("wt_licenseid") : createForm.register("wt_licenseid"))}
          />
        </div>
        {editing ? (
          <div className="space-y-2">
            <Label htmlFor="member-panel-ltf">{t("ltfLicenseLabel")}</Label>
            <Input id="member-panel-ltf" {...editForm.register("ltf_licenseid")} />
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <Label>{t("beltRankLabel")}</Label>
              <p className="text-sm font-medium text-foreground">10th Kup</p>
              <p className="text-xs text-muted">{t("beltRankCreateHint")}</p>
            </div>
          </>
        )}
        <div className="space-y-2">
          <div className="flex min-h-[var(--control-height)] flex-wrap items-center gap-2">
            <Label htmlFor="member-panel-dob" className="w-auto">{t("dobLabel")}</Label>
            <FieldLock
              locked={Boolean(editing && member?.card_verified)}
              lockedLabel={verifyT("fieldLocked")}
              openLabel={verifyT("fieldOpen")}
            />
          </div>
          <Input
            id="member-panel-dob"
            placeholder="29 Nov 2026"
            disabled={Boolean(editing && member?.card_verified)}
            {...(editing ? editForm.register("date_of_birth") : createForm.register("date_of_birth"))}
          />
        </div>
        {editing ? (
          <div className="space-y-2">
            <Label htmlFor="member-panel-usual">{verifyT("usualName")}</Label>
            <Input id="member-panel-usual" {...editForm.register("usual_name")} />
          </div>
        ) : null}
        <div className="space-y-2 sm:col-span-2">
          <div className="flex min-h-[var(--control-height)] flex-wrap items-center gap-2">
            <IdCard className="h-4 w-4 text-muted" aria-hidden="true" />
            <Label className="w-auto">{verifyT("ssnCountry")}</Label>
            <FieldLock
              locked={Boolean(editing && member?.card_verified)}
              lockedLabel={verifyT("fieldLocked")}
              openLabel={verifyT("fieldOpen")}
            />
          </div>
          <p className="text-xs text-muted">{verifyT("identityHint")}</p>
          {editing && member?.card_verified ? <p className="text-xs text-muted">{verifyT("lockedHint")}</p> : null}
          <PopoverSelect
            ariaLabel={verifyT("ssnCountry")}
            className="w-full"
            disabled={Boolean(editing && member?.card_verified)}
            value={(editing ? editForm.watch("social_security_country") : createForm.watch("social_security_country")) || "LU"}
            onValueChange={(value) => {
              const country = value as "LU" | "DE" | "FR" | "BE";
              const current = (editing ? editForm.getValues("social_security_number") : createForm.getValues("social_security_number")) || "";
              const nextNumber = isMaskedSecretNumber(current) ? current : sanitizeStoredNumber(country, current);
              if (editing) {
                editForm.setValue("social_security_country", country);
                editForm.setValue("social_security_number", nextNumber);
              } else {
                createForm.setValue("social_security_country", country);
                createForm.setValue("social_security_number", nextNumber);
              }
            }}
            options={[
              { value: "LU", label: verifyT("countryLU") },
              { value: "DE", label: verifyT("countryDE") },
              { value: "FR", label: verifyT("countryFR") },
              { value: "BE", label: verifyT("countryBE") },
            ]}
          />
          <SecretNumberField
            key={editing ? `edit-${member?.id ?? "new"}` : "create"}
            id="member-panel-ssn"
            label={clubT("ssn")}
            required={requireSsn && !editing}
            locked={Boolean(editing && member?.card_verified)}
            canReveal
            lockedLabel={verifyT("fieldLocked")}
            openLabel={verifyT("fieldOpen")}
            showLabel={verifyT("showNumber")}
            hideLabel={verifyT("hideNumber")}
            memberId={editing ? member?.id : undefined}
            maxLength={((editing ? editForm.watch("social_security_country") : createForm.watch("social_security_country")) || "LU") === "FR" ? 15 : ((editing ? editForm.watch("social_security_country") : createForm.watch("social_security_country")) || "LU") === "DE" ? 12 : ((editing ? editForm.watch("social_security_country") : createForm.watch("social_security_country")) || "LU") === "BE" ? 11 : 13}
            value={(editing ? editForm.watch("social_security_number") : createForm.watch("social_security_number")) || ""}
            onChange={(nextValue) => {
              const country = (editing ? editForm.getValues("social_security_country") : createForm.getValues("social_security_country")) || "LU";
              const next = sanitizeStoredNumber(country, nextValue);
              if (editing) {
                editForm.setValue("social_security_number", next);
              } else {
                createForm.setValue("social_security_number", next);
              }
            }}
          />
        </div>
        <div className="space-y-2">
          <NationalityField
            label={clubT("nationality1")}
            icon={<Flag className="h-4 w-4 text-muted" aria-hidden="true" />}
            value={nationalityCodeFromStored((editing ? editForm.watch("nationality_1") : createForm.watch("nationality_1")) || "")}
            noneLabel={clubT("nationalityNone")}
            locale={locale}
            onChange={(next) => {
              if (editing) {
                editForm.setValue("nationality_1", next);
              } else {
                createForm.setValue("nationality_1", next);
              }
            }}
          />
        </div>
        <div className="space-y-2">
          <NationalityField
            label={clubT("nationality2")}
            value={nationalityCodeFromStored((editing ? editForm.watch("nationality_2") : createForm.watch("nationality_2")) || "")}
            noneLabel={clubT("nationalityNone")}
            locale={locale}
            onChange={(next) => {
              if (editing) {
                editForm.setValue("nationality_2", next);
              } else {
                createForm.setValue("nationality_2", next);
              }
            }}
          />
        </div>
        {editing ? (
          <div className="space-y-2">
            <Label>{t("beltRankLabel")}</Label>
            <p className="text-sm font-medium text-foreground">{member?.belt_rank || "-"}</p>
            <p className="text-xs text-muted">{t("beltRankManagedInGradesHint")}</p>
          </div>
        ) : null}
        <div className="space-y-2">
          <Label>{t("primaryLicenseRoleLabel")}</Label>
          <PopoverSelect
            ariaLabel={t("primaryLicenseRoleLabel")}
            className="w-full"
            value={(editing ? editPrimary : createPrimary) || "none"}
            onValueChange={(value) => {
              const next = value === "none" ? "" : value;
              if (editing) {
                editForm.setValue("primary_license_role", next as EditValues["primary_license_role"], { shouldValidate: true });
                if (next === editForm.getValues("secondary_license_role")) {
                  editForm.setValue("secondary_license_role", "");
                }
              } else {
                createForm.setValue("primary_license_role", next as CreateValues["primary_license_role"], { shouldValidate: true });
                if (next === createForm.getValues("secondary_license_role")) {
                  createForm.setValue("secondary_license_role", "");
                }
              }
            }}
            options={roleOptions()}
          />
        </div>
        <div className="space-y-2">
          <Label>{t("secondaryLicenseRoleLabel")}</Label>
          <PopoverSelect
            ariaLabel={t("secondaryLicenseRoleLabel")}
            className="w-full"
            disabled={!(editing ? editPrimary : createPrimary)}
            value={(editing ? editForm.watch("secondary_license_role") : createForm.watch("secondary_license_role")) || "none"}
            onValueChange={(value) => {
              const next = value === "none" ? "" : value;
              if (editing) {
                editForm.setValue("secondary_license_role", next as EditValues["secondary_license_role"], { shouldValidate: true });
              } else {
                createForm.setValue("secondary_license_role", next as CreateValues["secondary_license_role"], { shouldValidate: true });
              }
            }}
            options={roleOptions(editing ? editPrimary : createPrimary)}
          />
          {!editing && createForm.formState.errors.secondary_license_role ? (
            <p className="text-sm text-destructive">{createForm.formState.errors.secondary_license_role.message}</p>
          ) : null}
        </div>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <Checkbox
            checked={editing ? editForm.watch("is_active") : createForm.watch("is_active")}
            onCheckedChange={(checked) => {
              if (editing) {
                editForm.setValue("is_active", Boolean(checked));
              } else {
                createForm.setValue("is_active", Boolean(checked));
              }
            }}
          />
          {t("isActiveLabel")}
        </label>
      </form>
    </SidePanel>
  );
}
