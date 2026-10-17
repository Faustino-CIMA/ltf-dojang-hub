"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { SidePanel } from "@/components/ui/side-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PopoverSelect } from "@/components/ui/popover-select";
import type { Club, LicenseType, LtfStaffFunctionName, LtfStaffInput, Member } from "@/lib/ltf-admin-api";
import { staffFunctionLabel } from "@/lib/ltf-staff-label";

export type StaffPanelMode = "create" | "edit" | "issue" | "revoke" | "delete";

const FUNCTIONS: LtfStaffFunctionName[] = ["secretary", "coach", "photographer", "other"];

export function LtfStaffPanel(props: {
  mode: StaffPanelMode | null;
  member: Member | null;
  clubs: Club[];
  licenseTypes: LicenseType[];
  busy: boolean;
  onClose: () => void;
  onSubmit: (mode: StaffPanelMode, input: LtfStaffInput) => void;
}) {
  if (!props.mode) {
    return null;
  }
  return <StaffPanelForm key={`${props.mode}:${props.member?.id ?? "new"}`} {...props} mode={props.mode} />;
}

function StaffPanelForm({
  mode,
  member,
  clubs,
  licenseTypes,
  busy,
  onClose,
  onSubmit,
}: {
  mode: StaffPanelMode;
  member: Member | null;
  clubs: Club[];
  licenseTypes: LicenseType[];
  busy: boolean;
  onClose: () => void;
  onSubmit: (mode: StaffPanelMode, input: LtfStaffInput) => void;
}) {
  const t = useTranslations("LtfAdmin");
  const [firstName, setFirstName] = useState(member?.first_name ?? "");
  const [lastName, setLastName] = useState(member?.last_name ?? "");
  const [email, setEmail] = useState(member?.email ?? "");
  const [sex, setSex] = useState<"M" | "F">(member?.sex ?? "F");
  const [fn, setFn] = useState<LtfStaffFunctionName>(member?.ltf_staff?.function ?? "secretary");
  const [startedOn, setStartedOn] = useState(member?.ltf_staff?.started_on ?? "");
  const [endedOn, setEndedOn] = useState(member?.ltf_staff?.ended_on ?? "");
  const [clubId, setClubId] = useState(member?.club ? String(member.club) : "");
  const [loginMode, setLoginMode] = useState("none");
  const [username, setUsername] = useState("");
  const [licenseTypeId, setLicenseTypeId] = useState("");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [formError, setFormError] = useState<string | null>(null);

  const functionOptions = FUNCTIONS.map((value) => ({
    value,
    label: staffFunctionLabel(t, value),
  }));
  const clubOptions = [
    { value: "", label: t("staffNoClubOption") },
    ...clubs.map((club) => ({ value: String(club.id), label: club.name, searchText: club.name })),
  ];
  const licenseOptions = [
    { value: "", label: t("staffNoLicenseOption") },
    ...licenseTypes.map((item) => ({ value: String(item.id), label: item.name, searchText: item.name })),
  ];
  const showPerson = mode === "create" || mode === "edit";
  const showLicense = mode === "issue" || (mode === "create" && !clubId);
  const canJoinClub = !member?.club && (mode === "create" || mode === "edit");

  const title = {
    create: t("staffAddTitle"),
    edit: t("staffEditTitle"),
    issue: t("staffIssueTitle"),
    revoke: t("staffRevokeTitle"),
    delete: t("staffDeleteTitle"),
  }[mode];
  const hint = {
    create: t("staffAddHint"),
    edit: t("staffEditHint"),
    issue: t("staffIssueHint"),
    revoke: t("staffRevokeHint"),
    delete: t("staffDeleteHint"),
  }[mode];

  const submit = () => {
    if (showPerson && (!firstName.trim() || !lastName.trim())) {
      setFormError(t("staffNeedName"));
      return;
    }
    if ((mode === "create" || mode === "edit") && !fn) {
      setFormError(t("staffNeedFunction"));
      return;
    }
    if (mode === "issue" && !licenseTypeId) {
      setFormError(t("staffNeedLicenseType"));
      return;
    }
    if (showLicense && licenseTypeId) {
      const yearNumber = Number(year);
      const currentYear = new Date().getFullYear();
      if (!Number.isInteger(yearNumber) || yearNumber < currentYear) {
        setFormError(t("staffPastYear"));
        return;
      }
      if (yearNumber > currentYear + 1) {
        setFormError(t("staffYearNotAllowed"));
        return;
      }
    }
    const input: LtfStaffInput = {
      member_id: member?.id,
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      email: email.trim(),
      sex,
      function: fn,
      started_on: startedOn || null,
      ended_on: endedOn || null,
      locale: undefined,
    };
    if (canJoinClub) {
      input.club = clubId ? Number(clubId) : null;
    }
    if (loginMode === "link" && username.trim()) {
      input.username = username.trim();
    }
    if (loginMode === "ltf_admin" || loginMode === "ltf_finance") {
      input.create_login_role = loginMode;
    }
    if (showLicense && licenseTypeId) {
      input.license_type = Number(licenseTypeId);
      input.license_year = Number(year);
    }
    onSubmit(mode, input);
  };

  return (
    <SidePanel
      open
      title={title}
      description={hint}
      closeLabel={t("staffClose")}
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose}>
            {t("staffClose")}
          </Button>
          <Button type="button" variant={mode === "delete" || mode === "revoke" ? "destructive" : "default"} onClick={submit} disabled={busy}>
            {busy
              ? t("staffSaving")
              : mode === "delete"
                ? t("staffDeleteAction")
                : mode === "issue"
                  ? t("staffIssueAction")
                  : mode === "revoke"
                    ? t("staffRevokeAction")
                    : t("staffSaveAction")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
        {showPerson ? (
          <>
            <div className="space-y-2">
              <Label htmlFor="staff-last-name" required>{t("lastNameLabel")}</Label>
              <Input id="staff-last-name" value={lastName} onChange={(event) => setLastName(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="staff-first-name" required>{t("firstNameLabel")}</Label>
              <Input id="staff-first-name" value={firstName} onChange={(event) => setFirstName(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="staff-email">{t("emailLabel")}</Label>
              <Input id="staff-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{t("sexLabel")}</Label>
              <PopoverSelect
                ariaLabel={t("sexLabel")}
                value={sex}
                onValueChange={(value) => setSex(value as "M" | "F")}
                options={[
                  { value: "F", label: t("sexFemale") },
                  { value: "M", label: t("sexMale") },
                ]}
              />
            </div>
            <div className="space-y-2">
              <Label required>{t("staffFunctionLabel")}</Label>
              <PopoverSelect ariaLabel={t("staffFunctionLabel")} value={fn} onValueChange={(value) => setFn(value as LtfStaffFunctionName)} options={functionOptions} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="staff-start">{t("staffStartLabel")}</Label>
                <Input id="staff-start" type="date" value={startedOn} onChange={(event) => setStartedOn(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="staff-end">{t("staffEndLabel")}</Label>
                <Input id="staff-end" type="date" value={endedOn} onChange={(event) => setEndedOn(event.target.value)} />
              </div>
            </div>
            {canJoinClub ? (
              <div className="space-y-2">
                <Label>{t("staffClubLabel")}</Label>
                <PopoverSelect
                  ariaLabel={t("staffClubLabel")}
                  value={clubId}
                  onValueChange={setClubId}
                  options={clubOptions}
                  searchable
                  searchPlaceholder={t("staffClubLabel")}
                />
              </div>
            ) : null}
            {!member?.linked_user ? (
              <div className="space-y-2">
                <Label>{t("staffLoginLabel")}</Label>
                <PopoverSelect
                  ariaLabel={t("staffLoginLabel")}
                  value={loginMode}
                  onValueChange={setLoginMode}
                  options={[
                    { value: "none", label: t("staffLoginNone") },
                    { value: "link", label: t("staffLoginLink") },
                    { value: "ltf_admin", label: t("staffLoginCreateAdmin") },
                    { value: "ltf_finance", label: t("staffLoginCreateFinance") },
                  ]}
                />
                {loginMode === "link" ? (
                  <Input
                    aria-label={t("staffLoginUserLabel")}
                    placeholder={t("staffLoginUserLabel")}
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                  />
                ) : null}
              </div>
            ) : null}
          </>
        ) : null}
        {showLicense ? (
          <>
            <div className="space-y-2">
              <Label>{t("staffLicenseTypeLabel")}</Label>
              <PopoverSelect
                ariaLabel={t("staffLicenseTypeLabel")}
                value={licenseTypeId}
                onValueChange={setLicenseTypeId}
                options={mode === "issue" ? licenseOptions.filter((option) => option.value) : licenseOptions}
                searchable
                searchPlaceholder={t("staffLicenseTypeLabel")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="staff-year">{t("staffLicenseYearLabel")}</Label>
              <Input id="staff-year" inputMode="numeric" value={year} onChange={(event) => setYear(event.target.value)} />
            </div>
          </>
        ) : null}
      </div>
    </SidePanel>
  );
}
