"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Check, Circle, Download, Upload } from "lucide-react";
import { useTranslations } from "next-intl";

import { ClubAdminLayout } from "@/components/club-admin/club-admin-layout";
import { ClubFinanceTabs } from "@/components/club-admin/club-finance-tabs";
import { EmptyState } from "@/components/club-admin/empty-state";
import { useClubSelection } from "@/components/club-selection-provider";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ActionNotices,
  dataTableClass,
  dataThClass,
  dataTheadClass,
  FormPanel,
  NestedTable,
} from "@/components/ui/list-page-chrome";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  createExtraordinarySubsidy,
  deleteExtraordinarySubsidy,
  downloadExtraordinaryForm,
  downloadSubsidyDiploma,
  downloadSubsidyRib,
  downloadSubsidyYouthCsv,
  downloadTrainersList,
  downloadTrainingList,
  previewTrainersList,
  previewTrainingList,
  downloadSubsidyYouthXlsx,
  getSubsidyDossier,
  removeSubsidyDiploma,
  removeSubsidyRib,
  saveSubsidyCoach,
  saveSubsidySeason,
  saveSubsidyYouthId,
  updateExtraordinarySubsidy,
  uploadSubsidyDiploma,
  uploadSubsidyRib,
  type SubsidyCase,
  type SubsidyDossier,
} from "@/lib/clubmgmt-api";

const CHECK_LABELS: Record<string, string> = {
  affiliated: "subsidyCheckAffiliated",
  season: "subsidyCheckSeason",
  youth: "subsidyCheckYouth",
  eqf3: "subsidyCheckEqf3",
  half: "subsidyCheckHalf",
  diplomas: "subsidyCheckDiplomas",
  iban: "subsidyCheckIban",
  rib: "subsidyCheckRib",
  myguichet: "subsidyCheckMyguichet",
};

const EQF = ["", "eqf1", "eqf2", "eqf2bis", "eqf3", "eqf4", "eqf5", "eqf6"] as const;
const EQF_LABEL = {
  "": "subsidyEqfNone",
  eqf1: "subsidyEqf1",
  eqf2: "subsidyEqf2",
  eqf2bis: "subsidyEqf2bis",
  eqf3: "subsidyEqf3",
  eqf4: "subsidyEqf4",
  eqf5: "subsidyEqf5",
  eqf6: "subsidyEqf6",
} as const;
const FILE_STATUS = ["draft", "ready", "submitted", "paid"] as const;
const FILE_STATUS_LABEL = {
  draft: "subsidyStatusDraft",
  ready: "subsidyStatusReady",
  submitted: "subsidyStatusSubmitted",
  paid: "subsidyStatusPaid",
} as const;
const DIPLOMA_STATUS = ["missing", "in_progress", "attached"] as const;
const DIPLOMA_LABEL = {
  missing: "subsidyDiplomaMissing",
  in_progress: "subsidyDiplomaInProgress",
  attached: "subsidyDiplomaAttached",
} as const;
const CASE_STATUS = ["draft", "preliminary", "agreed", "accounted"] as const;
const CASE_STATUS_LABEL = {
  draft: "subsidyCaseDraft",
  preliminary: "subsidyCasePreliminary",
  agreed: "subsidyCaseAgreed",
  accounted: "subsidyCaseAccounted",
} as const;
const DOCUMENT_ACCEPT = "application/pdf,image/jpeg,image/png,image/webp";

function SubsidyFileActions({
  uploadLabel,
  replaceLabel,
  hasFile,
  downloadLabel,
  removeLabel,
  onFile,
  onDownload,
  onRemove,
}: {
  uploadLabel: string;
  replaceLabel: string;
  hasFile: boolean;
  downloadLabel: string;
  removeLabel: string;
  onFile: (file: File) => void;
  onDownload: () => void;
  onRemove: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        ref={inputRef}
        type="file"
        accept={DOCUMENT_ACCEPT}
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) onFile(file);
        }}
      />
      <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
        <Upload aria-hidden />
        {hasFile ? replaceLabel : uploadLabel}
      </Button>
      {hasFile ? (
        <>
          <Button type="button" variant="outline" size="sm" onClick={onDownload}>
            <Download aria-hidden />
            {downloadLabel}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onRemove}>
            {removeLabel}
          </Button>
        </>
      ) : null}
    </div>
  );
}

