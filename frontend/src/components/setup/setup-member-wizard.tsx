"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import {
  ExplainedCount,
  ImportStatusBadge,
  StatusLegend,
  StepIntro,
  WizardStepPills,
  type ImportBadgeTone,
} from "@/components/import/wizard-chrome";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { PageNotice } from "@/components/ui/list-page-chrome";
import { PopoverSelect } from "@/components/ui/popover-select";
import { RequiredForm } from "@/components/ui/label";
import {
  detectDateFormat,
  IMPORT_DATE_FORMATS,
  parseCsv,
  type DateFormatDetection,
  type ImportDateFormat,
} from "@/lib/import-date-format";
import { applySuggestedMapping, detectMembershipEndDateHeader, unusedSourceHeaders } from "@/lib/import-mapping";
import type { LtfLicensePrefixRewritePolicy } from "@/lib/import-api";
import { SETUP_MEMBER_TARGET_FIELDS, shareMemberIdColumn } from "@/lib/setup-member-mapping";
import { formatFullName } from "@/lib/person-name";
import { confirmSetupMembers, previewSetupMembers, type SetupMemberPreview, type SetupMemberRow } from "@/lib/setup-api";
import {
  setupIssueMessage,
  setupPreviewSummary,
  setupRowIssues,
  setupRowStatus,
  withLocalPark,
  type SetupRowStatus,
} from "@/lib/setup-member-preview";

type InnerStep = "source" | "mapping" | "preview" | "confirm" | "result";
type PreviewFilter = "all" | "ready" | "staff" | "choice" | "parked" | "skipped";
type SortKey = "name" | "club" | "status";

const FIELDS = SETUP_MEMBER_TARGET_FIELDS;

const STAFF_FUNCTIONS = ["coach", "medic", "media", "other", "secretary"] as const;
const EMPTY_DETECTION: DateFormatDetection = { status: "empty", format: null, candidates: [] };

