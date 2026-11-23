"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Download, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PopoverSelect } from "@/components/ui/popover-select";
import {
  checkImport,
  commitImport,
  downloadImportResult,
  downloadImportTemplate,
  readImportBatch,
  saveImportMapping,
  undoImport,
  uploadImportFile,
  type ImportBatch,
  type ImportReport,
  type ImportSheet,
  type ImportUpload,
} from "@/lib/club-data-import";
import { ClubImportPreview } from "@/components/club-admin/club-import-preview";
import { importFailureMessage } from "@/lib/import-failure";
import { applyListedChoice, isListedDuplicate } from "@/lib/import-choices";

const STEPS = ["file", "map", "check", "duplicates", "dryRun", "commit"] as const;
const HOUSEHOLD_SHEETS = [
  "emails",
  "phones",
  "addresses",
  "people",
  "contacts",
  "person_emails",
  "person_phones",
  "person_addresses",
  "families",
  "family_members",
  "rebate_rules",
];

export function ClubDataImport({ locale }: { locale: string }) {
  const t = useTranslations("ClubAdmin");
  const titleRef = useRef<HTMLHeadingElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const fieldId = useId();
  const [step, setStep] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [upload, setUpload] = useState<ImportUpload | null>(null);
  const [mapping, setMapping] = useState<Record<string, Record<string, string>>>({});
  const [mappingName, setMappingName] = useState("");
  const [report, setReport] = useState<ImportReport | null>(null);
  const [actions, setActions] = useState<Record<string, string>>({});
  const [modes, setModes] = useState<Record<string, "add" | "replace">>({});
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [batch, setBatch] = useState<ImportBatch | null>(null);
  const [undoText, setUndoText] = useState("");

  useEffect(() => {
    titleRef.current?.focus();
  }, [step]);

  function go(next: number) {
    setErrorMessage(null);
    setStep(next);
  }

  async function uploadFile() {
    if (!file || busy) {
      return;
    }
    setBusy(true);
    setErrorMessage(null);
    try {
      const result = await uploadImportFile(file);
      const next: Record<string, Record<string, string>> = {};
      for (const sheet of result.sheets) {
        next[sheet.key] = sheet.suggested;
      }
      setUpload(result);
      setMapping(next);
      go(1);
    } catch (error) {
      setErrorMessage(importFailureMessage(t, error, "dataImportFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function remember(sheet: ImportSheet) {
    const name = mappingName.trim();
    if (!name || !upload) {
      return;
    }
    setBusy(true);
    setErrorMessage(null);
    try {
      await saveImportMapping({
        name,
        sheet: sheet.key,
        headers: sheet.headers,
        mapping: mapping[sheet.key] || {},
      });
      setMappingName("");
    } catch (error) {
      setErrorMessage(importFailureMessage(t, error, "dataImportFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function runCheck(dryRun: boolean) {
    if (!upload || busy) {
      return;
    }
    setBusy(true);
    setErrorMessage(null);
    try {
      const result = await checkImport(upload.id, mapping, actionsWithModes(), dryRun);
      setReport(result);
      go(dryRun ? 4 : 2);
    } catch (error) {
      setErrorMessage(importFailureMessage(t, error, "dataImportFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function startCommit() {
    if (!upload || !report || busy) {
      return;
    }
    setBusy(true);
    setErrorMessage(null);
    try {
      let next = await commitImport(upload.id, mapping, actionsWithModes());
      setBatch(next);
      const started = Date.now();
      while (next.status === "queued" || next.status === "running") {
        if (Date.now() - started > 120_000) {
          throw new Error("timeout");
        }
        await new Promise((resolve) => window.setTimeout(resolve, 1000));
        next = await readImportBatch(next.id);
        setBatch(next);
      }
      if (next.status === "failed") {
        setErrorMessage(t("dataImportFailed"));
      }
    } catch (error) {
      setErrorMessage(importFailureMessage(t, error, "dataImportFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function runUndo() {
    if (!batch || busy) {
      return;
    }
    setBusy(true);
    setErrorMessage(null);
    try {
      const next = await undoImport(batch.id, undoText.trim());
      setBatch(next);
    } catch (error) {
      setErrorMessage(importFailureMessage(t, error, "dataImportUndoFailed"));
    } finally {
      setBusy(false);
    }
  }

  function actionsWithModes() {
    const next = { ...actions };
    for (const [sheet, mode] of Object.entries(modes)) {
      const key = `__mode:${sheet}`;
      if (mode === "replace") {
        next[key] = "replace";
      } else {
        delete next[key];
      }
    }
    return next;
  }

  function applyAll(action: "create" | "update" | "skip") {
    if (!report) {
      return;
    }
    setActions((current) => applyListedChoice(report.rows, current, action));
  }

  function showFailure(error: unknown, fallbackKey = "dataImportFailed") {
    setErrorMessage(importFailureMessage(t, error, fallbackKey));
  }

  const stepTitle = t(`dataImportStep_${STEPS[step]}`);

  return (
    <div className="space-y-4">
      <ol className="flex flex-wrap gap-2 text-sm">
        {STEPS.map((name, index) => (
          <li key={name} className={index === step ? "font-medium text-foreground" : "text-muted"}>
            {index + 1}. {t(`dataImportStep_${name}`)}
          </li>
        ))}
      </ol>
      <h2 ref={titleRef} tabIndex={-1} className="text-section text-foreground outline-none">
        {stepTitle}
      </h2>
      {errorMessage ? <p className="text-sm text-destructive">{errorMessage}</p> : null}

      {step === 0 ? (
        <div className="space-y-3">
          <p className="text-sm text-muted">{t("dataImportTemplateHint")}</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => void downloadImportTemplate("xlsx", locale).catch(showFailure)}>
              <Download aria-hidden />
              {t("dataImportTemplateXlsx")}
            </Button>
            <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => void downloadImportTemplate("csv", locale).catch(showFailure)}>
              <Download aria-hidden />
              {t("dataImportTemplateCsv")}
            </Button>
          </div>
          <input
            ref={fileRef}
            id={fieldId}
            type="file"
            accept=".csv,.xlsx,.json,.zip,text/csv,application/json"
            className="sr-only"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
          <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => fileRef.current?.click()}>
            <Upload aria-hidden />
            {file ? file.name : t("dataImportChooseFile")}
          </Button>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="button" className="w-full sm:w-auto" disabled={!file || busy} onClick={() => void uploadFile()}>
              {t("dataImportUpload")}
            </Button>
          </div>
        </div>
      ) : null}

      {step === 1 && upload ? (
        <div className="space-y-4">
          {upload.warnings.map((warning) => (
            <p key={`${warning.code}-${warning.sheet}`} className="text-sm text-muted">
              {t("dataImportSheetSkipped", { sheet: warning.sheet || "" })}
            </p>
          ))}
          {upload.sheets.map((sheet) => (
            <div key={sheet.key} className="space-y-2">
              <h3 className="text-sm font-medium text-foreground">{t(`dataImportSheet_${sheet.key}`)}</h3>
              {sheet.saved ? <p className="text-sm text-muted">{t("dataImportSavedMapping", { name: sheet.saved.name })}</p> : null}
              {sheet.headers.map((header) => (
                <div key={header} className="grid gap-2 sm:grid-cols-2">
                  <p className="text-sm text-foreground">{header}</p>
                  <PopoverSelect
                    ariaLabel={header}
                    className="w-full"
                    value={mapping[sheet.key]?.[header] || "ignore"}
                    onValueChange={(value) =>
                      setMapping((current) => ({
                        ...current,
                        [sheet.key]: { ...current[sheet.key], [header]: value },
                      }))
                    }
                    options={[
                      { value: "ignore", label: t("dataImportIgnore") },
                      ...sheet.fields.map((field) => ({
                        value: field,
                        label: t(`dataImportField_${field}`),
                      })),
                    ]}
                  />
                </div>
              ))}
            </div>
          ))}
          {upload.sheets
            .filter((sheet) => HOUSEHOLD_SHEETS.includes(sheet.key))
            .map((sheet) => (
              <fieldset key={sheet.key} className="space-y-2">
                <legend className="text-sm font-medium text-foreground">{t(`dataImportSheet_${sheet.key}`)}</legend>
                <label className="flex min-h-[var(--control-height)] items-center gap-2 text-sm text-foreground">
                  <input
                    type="radio"
                    name={`import-mode-${sheet.key}`}
                    checked={(modes[sheet.key] ?? "add") === "add"}
                    onChange={() => setModes((current) => ({ ...current, [sheet.key]: "add" }))}
                  />
                  {t("dataImportAddUpdate")}
                </label>
                <label className="flex min-h-[var(--control-height)] items-center gap-2 text-sm text-foreground">
                  <input
                    type="radio"
                    name={`import-mode-${sheet.key}`}
                    checked={modes[sheet.key] === "replace"}
                    onChange={() => setModes((current) => ({ ...current, [sheet.key]: "replace" }))}
                  />
                  {t("dataImportReplace")}
                </label>
              </fieldset>
            ))}
          <div className="max-w-sm space-y-2">
            <Label htmlFor={`${fieldId}-mapping`}>{t("dataImportMappingName")}</Label>
            <Input id={`${fieldId}-mapping`} value={mappingName} onChange={(event) => setMappingName(event.target.value)} />
          </div>
          {upload.sheets[0] ? (
            <Button type="button" variant="outline" className="w-full sm:w-auto" disabled={!mappingName.trim() || busy} onClick={() => void remember(upload.sheets[0])}>
              {t("dataImportSaveMapping")}
            </Button>
          ) : null}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => go(0)}>
              {t("dataImportBack")}
            </Button>
            <Button type="button" className="w-full sm:w-auto" disabled={busy} onClick={() => void runCheck(false)}>
              {t("dataImportCheck")}
            </Button>
          </div>
        </div>
      ) : null}

      {step === 2 && report ? (
        <ReportList report={report} />
      ) : null}
      {step === 2 ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => go(1)}>
            {t("dataImportBack")}
          </Button>
          <Button type="button" className="w-full sm:w-auto" onClick={() => go(3)}>
            {t("dataImportContinue")}
          </Button>
        </div>
      ) : null}

      {step === 3 && report ? (
        <div className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => applyAll("update")}>
              {t("dataImportApplyUpdate")}
            </Button>
            <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => applyAll("skip")}>
              {t("dataImportApplySkip")}
            </Button>
          </div>
          {report.rows
            .filter((row) => isListedDuplicate(row))
            .length === 0 ? (
            <p className="text-sm text-muted">{t("dataImportNoDuplicates")}</p>
          ) : null}
          <ClubImportPreview
            rows={report.rows}
            duplicatesOnly
            actions={actions}
            onAction={(key, value) => setActions((current) => ({ ...current, [key]: value }))}
          />
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => go(2)}>
              {t("dataImportBack")}
            </Button>
            <Button type="button" className="w-full sm:w-auto" disabled={busy} onClick={() => void runCheck(true)}>
              {t("dataImportDryRun")}
            </Button>
          </div>
        </div>
      ) : null}

      {step === 4 && report ? (
        <div className="space-y-3">
          <p className="text-sm text-foreground">{t("dataImportNothingSaved")}</p>
          <ReportList report={report} />
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => go(3)}>
              {t("dataImportBack")}
            </Button>
            <Button type="button" className="w-full sm:w-auto" onClick={() => go(5)}>
              {t("dataImportContinue")}
            </Button>
          </div>
        </div>
      ) : null}

      {step === 5 && report ? (
        <CommitStep
          report={report}
          grades={Boolean(upload?.sheets.some((sheet) => sheet.key === "grades"))}
          busy={busy}
          batch={batch}
          undoText={undoText}
          onUndoText={setUndoText}
          onBack={() => go(4)}
          onDuplicates={() => go(3)}
          onImport={() => void startCommit()}
          onDownload={(fileFormat) => void downloadImportResult(batch?.id || 0, fileFormat).catch(showFailure)}
          onUndo={() => void runUndo()}
        />
      ) : null}
    </div>
  );
}

function CommitStep({
  report,
  grades,
  busy,
  batch,
  undoText,
  onUndoText,
  onBack,
  onDuplicates,
  onImport,
  onDownload,
  onUndo,
}: {
  report: ImportReport;
  grades: boolean;
  busy: boolean;
  batch: ImportBatch | null;
  undoText: string;
  onUndoText: (value: string) => void;
  onBack: () => void;
  onDuplicates: () => void;
  onImport: () => void;
  onDownload: (fileFormat: "csv" | "json") => void;
  onUndo: () => void;
}) {
  const t = useTranslations("ClubAdmin");
  const workable = report.counts.create + report.counts.update + (report.counts.remove ?? 0);
  const ready = report.counts.error === 0 && workable > 0;
  const running = batch != null && (batch.status === "queued" || batch.status === "running");
  return (
    <div className="space-y-3">
      {grades ? <p className="text-sm text-muted">{t("dataImportGradesNotice")}</p> : null}
      {running ? (
        <p className="text-sm text-muted" role="status">
          {t("dataImportProgress", { done: batch.rows_done, total: batch.rows_total })}
        </p>
      ) : null}
      {batch?.status === "succeeded" ? (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-foreground">{t("dataImportFinished")}</h3>
          <p className="text-sm text-foreground">
            {t("dataImportResultCounts", {
              created: batch.counts.created || 0,
              updated: batch.counts.updated || 0,
              skipped: batch.counts.skipped || 0,
              errors: batch.counts.errors || 0,
            })}
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => onDownload("csv")}>
              <Download aria-hidden />
              {t("dataImportDownloadCsv")}
            </Button>
            <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => onDownload("json")}>
              <Download aria-hidden />
              {t("dataImportDownloadJson")}
            </Button>
          </div>
          {batch.undo_open ? (
            <div className="space-y-2">
              <Label htmlFor="import-undo">{t("dataImportUndoHint", { id: batch.id })}</Label>
              <Input id="import-undo" value={undoText} onChange={(event) => onUndoText(event.target.value)} />
              <Button type="button" variant="outline" className="w-full sm:w-auto" disabled={busy} onClick={onUndo}>
                {t("dataImportUndo")}
              </Button>
            </div>
          ) : null}
          {batch.undone ? <p className="text-sm text-foreground">{t("dataImportUndone")}</p> : null}
        </div>
      ) : null}
      {batch == null ? (
        <div className="space-y-3">
          <p className="text-sm text-foreground">
            {t("dataImportDryRunCounts", {
              create: report.counts.create,
              update: report.counts.update,
              skip: report.counts.skip,
            })}
          </p>
          {!ready ? (
            <div className="space-y-2">
              <p className="text-sm text-destructive">
                {report.counts.error > 0 ? t("dataImportError_fix_errors") : t("dataImportNothingToImport")}
              </p>
              {report.counts.error === 0 ? (
                <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={onDuplicates}>
                  {t("dataImportBackToDuplicates")}
                </Button>
              ) : null}
            </div>
          ) : null}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={onBack}>
              {t("dataImportBack")}
            </Button>
            <Button type="button" className="w-full sm:w-auto" disabled={!ready || busy} onClick={onImport}>
              {t("dataImportCommit")}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ReportList({ report }: { report: ImportReport }) {
  return <ClubImportPreview rows={report.rows} />;
}