function MemberPicker({
  label,
  hint,
  members,
  selected,
  onChange,
  searchLabel,
  emptyLabel,
  countLabel,
}: {
  label: string;
  hint?: string;
  members: { id: number; name: string }[];
  selected: number[];
  onChange: (next: number[]) => void;
  searchLabel: string;
  emptyLabel: string;
  countLabel: string;
}) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const shown = needle ? members.filter((member) => member.name.toLowerCase().includes(needle)) : members;
  return (
    <div className="rounded-[var(--radius-form)] border border-border p-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs text-muted">{countLabel}</p>
      </div>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
      <Input className="mt-2" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={searchLabel} />
      <div className="mt-2 max-h-36 space-y-1 overflow-auto">
        {shown.length === 0 ? (
          <p className="text-sm text-muted">{emptyLabel}</p>
        ) : (
          shown.map((member) => (
            <label key={member.id} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={selected.includes(member.id)}
                onCheckedChange={(checked) =>
                  onChange(checked ? [...selected, member.id] : selected.filter((id) => id !== member.id))
                }
              />
              {member.name}
            </label>
          ))
        )}
      </div>
    </div>
  );
}

export default function ClubSubsidiesPage() {
  const t = useTranslations("ClubAdmin");
  const { clubs, selectedClubId } = useClubSelection();
  const selectedClubName = clubs.find((club) => club.id === selectedClubId)?.name ?? "";
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [dossier, setDossier] = useState<SubsidyDossier | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [kind, setKind] = useState("championship");
  const [title, setTitle] = useState("");
  const [place, setPlace] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [athleteIds, setAthleteIds] = useState<number[]>([]);
  const [officialIds, setOfficialIds] = useState<number[]>([]);
  const [travelMode, setTravelMode] = useState("train");
  const [travelUnits, setTravelUnits] = useState("");
  const [travelRate, setTravelRate] = useState("");
  const [stayPeople, setStayPeople] = useState("");
  const [stayDays, setStayDays] = useState("");
  const [stayRate, setStayRate] = useState("");
  const [entryFee, setEntryFee] = useState("");
  const [medicalFee, setMedicalFee] = useState("");
  const [suppliesFee, setSuppliesFee] = useState("");
  const [notes, setNotes] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!selectedClubId) return;
    setIsLoading(true);
    try {
      setDossier(await getSubsidyDossier(selectedClubId, Number(year) || new Date().getFullYear()));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("overviewLoadError"));
    } finally {
      setIsLoading(false);
    }
  }, [selectedClubId, t, year]);

  useEffect(() => {
    void load();
  }, [load]);

  const patchSeason = async (payload: Record<string, unknown>) => {
    if (!selectedClubId || !dossier) return;
    try {
      setDossier(await saveSubsidySeason(selectedClubId, dossier.year, payload));
      setSuccessMessage(t("saved"));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("saveError"));
    }
  };

  const remember = (next: SubsidyDossier) => {
    setDossier(next);
    setSuccessMessage(t("saved"));
  };

  const fail = (error: unknown) => {
    setErrorMessage(error instanceof Error ? error.message : t("saveError"));
  };

  const saveCoach = (userId: number, payload: { eqf_level: string; coaches_under_16: boolean; diploma_status: string }) => {
    if (!selectedClubId || !dossier) return;
    void saveSubsidyCoach(selectedClubId, dossier.year, { user_id: userId, ...payload }).then(remember).catch(fail);
  };

  const casePayload = () => ({
    kind,
    title,
    place,
    starts_on: startsOn,
    ends_on: endsOn,
    athlete_ids: athleteIds,
    official_ids: officialIds,
    travel_mode: travelMode,
    travel_units: travelUnits,
    travel_rate: travelRate,
    stay_people: stayPeople,
    stay_days: stayDays,
    stay_rate: stayRate,
    entry_fee: entryFee,
    medical_fee: medicalFee,
    supplies_fee: suppliesFee,
    notes,
  });

  const resetCaseForm = () => {
    setEditingId(null);
    setKind("championship");
    setTitle("");
    setPlace("");
    setStartsOn("");
    setEndsOn("");
    setAthleteIds([]);
    setOfficialIds([]);
    setTravelMode("train");
    setTravelUnits("");
    setTravelRate("");
    setStayPeople("");
    setStayDays("");
    setStayRate("");
    setEntryFee("");
    setMedicalFee("");
    setSuppliesFee("");
    setNotes("");
  };

  const onEditCase = (row: SubsidyCase) => {
    setEditingId(row.id);
    setKind(row.kind);
    setTitle(row.title);
    setPlace(row.place);
    setStartsOn(row.starts_on);
    setEndsOn(row.ends_on);
    setAthleteIds(row.athlete_ids);
    setOfficialIds(row.official_ids);
    setTravelMode(row.travel_mode || "train");
    setTravelUnits(row.travel_units);
    setTravelRate(row.travel_rate);
    setStayPeople(row.stay_people ? String(row.stay_people) : "");
    setStayDays(row.stay_days ? String(row.stay_days) : "");
    setStayRate(row.stay_rate);
    setEntryFee(row.entry_fee);
    setMedicalFee(row.medical_fee);
    setSuppliesFee(row.supplies_fee);
    setNotes(row.notes);
  };

  const onCreateCase = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedClubId || !dossier) return;
    try {
      const next = editingId
        ? await updateExtraordinarySubsidy(selectedClubId, editingId, casePayload())
        : await createExtraordinarySubsidy(selectedClubId, dossier.year, casePayload());
      setDossier(next);
      resetCaseForm();
      setSuccessMessage(t("saved"));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("saveError"));
    }
  };

  return (
    <ClubAdminLayout title={t("subsidiesTitle")} subtitle={t("subsidiesSubtitle")}>
      <div className="space-y-6">
        <ClubFinanceTabs />
        <ActionNotices
          error={errorMessage}
          success={successMessage}
          onDismiss={() => {
            setErrorMessage(null);
            setSuccessMessage(null);
          }}
        />
        <FormPanel>
          <h2 className="text-section text-foreground">{t("subsidiesYear")}</h2>
          <div className="mt-3 grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <Label htmlFor="subsidy-year">{t("subsidiesYear")}</Label>
              <Input
                id="subsidy-year"
                className="mt-1"
                inputMode="numeric"
                value={year}
                onChange={(event) => setYear(event.target.value)}
              />
            </div>
            {dossier
              ? (
                  [
                    [t("subsidiesFileBy"), dossier.dates.file_by],
                    [t("subsidiesInapsLabel"), dossier.dates.inaps_by],
                    [t("subsidiesDiplomasLabel"), dossier.dates.diplomas_by],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label} className="rounded-[var(--radius-form)] border border-border px-3 py-2">
                    <p className="text-xs text-muted">{label}</p>
                    <p className="mt-1 text-sm font-medium tabular-nums text-foreground">{value}</p>
                  </div>
                ))
              : null}
          </div>
        </FormPanel>
        {isLoading || !dossier ? (
          <EmptyState title={t("loadingTitle")} description={t("subsidiesTitle")} loading />
        ) : (
          <>
            <FormPanel>
              <h2 className="text-section text-foreground">{t("subsidiesChecklist")}</h2>
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {dossier.checklist.map((item) => (
                  <li key={item.id} className="flex items-start gap-2 text-sm">
                    {item.ok ? (
                      <Check className="mt-0.5 size-4 shrink-0 text-[var(--success)]" aria-hidden />
                    ) : (
                      <Circle className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
                    )}
                    <span>{t(CHECK_LABELS[item.id] as "subsidyCheckSeason")}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={dossier.season.season_complete}
                    onCheckedChange={(checked) => void patchSeason({ season_complete: Boolean(checked) })}
                  />
                  {t("subsidiesSeasonComplete")}
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={dossier.season.rib_attached || dossier.season.has_rib}
                    onCheckedChange={(checked) => void patchSeason({ rib_attached: Boolean(checked) })}
                  />
                  {t("subsidiesRibReady")}
                </label>
                <div>
                  <Label>{t("subsidiesMyguichetUsers")}</Label>
                  <Input
                    className="mt-1"
                    inputMode="numeric"
                    defaultValue={String(dossier.season.myguichet_users)}
                    key={`users-${dossier.season.myguichet_users}`}
                    onBlur={(event) => void patchSeason({ myguichet_users: Number(event.target.value) || 0 })}
                  />
                </div>
                <div>
                  <Label>{t("subsidiesNonLicensed")}</Label>
                  <Input
                    className="mt-1"
                    inputMode="numeric"
                    defaultValue={String(dossier.season.non_licensed_count)}
                    key={`nonlic-${dossier.season.non_licensed_count}`}
                    onBlur={(event) => void patchSeason({ non_licensed_count: Number(event.target.value) || 0 })}
                  />
                </div>
                <div>
                  <Label>{t("subsidiesStatus")}</Label>
                  <Select value={dossier.season.status} onValueChange={(value) => void patchSeason({ status: value })}>
                    <SelectTrigger className="mt-1 w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {FILE_STATUS.map((status) => (
                        <SelectItem key={status} value={status}>{t(FILE_STATUS_LABEL[status])}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{t("subsidiesSubmittedOn")}</Label>
                  <Input
                    className="mt-1"
                    type="date"
                    defaultValue={dossier.season.submitted_on}
                    key={`submitted-${dossier.season.submitted_on}`}
                    onBlur={(event) => void patchSeason({ submitted_on: event.target.value })}
                  />
                </div>
                <div>
                  <Label>{t("subsidiesPaidOn")}</Label>
                  <Input
                    className="mt-1"
                    type="date"
                    defaultValue={dossier.season.paid_on}
                    key={`paid-on-${dossier.season.paid_on}`}
                    onBlur={(event) => void patchSeason({ paid_on: event.target.value })}
                  />
                </div>
                <div>
                  <Label>{t("subsidiesPaidAmount")}</Label>
                  <Input
                    className="mt-1"
                    defaultValue={dossier.season.paid_amount}
                    key={`paid-${dossier.season.paid_amount}`}
                    onBlur={(event) => void patchSeason({ paid_amount: event.target.value })}
                  />
                </div>
              </div>
              <div className="mt-4 flex flex-col gap-3 rounded-[var(--radius-form)] border border-border p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{t("subsidiesRibFile")}</p>
                  {dossier.season.rib_name ? <p className="truncate text-xs text-muted">{dossier.season.rib_name}</p> : null}
                </div>
                <SubsidyFileActions
                  uploadLabel={t("subsidiesUpload")}
                  replaceLabel={t("subsidiesReplaceFile")}
                  hasFile={dossier.season.has_rib}
                  downloadLabel={t("subsidiesRibDownload")}
                  removeLabel={t("subsidiesRibRemove")}
                  onFile={(file) => {
                    if (!selectedClubId) return;
                    void uploadSubsidyRib(selectedClubId, dossier.year, file).then(remember).catch(fail);
                  }}
                  onDownload={() => {
                    if (!selectedClubId) return;
                    void downloadSubsidyRib(selectedClubId, dossier.year).catch(fail);
                  }}
                  onRemove={() => {
                    if (!selectedClubId) return;
                    void removeSubsidyRib(selectedClubId, dossier.year).then(remember).catch(fail);
                  }}
                />
              </div>
              {dossier.season.income_number ? (
                <p className="mt-3 text-sm">{t("subsidiesIncomeRecorded", { number: dossier.season.income_number })}</p>
              ) : null}
              {dossier.season.income_needs_officer ? (
                <p className="mt-3 text-sm">{t("subsidiesIncomeNeedsOfficer")}</p>
              ) : null}
            </FormPanel>
            <FormPanel>
              <h2 className="text-section text-foreground">{t("subsidiesScores")}</h2>
              <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  [t("subsidiesLicensed"), String(dossier.effectifs.licensed_total)],
                  [t("subsidiesVolunteerPoints"), String(dossier.effectifs.volunteer_points)],
                  [t("subsidiesCoachPoints"), String(dossier.coach_points)],
                  [t("subsidiesQualite"), `${dossier.qualite_estimate} €`],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-[var(--radius-form)] border border-border px-3 py-2">
                    <dt className="text-xs text-muted">{label}</dt>
                    <dd className="mt-1 text-sm font-medium tabular-nums text-foreground">{value}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-2 text-xs text-muted">{t("subsidiesQualiteHint")}</p>
            </FormPanel>
            <FormPanel>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-section text-foreground">{t("subsidiesTrainingListTitle")}</h2>
                  <p className="mt-1 text-xs text-muted">{t("subsidiesTrainingListHint")}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      selectedClubId && previewTrainingList(selectedClubId, dossier.year).catch((error) => setErrorMessage(error.message))
                    }
                  >
                    {t("subsidiesTrainingListPreview")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      selectedClubId &&
                      downloadTrainingList(selectedClubId, dossier.year, selectedClubName).catch((error) => setErrorMessage(error.message))
                    }
                  >
                    <Download aria-hidden />
                    {t("subsidiesTrainingList")}
                  </Button>
                </div>
              </div>
            </FormPanel>
            <FormPanel>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="max-w-3xl">
                  <h2 className="text-section text-foreground">{t("subsidiesCoaches")}</h2>
                  <p className="mt-1 text-xs text-muted">{t("subsidiesCoachesHint")}</p>
                </div>
                <div className="ml-auto flex shrink-0 flex-wrap justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      selectedClubId && previewTrainersList(selectedClubId, dossier.year).catch((error) => setErrorMessage(error.message))
                    }
                  >
                    {t("subsidiesTrainersListPreview")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      selectedClubId &&
                      downloadTrainersList(selectedClubId, dossier.year, selectedClubName).catch((error) => setErrorMessage(error.message))
                    }
                  >
                    <Download aria-hidden />
                    {t("subsidiesTrainersList")}
                  </Button>
                </div>
              </div>
              {dossier.coaches.length === 0 ? (
                <p className="mt-3 text-sm text-muted">{t("subsidiesNoCoaches")}</p>
              ) : (
                <NestedTable className="mt-4">
                  <table className={`${dataTableClass} min-w-[56rem]`}>
                    <thead className={dataTheadClass}>
                      <tr>
                        <th className={dataThClass}>{t("subsidiesCoaches")}</th>
                        <th className={dataThClass}>{t("subsidiesEqf")}</th>
                        <th className={dataThClass}>{t("subsidiesUnder16")}</th>
                        <th className={dataThClass}>{t("subsidiesDiploma")}</th>
                        <th className={dataThClass}>{t("subsidiesDiplomaFile")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dossier.coaches.map((coach) => (
                        <tr key={coach.user_id} className="border-b border-border last:border-0">
                          <td className="px-4 py-3 align-middle">
                            <span className="text-sm font-medium">{coach.name}</span>
                            {coach.diploma_name ? (
                              <p className="mt-0.5 max-w-48 truncate text-xs text-muted" title={coach.diploma_name}>{coach.diploma_name}</p>
                            ) : null}
                          </td>
                          <td className="px-4 py-3 align-middle">
                            <Select
                              value={coach.eqf_level || "none"}
                              onValueChange={(value) =>
                                saveCoach(coach.user_id, {
                                  eqf_level: value === "none" ? "" : value,
                                  coaches_under_16: coach.coaches_under_16,
                                  diploma_status: coach.diploma_status,
                                })
                              }
                            >
                              <SelectTrigger size="sm" className="w-36" aria-label={t("subsidiesEqf")}><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {EQF.map((level) => (
                                  <SelectItem key={level || "none"} value={level || "none"}>{t(EQF_LABEL[level])}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="px-4 py-3 align-middle">
                            <Checkbox
                              checked={coach.coaches_under_16}
                              aria-label={t("subsidiesUnder16")}
                              onCheckedChange={(checked) =>
                                saveCoach(coach.user_id, {
                                  eqf_level: coach.eqf_level,
                                  coaches_under_16: Boolean(checked),
                                  diploma_status: coach.diploma_status,
                                })
                              }
                            />
                          </td>
                          <td className="px-4 py-3 align-middle">
                            <Select
                              value={coach.diploma_status}
                              onValueChange={(value) =>
                                saveCoach(coach.user_id, {
                                  eqf_level: coach.eqf_level,
                                  coaches_under_16: coach.coaches_under_16,
                                  diploma_status: value,
                                })
                              }
                            >
                              <SelectTrigger size="sm" className="w-40" aria-label={t("subsidiesDiploma")}><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {DIPLOMA_STATUS.map((status) => (
                                  <SelectItem key={status} value={status}>{t(DIPLOMA_LABEL[status])}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="px-4 py-3 align-middle">
                            <SubsidyFileActions
                              uploadLabel={t("subsidiesUpload")}
                              replaceLabel={t("subsidiesReplaceFile")}
                              hasFile={coach.has_diploma}
                              downloadLabel={t("subsidiesDiplomaDownload")}
                              removeLabel={t("subsidiesDiplomaRemove")}
                              onFile={(file) => {
                                if (!selectedClubId) return;
                                void uploadSubsidyDiploma(selectedClubId, dossier.year, coach.user_id, file).then(remember).catch(fail);
                              }}
                              onDownload={() => {
                                if (!selectedClubId) return;
                                void downloadSubsidyDiploma(selectedClubId, dossier.year, coach.user_id).catch(fail);
                              }}
                              onRemove={() => {
                                if (!selectedClubId) return;
                                void removeSubsidyDiploma(selectedClubId, dossier.year, coach.user_id).then(remember).catch(fail);
                              }}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </NestedTable>
              )}
            </FormPanel>
            <FormPanel>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-section text-foreground">{t("subsidiesYouth")}</h2>
                  <p className="mt-1 text-xs text-muted">{t("subsidiesYouthHint")}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => selectedClubId && downloadSubsidyYouthCsv(selectedClubId, dossier.year).catch((error) => setErrorMessage(error.message))}
                  >
                    <Download aria-hidden />
                    {t("subsidiesExportYouth")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => selectedClubId && downloadSubsidyYouthXlsx(selectedClubId, dossier.year).catch((error) => setErrorMessage(error.message))}
                  >
                    <Download aria-hidden />
                    {t("subsidiesExportYouthXlsx")}
                  </Button>
                </div>
              </div>
              <h3 className="mt-4 text-sm font-medium text-foreground">{t("subsidiesEffectifs")}</h3>
              <p className="mt-1 text-xs text-muted">{t("subsidiesEffectifsHint")}</p>
              <NestedTable className="mt-3">
                <table className={dataTableClass}>
                  <thead className={dataTheadClass}>
                    <tr>
                      <th className={dataThClass}>{t("subsidiesHeadcountCategory")}</th>
                      <th className={`${dataThClass} text-right`}>{t("subsidiesMale")}</th>
                      <th className={`${dataThClass} text-right`}>{t("subsidiesFemale")}</th>
                      <th className={`${dataThClass} text-right`}>{t("subsidiesTotal")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dossier.headcount_rows.map((row) => (
                      <tr key={row.label} className="border-b border-border last:border-0">
                        <td className={`px-4 py-3 text-sm ${row.kind === "section" || row.kind === "total" ? "font-medium" : ""}`}>
                          {t(row.label as "subsidiesAgeUnder16")}
                        </td>
                        <td className="px-4 py-3 text-right text-sm tabular-nums">{row.kind === "section" ? "" : row.male ?? ""}</td>
                        <td className="px-4 py-3 text-right text-sm tabular-nums">{row.kind === "section" ? "" : row.female ?? ""}</td>
                        <td className="px-4 py-3 text-right text-sm tabular-nums">{row.kind === "section" ? "" : row.total ?? ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </NestedTable>
              {dossier.youth.length === 0 ? (
                <p className="mt-3 text-sm text-muted">{t("subsidiesNoYouth")}</p>
              ) : (
                <NestedTable className="mt-4">
                  <table className={dataTableClass}>
                    <thead className={dataTheadClass}>
                      <tr>
                        <th className={dataThClass}>{t("subsidiesYouth")}</th>
                        <th className={dataThClass}>{t("subsidiesYouthBorn")}</th>
                        <th className={dataThClass}>{t("subsidiesNationalId")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dossier.youth.map((row) => (
                        <tr key={row.id} className="border-b border-border last:border-0">
                          <td className="px-4 py-3 text-sm">{row.first_name} {row.last_name}</td>
                          <td className="px-4 py-3 text-sm text-muted">{row.date_of_birth}</td>
                          <td className="px-4 py-3">
                            <Input
                              className="max-w-44"
                              defaultValue={row.national_id}
                              placeholder={t("subsidiesNationalId")}
                              aria-label={t("subsidiesNationalId")}
                              inputMode="numeric"
                              onBlur={(event) => {
                                if (!selectedClubId) return;
                                void saveSubsidyYouthId(selectedClubId, dossier.year, row.id, event.target.value.replace(/\D/g, "").slice(0, 13))
                                  .then(remember)
                                  .catch(fail);
                              }}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </NestedTable>
              )}
            </FormPanel>
            <FormPanel>
              <h2 className="text-section text-foreground">{t("subsidiesExtraordinary")}</h2>
              {editingId ? <p className="mt-1 text-xs text-muted">{t("subsidiesEditing")}</p> : null}
              <form className="mt-4 space-y-6" onSubmit={(event) => void onCreateCase(event)}>
                <section>
                  <h3 className="text-sm font-medium text-foreground">{t("subsidiesEventGroup")}</h3>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <div>
                      <Label>{t("subsidiesKind")}</Label>
                      <Select value={kind} onValueChange={setKind}>
                        <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="championship">{t("subsidiesKindChampionship")}</SelectItem>
                          <SelectItem value="cup">{t("subsidiesKindCup")}</SelectItem>
                          <SelectItem value="organisation">{t("subsidiesKindOrganisation")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>{t("subsidiesEventTitle")}</Label>
                      <Input className="mt-1" value={title} onChange={(event) => setTitle(event.target.value)} required />
                    </div>
                    <div className="md:col-span-2">
                      <Label>{t("subsidiesPlace")}</Label>
                      <Input className="mt-1" value={place} onChange={(event) => setPlace(event.target.value)} />
                    </div>
                    <div>
                      <Label>{t("subsidiesFrom")}</Label>
                      <Input className="mt-1" type="date" value={startsOn} onChange={(event) => setStartsOn(event.target.value)} />
                    </div>
                    <div>
                      <Label>{t("subsidiesTo")}</Label>
                      <Input className="mt-1" type="date" value={endsOn} onChange={(event) => setEndsOn(event.target.value)} />
                    </div>
                  </div>
                </section>
                <section>
                  <h3 className="text-sm font-medium text-foreground">{t("subsidiesPeopleGroup")}</h3>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <MemberPicker
                      label={t("subsidiesAthletes")}
                      members={dossier.members}
                      selected={athleteIds}
                      onChange={setAthleteIds}
                      searchLabel={t("subsidiesSearchMembers")}
                      emptyLabel={t("subsidiesNoMatches")}
                      countLabel={t("subsidiesSelectedCount", { count: athleteIds.length })}
                    />
                    <MemberPicker
                      label={t("subsidiesOfficials")}
                      hint={t("subsidiesOfficialsAdults")}
                      members={dossier.members.filter((member) => member.adult)}
                      selected={officialIds}
                      onChange={setOfficialIds}
                      searchLabel={t("subsidiesSearchMembers")}
                      emptyLabel={t("subsidiesNoMatches")}
                      countLabel={t("subsidiesSelectedCount", { count: officialIds.length })}
                    />
                  </div>
                </section>
                <section>
                  <h3 className="text-sm font-medium text-foreground">{t("subsidiesCostsGroup")}</h3>
                  <p className="mt-1 text-xs text-muted">{t("subsidiesExtraordinaryHint")}</p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <div>
                      <Label>{t("subsidiesTravelMode")}</Label>
                      <Select value={travelMode} onValueChange={setTravelMode}>
                        <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="train">{t("subsidiesTravelTrain")}</SelectItem>
                          <SelectItem value="car">{t("subsidiesTravelCar")}</SelectItem>
                          <SelectItem value="plane">{t("subsidiesTravelPlane")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>{t("subsidiesTravelUnits")}</Label>
                      <Input className="mt-1" value={travelUnits} onChange={(event) => setTravelUnits(event.target.value)} />
                    </div>
                    <div>
                      <Label>{t("subsidiesTravelRate")}</Label>
                      <Input className="mt-1" value={travelRate} onChange={(event) => setTravelRate(event.target.value)} />
                    </div>
                    <div>
                      <Label>{t("subsidiesStayPeople")}</Label>
                      <Input className="mt-1" value={stayPeople} onChange={(event) => setStayPeople(event.target.value)} />
                    </div>
                    <div>
                      <Label>{t("subsidiesStayDays")}</Label>
                      <Input className="mt-1" value={stayDays} onChange={(event) => setStayDays(event.target.value)} />
                    </div>
                    <div>
                      <Label>{t("subsidiesStayRate")}</Label>
                      <Input className="mt-1" value={stayRate} onChange={(event) => setStayRate(event.target.value)} />
                    </div>
                    <div>
                      <Label>{t("subsidiesEntryFee")}</Label>
                      <Input className="mt-1" value={entryFee} onChange={(event) => setEntryFee(event.target.value)} />
                    </div>
                    <div>
                      <Label>{t("subsidiesMedical")}</Label>
                      <Input className="mt-1" value={medicalFee} onChange={(event) => setMedicalFee(event.target.value)} />
                    </div>
                    <div>
                      <Label>{t("subsidiesSupplies")}</Label>
                      <Input className="mt-1" value={suppliesFee} onChange={(event) => setSuppliesFee(event.target.value)} />
                    </div>
                    <div className="sm:col-span-3">
                      <Label>{t("subsidiesNotes")}</Label>
                      <Input className="mt-1" value={notes} onChange={(event) => setNotes(event.target.value)} />
                    </div>
                  </div>
                </section>
                <div className="flex flex-wrap justify-end gap-2">
                  {editingId ? (
                    <Button type="button" variant="outline" onClick={resetCaseForm}>{t("subsidiesCancelEdit")}</Button>
                  ) : null}
                  <Button type="submit" variant="primary">{editingId ? t("subsidiesSaveCase") : t("subsidiesCreateCase")}</Button>
                </div>
              </form>
              {dossier.cases.length > 0 ? (
                <div className="mt-6">
                  <h3 className="text-sm font-medium text-foreground">{t("subsidiesSavedRequests")}</h3>
                  <NestedTable className="mt-3">
                    <table className={`${dataTableClass} min-w-[40rem]`}>
                      <thead className={dataTheadClass}>
                        <tr>
                          <th className={dataThClass}>{t("subsidiesEventTitle")}</th>
                          <th className={dataThClass}>{t("subsidiesCaseStatus")}</th>
                          <th className={dataThClass}>{t("subsidiesAccountDueColumn")}</th>
                          <th className={dataThClass} />
                        </tr>
                      </thead>
                      <tbody>
                        {dossier.cases.map((row) => (
                          <tr key={row.id} className="border-b border-border last:border-0">
                            <td className="px-4 py-3 text-sm font-medium">{row.title}</td>
                            <td className="px-4 py-3">
                              <Select
                                value={row.status}
                                onValueChange={(value) =>
                                  selectedClubId &&
                                  updateExtraordinarySubsidy(selectedClubId, row.id, { status: value })
                                    .then(setDossier)
                                    .catch((error) => setErrorMessage(error.message))
                                }
                              >
                                <SelectTrigger size="sm" className="w-44"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {CASE_STATUS.map((status) => (
                                    <SelectItem key={status} value={status}>{t(CASE_STATUS_LABEL[status])}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </td>
                            <td className="px-4 py-3 text-sm text-muted">{row.account_due}</td>
                            <td className="px-4 py-3">
                              <div className="flex flex-wrap justify-end gap-2">
                                <Button type="button" variant="outline" size="sm" onClick={() => onEditCase(row)}>
                                  {t("subsidiesEditCase")}
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    if (!selectedClubId || !window.confirm(t("subsidiesDeleteConfirm"))) return;
                                    void deleteExtraordinarySubsidy(selectedClubId, row.id)
                                      .then((next) => {
                                        if (editingId === row.id) resetCaseForm();
                                        setDossier(next);
                                      })
                                      .catch((error) => setErrorMessage(error.message));
                                  }}
                                >
                                  {t("subsidiesDeleteCase")}
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() =>
                                    selectedClubId && downloadExtraordinaryForm(selectedClubId, row.id).catch((error) => setErrorMessage(error.message))
                                  }
                                >
                                  <Download aria-hidden />
                                  {t("subsidiesDownloadForm")}
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </NestedTable>
                </div>
              ) : null}
            </FormPanel>
          </>
        )}
      </div>
    </ClubAdminLayout>
  );
}