type MemberResult = {
  created: number;
  updated: number;
  skipped: number;
  parked?: number;
  ltf_staff: number;
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function columnValues(headers: string[], rows: string[][], header: string | undefined): string[] {
  if (!header) return [];
  const index = headers.indexOf(header);
  if (index < 0) return [];
  return rows.map((row) => (row[index] ?? "").trim()).filter(Boolean);
}

function autoMap(headers: string[]): Record<string, string> {
  const mapping = applySuggestedMapping(
    FIELDS.map((field) => ({ key: field.key, label: field.key })),
    headers,
  );
  if (!mapping.membership_end_date) {
    const header = detectMembershipEndDateHeader(headers);
    if (header) mapping.membership_end_date = header;
  }
  delete mapping.email;
  return shareMemberIdColumn(mapping);
}

export function SetupMemberWizard({ onDone }: { onDone: () => void }) {
  const t = useTranslations("Setup");
  const shared = useTranslations("Import");
  const common = useTranslations("Common");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<InnerStep>("source");
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [tableRows, setTableRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<SetupMemberPreview | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dateFormat, setDateFormat] = useState("");
  const [endDateFormat, setEndDateFormat] = useState("");
  const [dateDetection, setDateDetection] = useState<DateFormatDetection>(EMPTY_DETECTION);
  const [endDetection, setEndDetection] = useState<DateFormatDetection>(EMPTY_DETECTION);
  const [sexChoice, setSexChoice] = useState<Record<number, string>>({});
  const [activeChoice, setActiveChoice] = useState<Record<number, string>>({});
  const [clubChoice, setClubChoice] = useState<Record<string, string>>({});
  const [memberClubChoice, setMemberClubChoice] = useState<Record<string, string>>({});
  const [functionChoice, setFunctionChoice] = useState<Record<number, string>>({});
  const [allowMissing, setAllowMissing] = useState<Record<number, boolean>>({});
  const [parkedRows, setParkedRows] = useState<Record<number, boolean>>({});
  const [filter, setFilter] = useState<PreviewFilter>("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "name", dir: "asc" });
  const [result, setResult] = useState<MemberResult | null>(null);

  const fieldLabel = (key: string) => t(`field_${key}`);
  const requiredFields = FIELDS.filter((field) => field.required);
  const mappingComplete = requiredFields.every((field) => Boolean(mapping[field.key]));
  const unused = useMemo(
    () => unusedSourceHeaders(headers, mapping, [mapping.membership_end_date]),
    [headers, mapping],
  );
  const summary = useMemo(() => {
    if (!preview) return null;
    return setupPreviewSummary({
      ...preview,
      rows: preview.rows.map((row) => withLocalPark(row, parkedRows)),
    });
  }, [parkedRows, preview]);
  const choicesClear = summary !== null && summary.choice === 0;

  const markDirty = () => setDirty(true);

  const readFile = async (next: File) => {
    const text = await next.text();
    const parsed = parseCsv(text);
    const nextHeaders = parsed[0] ?? [];
    const body = parsed.slice(1);
    const nextMapping = autoMap(nextHeaders);
    setFile(next);
    setHeaders(nextHeaders);
    setTableRows(body);
    setMapping(nextMapping);
    setPreview(null);
    setDirty(false);
    setResult(null);
    setSexChoice({});
    setActiveChoice({});
    setClubChoice({});
    setMemberClubChoice({});
    setFunctionChoice({});
    setAllowMissing({});
    const dob = detectDateFormat(columnValues(nextHeaders, body, nextMapping.date_of_birth));
    const end = detectDateFormat(columnValues(nextHeaders, body, nextMapping.membership_end_date));
    setDateDetection(dob);
    setEndDetection(end);
    setDateFormat(dob.format ?? "DD/MM/YYYY");
    setEndDateFormat(end.format ?? "DD/MM/YYYY");
    setStep("source");
  };

  const payload = () => {
    const sex_overrides: Record<string, string> = {};
    for (const [key, value] of Object.entries(sexChoice)) {
      if (value) sex_overrides[key] = value;
    }
    const active_overrides: Record<string, boolean> = {};
    for (const [key, value] of Object.entries(activeChoice)) {
      if (value === "active" || value === "inactive") active_overrides[key] = value === "active";
    }
    const club_name_overrides: Record<string, { club_id?: number; staff?: boolean; skip?: boolean }> = {};
    for (const [name, value] of Object.entries(clubChoice)) {
      if (value === "staff") club_name_overrides[name] = { staff: true };
      else if (value === "skip") club_name_overrides[name] = { skip: true };
      else if (value && value !== "__unset__") club_name_overrides[name] = { club_id: Number(value) };
    }
    const club_choices: Record<string, number> = {};
    for (const [memberId, value] of Object.entries(memberClubChoice)) {
      if (value) club_choices[memberId] = Number(value);
    }
    const staff_function_overrides: Record<string, string> = {};
    for (const [key, value] of Object.entries(functionChoice)) {
      if (value) staff_function_overrides[key] = value;
    }
    return {
      mapping,
      sex_overrides,
      active_overrides,
      club_name_overrides,
      club_choices,
      staff_function_overrides,
      allow_missing_id: Object.entries(allowMissing)
        .filter(([, on]) => on)
        .map(([key]) => Number(key)),
      parked_rows: Object.entries(parkedRows)
        .filter(([, on]) => on)
        .map(([key]) => Number(key)),
      ...(dateFormat ? { date_format: dateFormat } : {}),
      ...(endDateFormat ? { end_date_format: endDateFormat } : {}),
    };
  };

  const runPreview = async () => {
    if (!file || !mappingComplete) return;
    setBusy(true);
    setError(null);
    try {
      const next = await previewSetupMembers(file, payload());
      setPreview(next);
      setDirty(false);
      setStep("preview");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("previewFailed"));
    } finally {
      setBusy(false);
    }
  };

  const runConfirm = async () => {
    if (!file || !preview || !choicesClear || dirty) return;
    setBusy(true);
    setError(null);
    try {
      const confirmed = await confirmSetupMembers(file, payload());
      const body = confirmed as MemberResult;
      setResult({
        created: body.created ?? 0,
        updated: body.updated ?? 0,
        skipped: body.skipped ?? 0,
        parked: body.parked ?? 0,
        ltf_staff: body.ltf_staff ?? 0,
      });
      setStep("result");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("previewFailed"));
    } finally {
      setBusy(false);
    }
  };

  const displayStatus = useCallback(
    (row: SetupMemberRow): SetupRowStatus => setupRowStatus(withLocalPark(row, parkedRows)),
    [parkedRows],
  );

  const rows = useMemo(() => {
    const source = preview?.rows ?? [];
    const visible = source.filter((row) => filter === "all" || displayStatus(row) === filter);
    const value = (row: SetupMemberRow) =>
      sort.key === "club"
        ? row.resolution.club_name || row.club_name
        : sort.key === "status"
          ? displayStatus(row)
          : formatFullName(row);
    return [...visible].sort((left, right) => value(left).localeCompare(value(right)) * (sort.dir === "asc" ? 1 : -1));
  }, [displayStatus, filter, preview, sort]);

  const toggleSort = (key: SortKey) => {
    setSort((current) => ({ key, dir: current.key === key && current.dir === "asc" ? "desc" : "asc" }));
  };

  const skipChoiceRows = () => {
    if (!preview) return;
    setSexChoice((current) => {
      const next = { ...current };
      for (const row of preview.rows) {
        if (displayStatus(row) === "choice") next[row.row_index] = "skip";
      }
      return next;
    });
    markDirty();
  };

  const dateLabel = (format: string) => (format === "EXCEL" ? shared("dateFormatExcel") : format);
  const dateOptions = IMPORT_DATE_FORMATS.map((option) => ({ value: option, label: dateLabel(option) }));
  const sample = tableRows.slice(0, 5);
  const steps: Array<{ id: InnerStep; label: string }> = [
    { id: "source", label: shared("sourceStepTitle") },
    { id: "mapping", label: shared("mappingStepTitle") },
    { id: "preview", label: shared("previewStepTitle") },
    { id: "confirm", label: shared("confirmStepTitle") },
    { id: "result", label: shared("resultStepTitle") },
  ];

  const parkAllUnresolved = () => {
    if (!preview) return;
    setParkedRows((current) => {
      const next = { ...current };
      for (const row of preview.rows) {
        if (row.parkable && displayStatus(row) === "choice") next[row.row_index] = true;
      }
      return next;
    });
  };

  const chooseClub = (clubKey: string, value: string) => {
    const clearing = value === "__unset__" || value === "";
    const hadChoice = Boolean(clubChoice[clubKey]);
    setClubChoice((current) => {
      const next = { ...current };
      if (clearing) delete next[clubKey];
      else next[clubKey] = value;
      return next;
    });
    if (!clearing) {
      setParkedRows((current) => {
        const next = { ...current };
        for (const candidate of preview?.rows ?? []) {
          if (candidate.club_name.toLowerCase() === clubKey) next[candidate.row_index] = false;
        }
        return next;
      });
      markDirty();
      return;
    }
    if (hadChoice) markDirty();
  };

  const statusLabel = (status: SetupRowStatus) =>
    status === "ready"
      ? shared("statusReady")
      : status === "staff"
        ? t("statusStaff")
        : status === "choice"
          ? t("statusChoice")
          : status === "parked"
            ? t("statusParked")
            : shared("statusSkipped");
  const statusTone = (status: SetupRowStatus): ImportBadgeTone =>
    status === "ready" ? "success" : status === "staff" ? "info" : status === "parked" ? "warning" : status === "choice" ? "danger" : "neutral";

  const dateControl = (which: "dob" | "end") => {
    const detection = which === "dob" ? dateDetection : endDetection;
    const value = which === "dob" ? dateFormat : endDateFormat;
    const label = which === "dob" ? shared("dateFormatLabel") : t("endDateFormatLabel");
    return (
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">{label}</label>
        {detection.status === "detected" && detection.format ? (
          <p className="banner-info rounded-[var(--radius-form)] border px-3 py-2 text-sm">
            {shared("dateFormatDetected", { format: dateLabel(detection.format) })}
          </p>
        ) : null}
        {detection.status === "ambiguous" ? (
          <p className="banner-warning rounded-[var(--radius-form)] border px-3 py-2 text-sm">{shared("dateFormatAmbiguous")}</p>
        ) : null}
        <PopoverSelect
          value={value}
          onValueChange={(next) => {
            if (which === "dob") setDateFormat(next as ImportDateFormat);
            else setEndDateFormat(next as ImportDateFormat);
            markDirty();
            if (step === "confirm") setStep("preview");
          }}
          ariaLabel={label}
          placeholder={shared("dateFormatPlaceholder")}
          options={dateOptions}
          className="w-64"
        />
      </div>
    );
  };

  const counts = summary ? (
    <div className="grid gap-3 md:grid-cols-2">
      <ExplainedCount label={t("summaryWillImport", { count: summary.willImport })} hint={t("summaryWillImportHint")} hintLabel={t("hintLabel")} tone="success" />
      <ExplainedCount label={t("summaryStaff", { count: summary.staff })} hint={t("summaryStaffHint")} hintLabel={t("hintLabel")} tone="info" />
      <ExplainedCount
        label={t("summaryGender", { count: summary.gender })}
        hint={t("summaryGenderHint")}
        hintLabel={t("hintLabel")}
        tone={summary.gender ? "danger" : "neutral"}
      />
      <ExplainedCount label={t("summaryTrainer", { count: summary.trainer })} hint={t("summaryTrainerHint")} hintLabel={t("hintLabel")} tone="warning" />
      {summary.otherRoles > 0 ? (
        <ExplainedCount
          label={t("summaryOtherRoles", { count: summary.otherRoles, names: summary.otherLabels.join(", ") })}
          hint={t("summaryOtherRolesHint")}
          hintLabel={t("hintLabel")}
          tone="warning"
        />
      ) : null}
      <ExplainedCount label={t("summaryActive", { count: summary.active })} hint={t("summaryActiveHint")} hintLabel={t("hintLabel")} />
      <ExplainedCount label={t("summaryInactive", { count: summary.inactive })} hint={t("summaryInactiveHint")} hintLabel={t("hintLabel")} />
      <ExplainedCount label={t("summaryBlank", { count: summary.blank })} hint={t("summaryBlankHint")} hintLabel={t("hintLabel")} />
      <ExplainedCount label={t("summaryEmail")} hint={t("summaryEmailHint")} hintLabel={t("hintLabel")} />
      {summary.unknownClubRows > 0 ? (
        <ExplainedCount
          label={t("summaryUnknownClubs", { count: summary.unknownClubRows })}
          hint={t("summaryUnknownClubsHint")}
          hintLabel={t("hintLabel")}
          tone="danger"
        />
      ) : null}
    </div>
  ) : null;

  const primaryLabel =
    step === "source"
      ? shared("continueToMapping")
      : step === "mapping"
        ? shared("previewButton")
        : step === "preview"
          ? dirty
            ? t("refreshPreview")
            : shared("continueToConfirm")
          : step === "confirm"
            ? shared("startImport")
            : t("continueAdmins");

  const primaryDisabled =
    busy ||
    (step === "source" && (!file || headers.length === 0)) ||
    (step === "mapping" && !mappingComplete) ||
    (step === "preview" && (!preview || (dirty ? false : preview.rows.length === 0))) ||
    (step === "confirm" && (!preview || !choicesClear || dirty));

  const handlePrimary = () => {
    if (step === "source" && file && headers.length > 0) {
      setStep("mapping");
      return;
    }
    if (step === "mapping" || (step === "preview" && dirty)) {
      void runPreview();
      return;
    }
    if (step === "preview" && preview) {
      setStep("confirm");
      return;
    }
    if (step === "confirm") {
      void runConfirm();
      return;
    }
    if (step === "result") onDone();
  };

  const goBack = () => {
    const order: InnerStep[] = ["source", "mapping", "preview", "confirm", "result"];
    const index = order.indexOf(step);
    if (index > 0) setStep(order[index - 1]);
  };

  return (
    <div className="space-y-3" data-member-step={step}>
      {error ? <p className="banner-danger rounded-[var(--radius-form)] border px-3 py-2 text-sm">{error}</p> : null}
      <WizardStepPills steps={steps} currentId={step} resultTone={step === "result" ? "success" : null} />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <section className="rounded-[var(--radius-card)] border border-border bg-card p-3">
          {step === "source" ? (
            <div className="space-y-3">
              <StepIntro title={shared("sourceStepTitle")}>
                <p>{t("membersIntro")}</p>
                <p>{t("membersNotImported")}</p>
              </StepIntro>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">{shared("fileLabel")}</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  aria-label={t("chooseFile")}
                  onChange={(event) => {
                    const next = event.target.files?.[0];
                    if (next) void readFile(next);
                  }}
                />
                <div className="flex flex-wrap items-center gap-3">
                  <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()}>
                    {file ? shared("changeFileButton") : shared("chooseFileButton")}
                  </Button>
                  <span className="text-sm text-muted">{file ? file.name : shared("noFileSelected")}</span>
                </div>
              </div>
              {file ? (
                <div className="rounded-[var(--radius-card)] border border-border bg-secondary p-3 text-sm text-foreground">
                  <p>
                    <span className="font-medium">{shared("fileNameLabel")}:</span> {file.name}
                  </p>
                  <p>
                    <span className="font-medium">{shared("fileSizeLabel")}:</span> {formatFileSize(file.size)}
                  </p>
                  <p>
                    <span className="font-medium">{shared("totalColumnsLabel")}:</span> {headers.length}
                  </p>
                  <p>
                    <span className="font-medium">{shared("totalRowsLabel")}:</span> {tableRows.length}
                  </p>
                </div>
              ) : null}
              {headers.length > 0 && sample.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">{shared("sampleRowsTitle")}</p>
                  <div className="max-h-72 overflow-auto rounded-[var(--radius-form)] border border-border">
                    <table className="w-full text-sm">
                      <thead className="bg-secondary text-left text-xs uppercase text-muted">
                        <tr>
                          {headers.map((header) => (
                            <th key={header} className="px-2 py-2 font-medium">
                              {header}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {sample.map((sampleRow, index) => (
                          <tr key={index} className="border-t border-border text-foreground">
                            {headers.map((header, headerIndex) => (
                              <td key={`${header}-${headerIndex}`} className="px-2 py-2">
                                {sampleRow[headerIndex] ?? ""}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
              {file ? (
                <div className="grid gap-3 md:grid-cols-2">
                  {dateControl("dob")}
                  {dateControl("end")}
                </div>
              ) : null}
            </div>
          ) : null}

          {step === "mapping" ? (
            <div className="space-y-3">
              <StepIntro title={shared("mappingStepTitle")}>
                <p>{t("membersMapIntro")}</p>
                <p>{t("membersSharedIdHint")}</p>
                <p>{t("membersNotImported")}</p>
              </StepIntro>
              <PrefixNotice policy={preview?.ltf_license_prefix_rewrite} />
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setMapping(autoMap(headers));
                    markDirty();
                  }}
                >
                  {shared("autoMapButton")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={Object.keys(mapping).length === 0}
                  onClick={() => {
                    setMapping({});
                    markDirty();
                  }}
                >
                  {shared("clearMappingButton")}
                </Button>
              </div>
              <RequiredForm>
                <div className="rounded-[var(--radius-form)] border border-border">
                  <table className="w-full text-sm">
                    <thead className="bg-secondary text-left text-xs uppercase text-muted">
                      <tr>
                        <th className="px-3 py-2 font-medium">{shared("targetFieldLabel")}</th>
                        <th className="px-3 py-2 font-medium">{shared("requiredFieldLabel")}</th>
                        <th className="px-3 py-2 font-medium">{shared("sourceColumnLabel")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {FIELDS.map((field) => (
                        <tr key={field.key} className="border-t border-border text-foreground">
                          <td className="px-3 py-2">
                            {fieldLabel(field.key)}
                            {field.required ? (
                              <span aria-hidden="true" data-required="true" className="text-destructive">
                                {" *"}
                              </span>
                            ) : null}
                          </td>
                          <td className="px-3 py-2">{field.required ? shared("requiredBadge") : "—"}</td>
                          <td className="px-3 py-2">
                            <PopoverSelect
                              value={mapping[field.key] ?? "__none__"}
                              onValueChange={(value) => {
                                setMapping((current) => {
                                  const next = { ...current };
                                  if (value === "__none__") delete next[field.key];
                                  else next[field.key] = value;
                                  return next;
                                });
                                markDirty();
                              }}
                              ariaLabel={`${shared("sourceColumnLabel")}: ${fieldLabel(field.key)}`}
                              placeholder={shared("selectColumnPlaceholder")}
                              searchable
                              searchPlaceholder={shared("searchColumns")}
                              emptyMessage={shared("noMatches")}
                              className="w-72"
                              options={[
                                { value: "__none__", label: shared("notMappedOption") },
                                ...headers.map((header) => ({ value: header, label: header })),
                              ]}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </RequiredForm>
              {unused.length > 0 ? (
                <p className="text-sm text-muted">
                  {shared("unusedColumnsLabel")}: {unused.join(", ")}
                </p>
              ) : null}
              <p className="text-sm text-muted">
                {shared("mappingProgressLabel", {
                  mapped: requiredFields.filter((field) => mapping[field.key]).length,
                  total: requiredFields.length,
                })}
              </p>
              {file ? (
                <div className="grid gap-3 md:grid-cols-2">
                  {dateControl("dob")}
                  {dateControl("end")}
                </div>
              ) : null}
            </div>
          ) : null}

          {step === "preview" && preview && summary ? (
            <div className="space-y-3">
              <StepIntro title={shared("previewStepTitle")}>
                <p>{t("membersPreviewIntro")}</p>
              </StepIntro>
              <PrefixNotice policy={preview.ltf_license_prefix_rewrite} />
              {dirty ? <p className="banner-warning rounded-[var(--radius-form)] border px-3 py-2 text-sm">{shared("previewOutdated")}</p> : null}
              {counts}
              <StatusLegend
                title={t("legendTitle")}
                items={[
                  { label: shared("statusReady"), hint: t("statusReadyHint"), tone: "success" },
                  { label: t("statusStaff"), hint: t("statusStaffHint"), tone: "info" },
                  { label: t("statusChoice"), hint: t("statusChoiceHint"), tone: "danger" },
                  { label: t("statusParked"), hint: t("statusParkedHint"), tone: "warning" },
                  { label: shared("statusSkipped"), hint: t("statusSkippedHint"), tone: "neutral" },
                ]}
              />
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ["all", shared("filterAll"), preview.rows.length],
                    ["ready", shared("statusReady"), summary.ready],
                    ["staff", t("statusStaff"), summary.staff],
                    ["choice", t("statusChoice"), summary.choice],
                    ["parked", t("statusParked"), summary.parked],
                    ["skipped", shared("statusSkipped"), summary.skipped],
                  ] as const
                ).map(([id, label, count]) => (
                  <button
                    key={id}
                    type="button"
                    className={`inline-flex items-center rounded-[var(--radius-form)] border px-2.5 py-1 text-xs font-medium ${
                      filter === id ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground hover:bg-secondary"
                    }`}
                    onClick={() => setFilter(id)}
                  >
                    {label} ({count})
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={parkAllUnresolved}>
                  {t("parkAllUnresolved")}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={skipChoiceRows}>
                  {shared("skipInvalidRowsButton")}
                </Button>
              </div>
              <div className="max-h-[520px] overflow-auto rounded-[var(--radius-form)] border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-secondary text-left text-xs uppercase text-muted">
                    <tr>
                      <th className="px-2 py-2 font-medium">{shared("rowLabel")}</th>
                      <th className="px-2 py-2 font-medium">
                        <button type="button" onClick={() => toggleSort("status")}>
                          {shared("statusLabel")}
                        </button>
                      </th>
                      <th className="px-2 py-2 font-medium">
                        <button type="button" onClick={() => toggleSort("name")}>
                          {shared("dataLabel")}
                        </button>
                      </th>
                      <th className="px-2 py-2 font-medium">{shared("wtLicenseLabel")}</th>
                      <th className="px-2 py-2 font-medium">{shared("ltfLicenseLabel")}</th>
                      <th className="px-2 py-2 font-medium">
                        <button type="button" onClick={() => toggleSort("club")}>
                          {t("club")}
                        </button>
                      </th>
                      <th className="px-2 py-2 font-medium">{t("sex")}</th>
                      <th className="px-2 py-2 font-medium">{t("active")}</th>
                      <th className="px-2 py-2 font-medium">{t("function")}</th>
                      <th className="px-2 py-2 font-medium">{shared("errorsLabel")}</th>
                      <th className="px-2 py-2 font-medium">{shared("actionLabel")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const shown = withLocalPark(row, parkedRows);
                      const status = setupRowStatus(shown);
                      const issues = setupRowIssues(shown);
                      const clubKey = row.club_name.toLowerCase();
                      return (
                        <tr key={row.row_index} className="border-t border-border align-top text-foreground" data-preview-outcome={status}>
                          <td className="px-2 py-2">{row.row_index}</td>
                          <td className="px-2 py-2">
                            <ImportStatusBadge tone={statusTone(status)} label={statusLabel(status)} />
                            {issues
                              .filter((issue) => issue !== "dob")
                              .map((issue) => (
                                <p key={issue} className="mt-1 max-w-xs text-xs text-destructive">
                                  {setupIssueMessage(t, row, issue)}
                                </p>
                              ))}
                          </td>
                          <td className="px-2 py-2 text-xs">
                            <p className="font-medium">{formatFullName(row)}</p>
                            <p>
                              {row.primary_license_role || t("ignored")}
                              {row.secondary_license_role ? ` / ${row.secondary_license_role}` : ""}
                            </p>
                            {!row.primary_license_role && (row.primary_raw || row.secondary_raw) ? (
                              <p className="text-muted">{t("roleIgnoredNote")}</p>
                            ) : null}
                            {!row.member_id ? (
                              <label className="mt-1 flex items-center gap-2">
                                <Checkbox
                                  checked={Boolean(allowMissing[row.row_index])}
                                  onCheckedChange={(checked) => {
                                    setAllowMissing((current) => ({ ...current, [row.row_index]: checked === true }));
                                    markDirty();
                                  }}
                                  aria-label={t("allowMissing")}
                                />
                                <span>
                                  {t("allowMissing")}
                                  <span aria-hidden="true" data-required="true" className="text-destructive">
                                    {" *"}
                                  </span>
                                </span>
                              </label>
                            ) : null}
                          </td>
                          <td className="px-2 py-2 text-xs">{row.wt_license_id || "—"}</td>
                          <td className="px-2 py-2 text-xs">{row.ltf_license_id || row.member_id || "—"}</td>
                          <td className="px-2 py-2 text-xs">
                            <p>{row.resolution.club_name || row.club_name || "—"}</p>
                            {row.resolution.kind === "unknown" || row.resolution.kind === "no_club" || row.resolution.kind === "near_ltf" || row.resolution.kind === "ambiguous" ? (
                              <PopoverSelect
                                value={clubChoice[clubKey] || ""}
                                ariaLabel={t("clubIfKnown")}
                                placeholder={t("clubIfKnown")}
                                onValueChange={(value) => chooseClub(clubKey, value)}
                                options={[
                                  { value: "__unset__", label: t("clubNotYet") },
                                  { value: "staff", label: t("ltfStaff") },
                                  { value: "skip", label: t("skipRows") },
                                  ...preview.clubs.map((club) => ({ value: String(club.id), label: club.name })),
                                ]}
                                className="mt-1 w-56"
                              />
                            ) : null}
                            {row.group_conflict ? (
                              <PopoverSelect
                                value={memberClubChoice[row.member_id] || ""}
                                ariaLabel={t("resolveClub")}
                                onValueChange={(value) => {
                                  setMemberClubChoice((current) => ({ ...current, [row.member_id]: value }));
                                  markDirty();
                                }}
                                options={preview.clubs.map((club) => ({ value: String(club.id), label: club.name }))}
                                className="mt-1 w-56"
                              />
                            ) : null}
                          </td>
                          <td className="px-2 py-2">
                            {row.sex_blocking ? (
                              <span className="inline-flex items-center gap-1">
                              <PopoverSelect
                                value={sexChoice[row.row_index] || ""}
                                ariaLabel={t("sex")}
                                onValueChange={(value) => {
                                  setSexChoice((current) => ({ ...current, [row.row_index]: value }));
                                  markDirty();
                                }}
                                options={[
                                  { value: "M", label: t("male") },
                                  { value: "F", label: t("female") },
                                  { value: "skip", label: t("skipRows") },
                                ]}
                                className="w-40"
                              />
                              <span aria-hidden="true" data-required="true" className="text-destructive">
                                *
                              </span>
                              </span>
                            ) : row.sex === "M" ? (
                              t("male")
                            ) : row.sex === "F" ? (
                              t("female")
                            ) : (
                              row.sex_raw || "—"
                            )}
                          </td>
                          <td className="px-2 py-2">
                            {row.end_unparseable ? (
                              <span className="inline-flex items-center gap-1">
                              <PopoverSelect
                                value={activeChoice[row.row_index] || ""}
                                ariaLabel={t("active")}
                                onValueChange={(value) => {
                                  setActiveChoice((current) => ({ ...current, [row.row_index]: value }));
                                  markDirty();
                                }}
                                options={[
                                  { value: "active", label: t("active") },
                                  { value: "inactive", label: t("inactive") },
                                ]}
                                className="w-36"
                              />
                              <span aria-hidden="true" data-required="true" className="text-destructive">
                                *
                              </span>
                              </span>
                            ) : row.is_active == null ? (
                              "—"
                            ) : (
                              <ImportStatusBadge tone={row.is_active ? "success" : "neutral"} label={row.is_active ? t("active") : t("inactive")} />
                            )}
                          </td>
                          <td className="px-2 py-2">
                            {row.resolution.kind === "staff" || row.also_staff ? (
                              <PopoverSelect
                                value={functionChoice[row.row_index] || row.staff_function || "other"}
                                ariaLabel={t("function")}
                                onValueChange={(value) => {
                                  setFunctionChoice((current) => ({ ...current, [row.row_index]: value }));
                                  markDirty();
                                }}
                                options={STAFF_FUNCTIONS.map((value) => ({ value, label: t(`function_${value}`) }))}
                                className="w-40"
                              />
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="px-2 py-2 text-xs text-destructive">
                            {issues.map((issue) => (
                              <p key={issue} className={issue === "dob" ? "text-muted" : undefined}>
                                {setupIssueMessage(t, row, issue)}
                              </p>
                            ))}
                          </td>
                          <td className="px-2 py-2">
                            {row.parkable ? (
                              <Button
                                type="button"
                                size="sm"
                                variant={status === "parked" ? "secondary" : "outline"}
                                className="mb-1"
                                onClick={() => {
                                  setParkedRows((current) => ({ ...current, [row.row_index]: status !== "parked" }));
                                }}
                              >
                                {t("parkRow")}
                              </Button>
                            ) : null}
                            <PopoverSelect
                              value={sexChoice[row.row_index] === "skip" || row.resolution.kind === "skip" ? "skip" : "import"}
                              ariaLabel={shared("actionLabel")}
                              onValueChange={(value) => {
                                setSexChoice((current) => {
                                  const next = { ...current };
                                  if (value === "skip") next[row.row_index] = "skip";
                                  else if (next[row.row_index] === "skip") delete next[row.row_index];
                                  return next;
                                });
                                markDirty();
                              }}
                              options={[
                                { value: "import", label: t("importRow") },
                                { value: "skip", label: t("skipRows") },
                              ]}
                              className="w-36"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {step === "confirm" && preview && summary ? (
            <div className="space-y-3">
              <StepIntro title={shared("confirmStepTitle")}>
                <p>{t("membersConfirmIntro")}</p>
              </StepIntro>
              <PrefixNotice policy={preview.ltf_license_prefix_rewrite} />
              {counts}
              {summary.choice > 0 ? (
                <div className="banner-danger space-y-2 rounded-[var(--radius-form)] border px-3 py-2 text-sm">
                  <p className="font-medium">{t("blockingTitle")}</p>
                  <ul className="list-disc space-y-1 pl-5">
                    {summary.issueKinds.map((issue) => (
                      <li key={issue}>{t(`fix_${issue}`)}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="banner-notice rounded-[var(--radius-form)] border px-3 py-2 text-sm">{t("membersConfirmReady")}</p>
              )}
            </div>
          ) : null}

          {step === "result" && result ? (
            <div className="space-y-3">
              <StepIntro title={shared("resultStepTitle")}>
                <p>{t("membersResultIntro")}</p>
                <p>{t("membersResultNext")}</p>
              </StepIntro>
              <div className="grid gap-3 md:grid-cols-2">
                <ExplainedCount label={t("resultCreated", { count: result.created })} hint={t("resultCreatedHint")} hintLabel={t("hintLabel")} tone="success" />
                <ExplainedCount label={t("resultUpdated", { count: result.updated })} hint={t("resultUpdatedHint")} hintLabel={t("hintLabel")} />
                <ExplainedCount label={t("resultSkipped", { count: result.skipped })} hint={t("resultSkippedHint")} hintLabel={t("hintLabel")} />
                <ExplainedCount label={t("resultStaff", { count: result.ltf_staff })} hint={t("resultStaffHint")} hintLabel={t("hintLabel")} tone="info" />
                <ExplainedCount label={t("resultParked", { count: result.parked ?? 0 })} hint={t("resultParkedHint")} hintLabel={t("hintLabel")} tone="warning" />
              </div>
            </div>
          ) : null}
        </section>

        <aside className="h-fit rounded-[var(--radius-card)] border border-border bg-card p-3">
          <h3 className="text-sm font-semibold text-foreground">{shared("summaryTitle")}</h3>
          <div className="mt-3 space-y-2 text-sm text-foreground">
            <p>
              <span className="font-medium">{shared("fileNameLabel")}:</span> {file?.name ?? "—"}
            </p>
            <p>
              <span className="font-medium">{shared("dateFormatLabel")}:</span> {dateFormat ? dateLabel(dateFormat) : "—"}
            </p>
            <p>
              <span className="font-medium">{t("endDateFormatLabel")}:</span> {endDateFormat ? dateLabel(endDateFormat) : "—"}
            </p>
            <p>
              <span className="font-medium">{shared("totalRowsLabel")}:</span> {preview?.rows.length ?? tableRows.length}
            </p>
            {summary ? (
              <>
                <p>
                  <span className="font-medium">{shared("statusReady")}:</span> {summary.ready}
                </p>
                <p>
                  <span className="font-medium">{t("statusStaff")}:</span> {summary.staff}
                </p>
                <p>
                  <span className="font-medium">{t("statusChoice")}:</span> {summary.choice}
                </p>
                <p>
                  <span className="font-medium">{t("statusParked")}:</span> {summary.parked}
                </p>
                <p>
                  <span className="font-medium">{shared("statusSkipped")}:</span> {summary.skipped}
                </p>
              </>
            ) : null}
            <p>{t("summaryEmail")}</p>
          </div>
          <p
            className={`mt-4 rounded-[var(--radius-form)] border px-3 py-2 text-xs ${
              dirty ? "banner-warning" : preview ? "banner-success" : file ? "banner-info" : "border-border bg-secondary text-foreground"
            }`}
          >
            {dirty ? shared("summaryPreviewOutdated") : preview ? shared("summaryPreviewCurrent") : file ? shared("summaryPreviewReady") : shared("summaryPreviewNotStarted")}
          </p>
        </aside>
      </div>
      <section className="rounded-[var(--radius-card)] border border-border bg-card p-4" data-wizard-nav>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button type="button" variant="outline" onClick={goBack} disabled={busy || step === "source"}>
            {common("paginationPrevious")}
          </Button>
          <Button type="button" variant="primary" onClick={handlePrimary} disabled={primaryDisabled}>
            {busy ? shared("loadingAction") : primaryLabel}
          </Button>
        </div>
      </section>
    </div>
  );
}

function PrefixNotice({ policy }: { policy?: LtfLicensePrefixRewritePolicy }) {
  const shared = useTranslations("Import");
  if (!policy) {
    return null;
  }
  return (
    <PageNotice tone="info">
      {policy.enabled
        ? shared("ltfPrefixRewriteEnabledNotice", {
            source: policy.source_prefix,
            target: policy.target_prefix,
          })
        : shared("ltfPrefixRewriteDisabledNotice")}
      {policy.enabled && policy.rewritten_count > 0
        ? ` ${shared("ltfPrefixRewriteAppliedCount", {
            count: policy.rewritten_count,
            source: policy.source_prefix,
            target: policy.target_prefix,
          })}`
        : null}
    </PageNotice>
  );
}
