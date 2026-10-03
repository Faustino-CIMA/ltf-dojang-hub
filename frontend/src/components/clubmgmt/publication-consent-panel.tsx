"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { EmptyState } from "@/components/club-admin/empty-state";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ActionNotices } from "@/components/ui/list-page-chrome";
import {
  downloadPublicationConsent,
  listPublicationConsent,
  setPublicationColumn,
  setPublicationConsent,
  type PublicationConsentRow,
  type PublicationField,
  type PublicationPdfRule,
} from "@/lib/clubmgmt-api";
import { formatDisplayDate } from "@/lib/date-display";

const CHANNELS: Array<{ field: PublicationField; labelKey?: "webpage" | "printMedia"; label?: string }> = [
  { field: "publish_facebook", label: "Facebook" },
  { field: "publish_instagram", label: "Instagram" },
  { field: "publish_x", label: "X" },
  { field: "publish_tiktok", label: "TikTok" },
  { field: "publish_webpage", labelKey: "webpage" },
  { field: "publish_print", labelKey: "printMedia" },
];

const PDF_RULES: PublicationPdfRule[] = ["all", "allowed", "denied", "denied_any"];

const selectClass =
  "block h-[var(--control-height)] w-full max-w-sm rounded-[var(--radius-form)] border border-[var(--border)] bg-[var(--field-background)] px-3 text-sm";

function columnChecked(rows: PublicationConsentRow[], field: PublicationField): boolean | "indeterminate" {
  const ticked = rows.filter((row) => row[field]).length;
  if (ticked === 0) return false;
  if (ticked === rows.length) return true;
  return "indeterminate";
}

function pdfMemberCount(rows: PublicationConsentRow[], rule: PublicationPdfRule, channels: PublicationField[]) {
  if (rule === "all") return rows.length;
  if (channels.length === 0) return 0;
  return rows.filter((row) => {
    if (rule === "allowed") return channels.every((field) => row[field]);
    if (rule === "denied") return channels.every((field) => !row[field]);
    return channels.some((field) => !row[field]);
  }).length;
}

