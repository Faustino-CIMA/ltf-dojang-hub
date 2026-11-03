"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PopoverSelect } from "@/components/ui/popover-select";
import { SidePanel } from "@/components/ui/side-panel";
import { Club, Member, createMember, getClubs, updateMember } from "@/lib/club-admin-api";
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
  onClose,
  onSaved,
}: {
  open: boolean;
  mode: "create" | "edit";
  member?: Member | null;
  clubs: Club[];
  selectedClubId: number | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const t = useTranslations("ClubAdmin");
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
      await updateMember(member.id, {
        club: member.club,
        first_name: values.first_name.trim(),
        last_name: values.last_name.trim(),
        sex: values.sex,
        email: values.email.trim(),
        wt_licenseid: values.wt_licenseid.trim(),
        ltf_licenseid: values.ltf_licenseid.trim(),
        date_of_birth: parseDisplayDateToIso(values.date_of_birth),
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
          <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
            {t("cancelEdit")}
          </Button>
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
        <div className="space-y-2">
          <Label htmlFor="member-panel-first-name" required>{t("firstNameLabel")}</Label>
          <Input
            id="member-panel-first-name"
            {...(editing ? editForm.register("first_name") : createForm.register("first_name"))}
          />
          {(editing ? editForm.formState.errors.first_name : createForm.formState.errors.first_name) ? (
            <p className="text-sm text-destructive">
              {(editing ? editForm.formState.errors.first_name : createForm.formState.errors.first_name)?.message}
            </p>
          ) : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="member-panel-last-name" required>{t("lastNameLabel")}</Label>
          <Input
            id="member-panel-last-name"
            {...(editing ? editForm.register("last_name") : createForm.register("last_name"))}
          />
          {(editing ? editForm.formState.errors.last_name : createForm.formState.errors.last_name) ? (
            <p className="text-sm text-destructive">
              {(editing ? editForm.formState.errors.last_name : createForm.formState.errors.last_name)?.message}
            </p>
          ) : null}
        </div>
        <div className="space-y-2">
          <Label>{t("sexLabel")}</Label>
          <PopoverSelect
            ariaLabel={t("sexLabel")}
            className="w-full"
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
          <div className="space-y-2">
            <Label>{t("beltRankLabel")}</Label>
            <p className="text-xs text-muted">{t("beltRankCreateHint")}</p>
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="member-panel-dob">{t("dobLabel")}</Label>
          <Input
            id="member-panel-dob"
            placeholder="29 Nov 2026"
            {...(editing ? editForm.register("date_of_birth") : createForm.register("date_of_birth"))}
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
