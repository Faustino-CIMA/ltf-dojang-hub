"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import { SidePanel } from "@/components/ui/side-panel";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AuthApiError } from "@/lib/auth-errors";
import { SlotSelector, printJobSelectedSlots, normalizeSlotSelection, allSlotSelection } from "@/components/license-cards/slot-selector";
import {
  createPrintJob,
  downloadLicenseCardPdf,
  downloadPrintJobPdf,
  executePrintJob,
  getCardTemplates,
  getPaperProfiles,
  getPrinterProfiles,
  printFederationLicenseCards,
  type CardTemplate,
  type PaperProfile,
  type PrinterProfile,
  type PrintJob,
} from "@/lib/license-card-api";
import { downloadPdfFile, openPdfPreview } from "@/lib/print-job-pdf";

const SIGEL_PAPER_CODE = "sigel-lp798";

/** The sheet the print will use. Federation prefers Sigel LP798, matching the print command. */
export function paperProfileForCardPrint(
  scope: "club" | "federation",
  template: CardTemplate | undefined,
  paperProfiles: PaperProfile[],
): PaperProfile | null {
  const version = template?.latest_published_version;
  if (!version) {
    return null;
  }
  const templatePaper = version.paper_profile
    ? paperProfiles.find((profile) => profile.id === version.paper_profile) ?? null
    : null;
  if (scope === "federation") {
    const sigel = paperProfiles.find((profile) => profile.code === SIGEL_PAPER_CODE && profile.is_active);
    if (sigel && sigel.card_format === version.card_format) {
      return sigel;
    }
  }
  return templatePaper;
}

const NO_PRINTER = "__no_printer__";
const fieldClassName = "w-full min-w-0 overflow-hidden";

function PrintFormSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-busy="true" aria-live="polite">
      <div className="space-y-2">
        <div className="h-4 w-28 rounded bg-secondary" />
        <div className="h-[var(--control-height)] w-full rounded-[var(--radius-form)] bg-secondary" />
      </div>
      <div className="space-y-2">
        <div className="h-4 w-20 rounded bg-secondary" />
        <div className="h-[var(--control-height)] w-full rounded-[var(--radius-form)] bg-secondary" />
      </div>
    </div>
  );
}

export function publishedCardTemplates(templates: CardTemplate[]): CardTemplate[] {
  return templates.filter((template) => template.is_active && template.latest_published_version);
}

/** Default template, then a Standard/3C name, then the first published row. */
export function preferredPublishedTemplate(templates: CardTemplate[]): CardTemplate | undefined {
  const published = publishedCardTemplates(templates);
  return (
    published.find((template) => template.is_default) ??
    published.find((template) => /3c/i.test(template.name) || /standard/i.test(template.name)) ??
    published[0]
  );
}

type PrintLicenceCardsPanelProps = {
  open: boolean;
  onClose: () => void;
  locale: string;
  clubId: number | null;
  source: "members" | "licenses";
  memberIds?: number[];
  licenseIds?: number[];
  /** LTF licenses list. One sheet per club, including ids from other pages. */
  scope?: "club" | "federation";
  /** Row download uses the same slot selector, then saves the one-card PDF. */
  intent?: "print" | "download";
  title?: string;
  submitLabel?: string;
};