export function PublicationConsentPanel({ clubId }: { clubId: number }) {
  const t = useTranslations("ClubMgmt");
  const [rows, setRows] = useState<PublicationConsentRow[] | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [exporting, setExporting] = useState<"csv" | "xlsx" | "pdf" | null>(null);
  const [columnSaving, setColumnSaving] = useState<PublicationField | null>(null);
  const [pdfRule, setPdfRule] = useState<PublicationPdfRule>("all");
  const [pdfChannels, setPdfChannels] = useState<PublicationField[]>([]);

  const load = useCallback(async () => {
    try {
      const response = await listPublicationConsent(clubId);
      setRows(response.members);
      setErrorMessage(null);
    } catch (error) {
      setRows([]);
      setErrorMessage(error instanceof Error ? error.message : t("loadError"));
    }
  }, [clubId, t]);

  useEffect(() => {
    setRows(null);
    void load();
  }, [load]);

  const channelLabel = (channel: (typeof CHANNELS)[number]) => (channel.labelKey ? t(channel.labelKey) : channel.label || "");

  const toggle = async (row: PublicationConsentRow, field: PublicationField, value: boolean) => {
    setRows((current) => current?.map((item) => (item.member === row.member ? { ...item, [field]: value } : item)) ?? current);
    setErrorMessage(null);
    try {
      const saved = await setPublicationConsent(clubId, row.member, { [field]: value });
      setRows((current) => current?.map((item) => (item.member === row.member ? saved : item)) ?? current);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("saveError"));
      await load();
    }
  };

  const setColumn = async (field: PublicationField, value: boolean) => {
    setColumnSaving(field);
    setErrorMessage(null);
    setRows((current) => current?.map((item) => ({ ...item, [field]: value })) ?? current);
    try {
      const saved = await setPublicationColumn(clubId, field, value);
      setRows(saved.members);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("saveError"));
      await load();
    } finally {
      setColumnSaving(null);
    }
  };

  const togglePdfChannel = (field: PublicationField, on: boolean) => {
    setPdfChannels((current) => {
      const next = new Set(on ? [...current, field] : current.filter((item) => item !== field));
      return CHANNELS.map((channel) => channel.field).filter((item) => next.has(item));
    });
  };

  const pdfRuleLabel = (rule: PublicationPdfRule) => {
    if (rule === "allowed") return t("publicationPdfAllowed");
    if (rule === "denied") return t("publicationPdfDenied");
    if (rule === "denied_any") return t("publicationPdfDeniedAny");
    return t("publicationPdfAll");
  };

  const download = async (format: "csv" | "xlsx" | "pdf") => {
    if (format === "pdf" && pdfRule !== "all" && pdfChannels.length === 0) {
      setErrorMessage(t("publicationPdfChooseChannel"));
      return;
    }
    setExporting(format);
    setErrorMessage(null);
    try {
      await downloadPublicationConsent(
        clubId,
        format,
        format === "pdf" ? { rule: pdfRule, channels: pdfRule === "all" ? [] : pdfChannels } : undefined,
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("publicationExportError"));
    } finally {
      setExporting(null);
    }
  };

  const pdfNeedsChannel = pdfRule !== "all" && pdfChannels.length === 0;
  const pdfCount = rows == null ? null : pdfMemberCount(rows, pdfRule, pdfChannels);

  return (
    <section className="rounded-[var(--radius-card)] border border-border bg-card p-6 shadow-sm">
      <ActionNotices error={errorMessage} onDismiss={() => setErrorMessage(null)} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{t("mediaConsent")}</h2>
          <p className="mt-2 text-sm text-muted">{t("publicationConsentSubtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted">{t("publicationExport")}</span>
          <Button type="button" variant="outline" size="sm" disabled={exporting != null} onClick={() => void download("csv")}>
            CSV
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={exporting != null} onClick={() => void download("xlsx")}>
            Excel
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={exporting != null || pdfNeedsChannel} onClick={() => void download("pdf")}>
            PDF
          </Button>
        </div>
      </div>
      <div className="mt-4 flex max-w-3xl flex-col gap-3">
        <div className="flex max-w-sm flex-col gap-2">
          <Label htmlFor="publication-pdf-members">{t("publicationPdfList")}</Label>
          <select
            id="publication-pdf-members"
            className={selectClass}
            value={pdfRule}
            onChange={(event) => setPdfRule(event.target.value as PublicationPdfRule)}
          >
            {PDF_RULES.map((rule) => (
              <option key={rule} value={rule}>
                {pdfRuleLabel(rule)}
              </option>
            ))}
          </select>
        </div>
        {pdfRule !== "all" ? (
          <div>
            <p className="text-sm font-medium text-foreground">{t("publicationPdfChannels")}</p>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
              {CHANNELS.map((channel) => (
                <label key={channel.field} className="flex items-center gap-2 text-sm text-foreground">
                  <Checkbox
                    checked={pdfChannels.includes(channel.field)}
                    aria-label={channelLabel(channel)}
                    onCheckedChange={(value) => togglePdfChannel(channel.field, value === true)}
                  />
                  {channelLabel(channel)}
                </label>
              ))}
            </div>
            <p className="mt-2 text-sm text-muted">{t("publicationPdfHint")}</p>
          </div>
        ) : null}
        {pdfCount != null ? (
          <p className="text-sm text-muted">
            {pdfNeedsChannel ? t("publicationPdfChooseChannel") : t("publicationPdfCount", { count: pdfCount })}
          </p>
        ) : null}
      </div>
      {rows == null ? (
        <div className="mt-4">
          <EmptyState title={t("loadingTitle")} description={t("loadingSubtitle")} loading />
        </div>
      ) : rows.length === 0 ? (
        <div className="mt-4">
          <EmptyState title={t("publicationEmptyTitle")} description={t("publicationEmptySubtitle")} />
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-[var(--radius-card)] border border-border">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-secondary/70 text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-3 py-2" rowSpan={2}>{t("lastName")}</th>
                <th className="px-3 py-2" rowSpan={2}>{t("firstName")}</th>
                <th className="px-3 py-2" rowSpan={2}>{t("publicationDob")}</th>
                <th className="px-3 py-2" rowSpan={2}>{t("publicationAge")}</th>
                <th className="px-3 py-2 text-center" colSpan={CHANNELS.length}>{t("mediaConsent")}</th>
              </tr>
              <tr>
                {CHANNELS.map((channel) => (
                  <th key={channel.field} className="px-3 py-2 text-center normal-case tracking-normal">
                    <div className="flex flex-col items-center gap-1">
                      <Checkbox
                        checked={columnChecked(rows, channel.field)}
                        disabled={columnSaving != null}
                        aria-label={`${t("publicationColumnAll")} ${channelLabel(channel)}`}
                        onCheckedChange={(value) => void setColumn(channel.field, value === true)}
                      />
                      <span>{channelLabel(channel)}</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.member} className="border-t border-border">
                  <td className="px-3 py-3 font-medium">{row.last_name}</td>
                  <td className="px-3 py-3">{row.first_name}</td>
                  <td className="px-3 py-3">{row.date_of_birth ? formatDisplayDate(row.date_of_birth) : "—"}</td>
                  <td className="px-3 py-3">{row.age == null ? "—" : row.age}</td>
                  {CHANNELS.map((channel) => (
                    <td key={channel.field} className="px-3 py-3 text-center">
                      <Checkbox
                        checked={row[channel.field]}
                        disabled={columnSaving != null}
                        aria-label={`${row.first_name} ${row.last_name} ${channelLabel(channel)}`}
                        onCheckedChange={(value) => void toggle(row, channel.field, value === true)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
