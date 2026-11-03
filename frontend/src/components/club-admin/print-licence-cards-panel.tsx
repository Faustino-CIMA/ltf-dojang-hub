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
import {
  createPrintJob,
  downloadPrintJobPdf,
  executePrintJob,
  getCardTemplates,
  getPrinterProfiles,
  type CardTemplate,
  type PrinterProfile,
  type PrintJob,
} from "@/lib/license-card-api";
import { openPdfPreview } from "@/lib/print-job-pdf";

const NO_PRINTER = "__no_printer__";

type PrintLicenceCardsPanelProps = {
  open: boolean;
  onClose: () => void;
  locale: string;
  clubId: number | null;
  source: "members" | "licenses";
  memberIds?: number[];
  licenseIds?: number[];
};

export function PrintLicenceCardsPanel({
  open,
  onClose,
  locale,
  clubId,
  source,
  memberIds = [],
  licenseIds = [],
}: PrintLicenceCardsPanelProps) {
  const t = useTranslations("ClubAdmin");
  const common = useTranslations("Common");
  const [templates, setTemplates] = useState<CardTemplate[]>([]);
  const [printers, setPrinters] = useState<PrinterProfile[]>([]);
  const [templateVersionId, setTemplateVersionId] = useState("");
  const [printerValue, setPrinterValue] = useState(NO_PRINTER);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [job, setJob] = useState<PrintJob | null>(null);

  const selectedCount = source === "licenses" ? licenseIds.length : memberIds.length;

  const printable = useMemo(
    () =>
      templates.filter((template) => template.is_active && template.latest_published_version),
    [templates]
  );

  useEffect(() => {
    if (!open) {
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    setErrorMessage(null);
    setJob(null);
    setTemplateVersionId("");
    setPrinterValue(NO_PRINTER);
    Promise.all([getCardTemplates(), getPrinterProfiles()])
      .then(([templateRows, printerRows]) => {
        if (cancelled) {
          return;
        }
        setTemplates(templateRows);
        setPrinters(printerRows);
        const published = templateRows.filter(
          (template) => template.is_active && template.latest_published_version
        );
        const preferred = published.find((template) => template.is_default) ?? published[0];
        setTemplateVersionId(
          preferred?.latest_published_version ? String(preferred.latest_published_version.id) : ""
        );
      })
      .catch((error: unknown) => {
        if (!cancelled) {
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
  }, [open, t]);

  const submit = async () => {
    if (!clubId || !templateVersionId || selectedCount === 0) {
      return;
    }
    const printerId = printerValue === NO_PRINTER ? null : Number(printerValue);
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const created = await createPrintJob({
        club: clubId,
        template_version: Number(templateVersionId),
        ...(source === "licenses" ? { license_ids: licenseIds } : { member_ids: memberIds }),
        ...(printerId ? { printer_profile_id: printerId } : {}),
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
        setErrorMessage(error instanceof Error ? error.message : t("printLicenceCardsError"));
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("printLicenceCardsError"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SidePanel
      open={open}
      title={t("printLicenceCardsTitle")}
      description={t("printLicenceCardsDescription", { count: selectedCount })}
      closeLabel={common("modalClose")}
      onClose={onClose}
      footer={
        job ? (
          <Button type="button" variant="outline" onClick={onClose}>
            {common("modalClose")}
          </Button>
        ) : (
          <>
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              {common("deleteCancelButton")}
            </Button>
            <Button
              type="button"
              onClick={() => void submit()}
              disabled={isSubmitting || isLoading || !templateVersionId || !clubId || selectedCount === 0}
            >
              {isSubmitting ? t("printLicenceCardsWorking") : t("printLicenceCardsSubmit")}
            </Button>
          </>
        )
      }
    >
      {errorMessage ? <p className="mb-3 text-sm text-destructive">{errorMessage}</p> : null}
      {isLoading ? (
        <p className="text-sm text-muted">{common("loadingLabel")}</p>
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
                  .catch((error: unknown) =>
                    setErrorMessage(error instanceof Error ? error.message : t("printLicenceCardsError"))
                  );
              }}
            >
              {t("printLicenceCardsOpenPdf")}
            </Button>
            <Link
              href={`/${locale}/dashboard/club/print-jobs`}
              className="inline-flex h-[var(--control-height)] items-center text-sm font-medium text-link underline-offset-4 hover:underline"
            >
              {t("printLicenceCardsOpenList")}
            </Link>
          </div>
        </div>
      ) : printable.length === 0 && !isLoading ? (
        <p className="text-sm text-muted">{t("printLicenceCardsNoTemplate")}</p>
      ) : (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="print-card-template" required>
              {t("printLicenceCardsTemplateLabel")}
            </Label>
            <Select value={templateVersionId} onValueChange={setTemplateVersionId}>
              <SelectTrigger id="print-card-template" className="w-full">
                <SelectValue placeholder={t("printLicenceCardsTemplatePlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {printable.map((template) => (
                  <SelectItem
                    key={template.id}
                    value={String(template.latest_published_version?.id)}
                  >
                    {template.name}
                    {template.latest_published_version?.label
                      ? ` · ${template.latest_published_version.label}`
                      : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="print-card-printer">{t("printLicenceCardsPrinterLabel")}</Label>
            <Select value={printerValue} onValueChange={setPrinterValue}>
              <SelectTrigger id="print-card-printer" className="w-full">
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
        </div>
      )}
    </SidePanel>
  );
}