export function PrintLicenceCardsPanel({
  open,
  onClose,
  locale,
  clubId,
  source,
  memberIds = [],
  licenseIds = [],
  scope = "club",
  intent = "print",
  title,
  submitLabel,
}: PrintLicenceCardsPanelProps) {
  const t = useTranslations("ClubAdmin");
  const common = useTranslations("Common");
  const [templates, setTemplates] = useState<CardTemplate[]>([]);
  const [paperProfiles, setPaperProfiles] = useState<PaperProfile[]>([]);
  const [printers, setPrinters] = useState<PrinterProfile[]>([]);
  const [templateVersionId, setTemplateVersionId] = useState("");
  const [selectedSlots, setSelectedSlots] = useState<number[]>([]);
  const [printerValue, setPrinterValue] = useState(NO_PRINTER);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorTone, setErrorTone] = useState<"info" | "danger">("danger");
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [job, setJob] = useState<PrintJob | null>(null);

  const selectedCount = source === "licenses" ? licenseIds.length : memberIds.length;

  const printable = useMemo(() => publishedCardTemplates(templates), [templates]);
  const selectedTemplate = printable.find(
    (template) => String(template.latest_published_version?.id) === templateVersionId,
  );
  const paperProfile = paperProfileForCardPrint(scope, selectedTemplate, paperProfiles);
  const slotCount = paperProfile?.slot_count ?? 0;
  const slotColumns = paperProfile?.columns ?? 1;

  useEffect(() => {
    if (!open) {
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    setErrorMessage(null);
    setErrorTone("danger");
    setInfoMessage(null);
    setJob(null);
    setTemplateVersionId("");
    setPrinterValue(NO_PRINTER);
    setSelectedSlots([]);
    setPaperProfiles([]);
    Promise.all([getCardTemplates(), getPrinterProfiles(), getPaperProfiles()])
      .then(([templateRows, printerRows, paperRows]) => {
        if (cancelled) {
          return;
        }
        setTemplates(templateRows);
        setPrinters(printerRows);
        setPaperProfiles(paperRows);
        const preferred =
          scope === "federation"
            ? preferredPublishedTemplate(templateRows)
            : publishedCardTemplates(templateRows).find((template) => template.is_default) ??
              publishedCardTemplates(templateRows)[0];
        setTemplateVersionId(
          preferred?.latest_published_version ? String(preferred.latest_published_version.id) : ""
        );
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setErrorTone(error instanceof AuthApiError ? error.tone : "danger");
          setErrorMessage(error instanceof Error ? error.message : t("printLicenceCardsError"));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, scope, t]);

  useEffect(() => {
    if (slotCount <= 0) {
      setSelectedSlots([]);
      return;
    }
    setSelectedSlots((previous) => {
      const normalized = normalizeSlotSelection(previous, slotCount);
      if (normalized.length > 0) {
        return normalized;
      }
      return allSlotSelection(slotCount);
    });
  }, [slotCount]);

  const noteError = (error: unknown) => {
    setErrorTone(error instanceof AuthApiError ? error.tone : "danger");
    setErrorMessage(error instanceof Error ? error.message : t("printLicenceCardsError"));
  };

  const openJobPdfs = async (jobs: PrintJob[]) => {
    for (const [index, created] of jobs.entries()) {
      const file = await downloadPrintJobPdf(created.id);
      if (jobs.length === 1 && index === 0) {
        openPdfPreview(file.blob);
      } else {
        downloadPdfFile(file.blob, file.filename || "license-cards.pdf");
      }
    }
  };

  const submit = async () => {
    if (!templateVersionId || selectedCount === 0) {
      return;
    }
    if (scope !== "federation" && !clubId) {
      return;
    }
    const printerId = printerValue === NO_PRINTER ? null : Number(printerValue);
    const slots = printJobSelectedSlots(selectedSlots, slotCount);
    setIsSubmitting(true);
    setErrorMessage(null);
    setInfoMessage(null);
    try {
      if (intent === "download" && licenseIds.length === 1) {
        const file = await downloadLicenseCardPdf(licenseIds[0], {
          template_version: Number(templateVersionId),
          ...(printerId ? { printer_profile: printerId } : {}),
          ...(slots ? { selected_slots: slots } : {}),
        });
        downloadPdfFile(file.blob, file.filename || "license-card.pdf");
        onClose();
        return;
      }
      if (scope === "federation") {
        const result = await printFederationLicenseCards({
          license_ids: licenseIds,
          template_version: Number(templateVersionId),
          ...(printerId ? { printer_profile: printerId } : {}),
          ...(slots ? { selected_slots: slots } : {}),
        });
        const created = result.jobs[0] ?? null;
        setJob(created);
        if (result.skipped_license_ids.length > 0) {
          setInfoMessage(t("printLicenceCardsSkipped", { count: result.skipped_license_ids.length }));
        }
        if (result.jobs.length > 0) {
          try {
            await openJobPdfs(result.jobs);
          } catch (error) {
            noteError(error);
          }
        }
      } else {
        const created = await createPrintJob({
          club: clubId as number,
          template_version: Number(templateVersionId),
          ...(source === "licenses" ? { license_ids: licenseIds } : { member_ids: memberIds }),
          ...(printerId ? { printer_profile_id: printerId } : {}),
          ...(slots ? { selected_slots: slots } : {}),
          metadata: {
            quick_print: true,
            source,
            selected_count: selectedCount,
          },
        });
        await executePrintJob(created.id);
        setJob(created);
        try {
          const file = await downloadPrintJobPdf(created.id);
          openPdfPreview(file.blob);
        } catch (error) {
          noteError(error);
        }
      }
    } catch (error) {
      noteError(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SidePanel
      open={open}
      title={title || t("printLicenceCardsTitle")}
      description={t("printLicenceCardsDescription", { count: selectedCount })}
      closeLabel={common("modalClose")}
      onClose={onClose}
      footer={
        job ? null : (
          <Button
            type="button"
            onClick={() => void submit()}
            disabled={
              isSubmitting ||
              isLoading ||
              !templateVersionId ||
              selectedCount === 0 ||
              (scope !== "federation" && !clubId)
            }
          >
            {isSubmitting ? t("printLicenceCardsWorking") : submitLabel || t("printLicenceCardsSubmit")}
          </Button>
        )
      }
    >
      {infoMessage ? <p className="mb-3 text-sm text-muted">{infoMessage}</p> : null}
      {errorMessage ? (
        <p className={errorTone === "info" ? "mb-3 text-sm text-muted" : "mb-3 text-sm text-destructive"}>
          {errorMessage}
        </p>
      ) : null}
      {isLoading ? (
        <PrintFormSkeleton />
      ) : job ? (
        <div className="space-y-3">
          <p className="text-sm text-foreground">
            {t("printLicenceCardsSuccess", { jobNumber: job.job_number })}
          </p>
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                void downloadPrintJobPdf(job.id)
                  .then((file) => openPdfPreview(file.blob))
                  .catch((error: unknown) => noteError(error));
              }}
            >
              {t("printLicenceCardsOpenPdf")}
            </Button>
            <Link
              href={
                scope === "federation"
                  ? `/${locale}/dashboard/ltf/license-cards/print-jobs`
                  : `/${locale}/dashboard/club/print-jobs`
              }
              className="inline-flex h-[var(--control-height)] items-center text-sm font-medium text-link underline-offset-4 hover:underline"
            >
              {t("printLicenceCardsOpenList")}
            </Link>
          </div>
        </div>
      ) : printable.length === 0 && !isLoading ? (
        <p className="text-sm text-muted">{t("printLicenceCardsNoTemplate")}</p>
      ) : (
        <div className="min-w-0 space-y-4">
          <div className="min-w-0 space-y-2">
            <Label htmlFor="print-card-template" required>
              {t("printLicenceCardsTemplateLabel")}
            </Label>
            <Select modal={false} value={templateVersionId} onValueChange={setTemplateVersionId}>
              <SelectTrigger id="print-card-template" className={fieldClassName}>
                <SelectValue placeholder={t("printLicenceCardsTemplatePlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {printable.map((template) => {
                  const version = template.latest_published_version;
                  const optionLabel =
                    scope === "federation" && version
                      ? t("printLicenceCardsTemplateOption", {
                          name: template.name,
                          version: version.version_number,
                        })
                      : `${template.name}${version?.label ? ` · ${version.label}` : ""}`;
                  return (
                    <SelectItem key={template.id} value={String(version?.id)}>
                      {optionLabel}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-0 space-y-2">
            <Label htmlFor="print-card-printer">{t("printLicenceCardsPrinterLabel")}</Label>
            <Select modal={false} value={printerValue} onValueChange={setPrinterValue}>
              <SelectTrigger id="print-card-printer" className={fieldClassName}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_PRINTER}>{t("printLicenceCardsPrinterNone")}</SelectItem>
                {printers.map((printer) => (
                  <SelectItem key={printer.id} value={String(printer.id)}>
                    {printer.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <SlotSelector
            slotCount={slotCount}
            columns={slotColumns}
            selectedSlots={selectedSlots}
            onChange={setSelectedSlots}
          />
        </div>
      )}
    </SidePanel>
  );
}
