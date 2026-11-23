"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import { ImportStatusBadge, type ImportBadgeTone } from "@/components/import/wizard-chrome";
import { PopoverSelect } from "@/components/ui/popover-select";
import { isListedDuplicate } from "@/lib/import-choices";
import type { ImportRow } from "@/lib/club-data-import";

type FilterId = "all" | "create" | "update" | "skip" | "error";

const HIDDEN_PREVIEW = new Set([
  "member_last_name",
  "member_first_name",
  "member_known",
  "last_name",
  "first_name",
]);

function outcome(row: ImportRow): FilterId {
  if (row.status === "error") {
    return "error";
  }
  if (row.action === "update") {
    return "update";
  }
  if (row.action === "create") {
    return "create";
  }
  return "skip";
}

function toneFor(kind: FilterId): ImportBadgeTone {
  if (kind === "create") {
    return "success";
  }
  if (kind === "update") {
    return "info";
  }
  if (kind === "error") {
    return "danger";
  }
  return "neutral";
}

export function memberLabel(
  row: ImportRow,
  unknown: string,
): string {
  if (row.preview.member_known === "yes") {
    return `${row.preview.member_last_name || ""} ${row.preview.member_first_name || ""}`.trim();
  }
  if (row.preview.member_known === "no") {
    return unknown;
  }
  return "";
}

export function ClubImportPreview({
  rows,
  duplicatesOnly = false,
  actions,
  onAction,
}: {
  rows: ImportRow[];
  duplicatesOnly?: boolean;
  actions?: Record<string, string>;
  onAction?: (key: string, value: string) => void;
}) {
  const t = useTranslations("ClubAdmin");
  const [filter, setFilter] = useState<FilterId>("all");
  const listed = duplicatesOnly ? rows.filter((row) => isListedDuplicate(row)) : rows;
  const counts = useMemo(() => {
    const summary = { all: listed.length, create: 0, update: 0, skip: 0, error: 0 };
    for (const row of listed) {
      summary[outcome(row)] += 1;
    }
    return summary;
  }, [listed]);
  const visible = filter === "all" ? listed : listed.filter((row) => outcome(row) === filter);
  const filters: Array<{ id: FilterId; label: string }> = [
    { id: "all", label: t("dataImportFilterAll") },
    { id: "create", label: t("dataImportStatusCreate") },
    { id: "update", label: t("dataImportStatusUpdate") },
    { id: "skip", label: t("dataImportStatusSkip") },
    { id: "error", label: t("dataImportStatusError") },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {filters.map((item) => {
          const active = filter === item.id;
          return (
            <button
              key={item.id}
              type="button"
              className={`inline-flex items-center rounded-[var(--radius-form)] border px-2.5 py-1 text-xs font-medium ${
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-foreground hover:bg-secondary"
              }`}
              onClick={() => setFilter(item.id)}
            >
              {item.label} ({counts[item.id]})
            </button>
          );
        })}
      </div>
      <div className="max-h-[520px] overflow-auto rounded-[var(--radius-form)] border border-border">
        <table className="w-full text-sm">
          <thead className="bg-secondary text-left text-xs uppercase text-muted">
            <tr>
              <th className="px-2 py-2 font-medium">{t("dataImportColumnRow")}</th>
              <th className="px-2 py-2 font-medium">{t("dataImportColumnStatus")}</th>
              <th className="px-2 py-2 font-medium">{t("dataImportColumnMember")}</th>
              <th className="px-2 py-2 font-medium">{t("dataImportColumnData")}</th>
              <th className="px-2 py-2 font-medium">{t("dataImportColumnIssues")}</th>
              <th className="px-2 py-2 font-medium">{t("dataImportAction")}</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => {
              const kind = outcome(row);
              const choice = actions?.[`${row.sheet}:${row.line}`] || row.action;
              const data = Object.entries(row.preview)
                .filter(([key, value]) => value && !HIDDEN_PREVIEW.has(key))
                .map(([key, value]) => `${key}: ${value}`)
                .join(", ");
              const actionLabel =
                row.action === "update"
                  ? t("dataImportUpdate")
                  : row.action === "skip"
                    ? t("dataImportSkip")
                    : row.action === "remove"
                      ? t("dataImportStatusRemove")
                      : t("dataImportCreate");
              return (
                <tr key={`${row.sheet}-${row.line}`} className="border-t border-border text-foreground">
                  <td className="px-2 py-2 align-top">{row.line}</td>
                  <td className="px-2 py-2 align-top">
                    <ImportStatusBadge
                      tone={toneFor(kind)}
                      label={
                        kind === "create"
                          ? t("dataImportStatusCreate")
                          : kind === "update"
                            ? t("dataImportStatusUpdate")
                            : kind === "error"
                              ? t("dataImportStatusError")
                              : t("dataImportStatusSkip")
                      }
                    />
                  </td>
                  <td className="px-2 py-2 align-top">
                    {memberLabel(row, t("dataImportUnknownMember"))}
                  </td>
                  <td className="px-2 py-2 align-top text-xs">{data}</td>
                  <td className={row.status === "error" ? "px-2 py-2 align-top text-xs text-destructive" : "px-2 py-2 align-top text-xs text-muted"}>
                    {row.codes.map((code) => t(`dataImportCode_${code}`, { date: row.stored_date || "" })).join(" ")}
                  </td>
                  <td className="px-2 py-2 align-top">
                    {duplicatesOnly && onAction && isListedDuplicate(row) ? (
                      <PopoverSelect
                        ariaLabel={t("dataImportAction")}
                        className="w-full"
                        value={choice}
                        onValueChange={(value) => onAction(`${row.sheet}:${row.line}`, value)}
                        options={[
                          { value: "update", label: t("dataImportUpdate") },
                          { value: "create", label: t("dataImportCreate") },
                          { value: "skip", label: t("dataImportSkip") },
                        ]}
                      />
                    ) : (
                      <span>{actionLabel}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
