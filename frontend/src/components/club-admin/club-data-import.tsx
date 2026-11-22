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
  downloadImportTemplate,
  saveImportMapping,
  uploadImportFile,
  type ImportReport,
  type ImportSheet,
  type ImportUpload,
} from "@/lib/club-data-import";

const STEPS = ["file", "map", "check", "duplicates", "dryRun", "commit"] as const;

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
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
    } catch {
      setErrorMessage(t("dataImportFailed"));
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
    } catch {
      setErrorMessage(t("dataImportFailed"));
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
      const result = await checkImport(upload.id, mapping, actions, dryRun);
      setReport(result);
      go(dryRun ? 4 : 2);
    } catch {
      setErrorMessage(t("dataImportFailed"));
    } finally {
      setBusy(false);
    }
  }

  function applyAll(action: "create" | "update" | "skip") {
    if (!report) {
      return;
    }
    const next = { ...actions };
    for (const row of report.rows) {
      if (row.codes.includes("possible_duplicate") || row.action === "update" || row.action === "create") {
        next[`${row.sheet}:${row.line}`] = action;
      }
    }
    setActions(next);
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
            <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => void downloadImportTemplate("xlsx", locale)}>
              <Download aria-hidden />
              {t("dataImportTemplateXlsx")}
            </Button>
            <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => void downloadImportTemplate("csv", locale)}>
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
            .filter((row) => row.codes.includes("possible_duplicate") || row.action === "update")
            .map((row) => (
              <div key={`${row.sheet}-${row.line}`} className="space-y-2 rounded-[var(--radius-card)] border border-border p-3">
                <p className="text-sm text-foreground">
                  {row.preview.last_name} {row.preview.first_name}
                </p>
                <PopoverSelect
                  ariaLabel={t("dataImportAction")}
                  className="w-full"
                  value={actions[`${row.sheet}:${row.line}`] || row.action}
                  onValueChange={(value) => setActions((current) => ({ ...current, [`${row.sheet}:${row.line}`]: value }))}
                  options={[
                    { value: "update", label: t("dataImportUpdate") },
                    { value: "create", label: t("dataImportCreate") },
                    { value: "skip", label: t("dataImportSkip") },
                  ]}
                />
              </div>
            ))}
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

      {step === 5 ? (
        <div className="space-y-3">
          <p className="text-sm text-muted">{t("dataImportCommitLater")}</p>
          <Button type="button" className="w-full sm:w-auto" disabled>
            {t("dataImportCommit")}
          </Button>
          <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => go(4)}>
            {t("dataImportBack")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function ReportList({ report }: { report: ImportReport }) {
  const t = useTranslations("ClubAdmin");
  return (
    <div className="space-y-3">
      <p className="text-sm text-foreground">
        {t("dataImportCounts", {
          ready: report.counts.ok,
          warnings: report.counts.warning,
          errors: report.counts.error,
        })}
      </p>
      {report.rows.map((row) => (
        <article key={`${row.sheet}-${row.line}`} className="space-y-1 rounded-[var(--radius-card)] border border-border p-3">
          <p className="text-sm font-medium text-foreground">
            {row.preview.last_name || row.preview.member_ref || row.sheet} {row.preview.first_name || ""}
          </p>
          <p className={row.status === "error" ? "text-sm text-destructive" : "text-sm text-muted"}>
            {row.codes.length
              ? row.codes.map((code) => t(`dataImportCode_${code}`, { date: row.stored_date || "" })).join(" ")
              : t(`dataImportStatus_${row.status}`)}
          </p>
          {row.preview.social_security_number ? (
            <p className="text-sm text-muted">{row.preview.social_security_number}</p>
          ) : null}
        </article>
      ))}
    </div>
  );
}
