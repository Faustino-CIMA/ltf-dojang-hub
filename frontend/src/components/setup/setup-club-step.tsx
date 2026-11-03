"use client";

import { useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { ExplainedCount, ImportStatusBadge, StatusLegend, StepIntro } from "@/components/import/wizard-chrome";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PopoverSelect } from "@/components/ui/popover-select";
import { LBR_SEARCH_URL } from "@/lib/rcs-number";
import type { SetupClubPreview, SetupClubRow } from "@/lib/setup-api";

export function SetupClubStep({
  busy,
  fileName,
  preview,
  rows,
  canConfirm,
  onFile,
  onChange,
  onConfirm,
}: {
  busy: boolean;
  fileName: string | null;
  preview: SetupClubPreview | null;
  rows: SetupClubRow[];
  canConfirm: boolean;
  onFile: (file: File) => void;
  onChange: (rowIndex: number, patch: Partial<SetupClubRow>) => void;
  onConfirm: () => void;
}) {
  const t = useTranslations("Setup");
  const shared = useTranslations("Import");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const sorted = useMemo(
    () => [...rows].sort((left, right) => left.name.localeCompare(right.name) * (sortDir === "asc" ? 1 : -1)),
    [rows, sortDir],
  );
  const created = rows.filter((row) => row.disposition === "create").length;
  const updated = rows.filter((row) => row.disposition === "update").length;
  const rcsProblems = rows.filter((row) => row.rcs_error).length;

  return (
    <section className="space-y-3 rounded-[var(--radius-card)] border border-border bg-card p-4" data-setup-panel="clubs">
      <StepIntro title={t("step_clubs")}>
        <p>{t("clubsIntro")}</p>
        <p>{t("clubsNotImported")}</p>
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
            const file = event.target.files?.[0];
            if (file) onFile(file);
          }}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" disabled={busy} onClick={() => fileInputRef.current?.click()}>
            {fileName ? shared("changeFileButton") : shared("chooseFileButton")}
          </Button>
          <span className="text-sm text-muted">{fileName ?? shared("noFileSelected")}</span>
        </div>
      </div>
      {preview ? (
        <div className="grid gap-3 md:grid-cols-2">
          <ExplainedCount label={t("clubsWillCreate", { count: created })} hint={t("clubsWillCreateHint")} hintLabel={t("hintLabel")} tone="success" />
          <ExplainedCount label={t("clubsWillUpdate", { count: updated })} hint={t("clubsWillUpdateHint")} hintLabel={t("hintLabel")} tone="info" />
          <ExplainedCount
            label={t("clubsLtfIgnored", { count: preview.ltf_rows_ignored })}
            hint={t("clubsLtfIgnoredHint")}
            hintLabel={t("hintLabel")}
          />
          <ExplainedCount
            label={t("clubsBlankIgnored", { count: preview.blank_rows_ignored })}
            hint={t("clubsBlankIgnoredHint")}
            hintLabel={t("hintLabel")}
          />
          {rcsProblems > 0 ? (
            <ExplainedCount
              label={t("clubsRcsBlocking", { count: rcsProblems })}
              hint={t("clubsRcsBlockingHint")}
              hintLabel={t("hintLabel")}
              tone="danger"
            />
          ) : null}
        </div>
      ) : null}
      {rcsProblems > 0 ? <p className="banner-danger rounded-[var(--radius-form)] border px-3 py-2 text-sm">{t("clubsRcsBlockingHint")}</p> : null}
      {rows.length > 0 ? (
        <>
          <StatusLegend
            title={t("clubsLegendTitle")}
            items={[
              { label: t("disposition_create"), hint: t("disposition_createHint"), tone: "success" },
              { label: t("disposition_update"), hint: t("disposition_updateHint"), tone: "info" },
              { label: t("disposition_skip"), hint: t("disposition_skipHint"), tone: "neutral" },
            ]}
          />
          <div className="max-h-[520px] overflow-auto rounded-[var(--radius-form)] border border-border">
            <table className="w-full text-sm">
              <thead className="bg-secondary text-left text-xs uppercase text-muted">
                <tr>
                  <th className="px-2 py-2 font-medium">
                    <button type="button" onClick={() => setSortDir((current) => (current === "asc" ? "desc" : "asc"))}>
                      {t("clubName")}
                    </button>
                  </th>
                  <th className="px-2 py-2 font-medium">{t("federation")}</th>
                  <th className="px-2 py-2 font-medium">{t("rcs")}</th>
                  <th className="px-2 py-2 font-medium">{t("headOffice")}</th>
                  <th className="px-2 py-2 font-medium">{t("disposition")}</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((row) => (
                  <tr key={row.row_index} className="border-t border-border align-top text-foreground">
                    <td className="px-2 py-2">{row.name}</td>
                    <td className="px-2 py-2">
                      <PopoverSelect
                        value={row.federation}
                        ariaLabel={t("federation")}
                        onValueChange={(value) => onChange(row.row_index, { federation: value === "ITF" ? "ITF" : "WT" })}
                        options={[
                          { value: "WT", label: "WT" },
                          { value: "ITF", label: "ITF" },
                        ]}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <Input
                        aria-label={t("rcs")}
                        value={row.rcs_number}
                        onChange={(event) => onChange(row.row_index, { rcs_number: event.target.value })}
                      />
                      <a className="text-primary underline" href={LBR_SEARCH_URL} target="_blank" rel="noreferrer">
                        {t("openLbr")}
                      </a>
                      {row.rcs_error === "duplicate_rcs" ? <p className="text-destructive">{t("rcsDuplicate")}</p> : null}
                      {row.rcs_error && row.rcs_error !== "duplicate_rcs" ? <p className="text-destructive">{t("rcsInvalid")}</p> : null}
                    </td>
                    <td className="px-2 py-2">{[row.address_line1, row.postal_code, row.locality].filter(Boolean).join(", ") || "—"}</td>
                    <td className="px-2 py-2">
                      <ImportStatusBadge
                        tone={row.disposition === "create" ? "success" : row.disposition === "update" ? "info" : "neutral"}
                        label={t(`disposition_${row.disposition}`)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
      <Button type="button" variant="primary" disabled={!canConfirm || busy} onClick={onConfirm}>
        {t("confirmClubs")}
      </Button>
    </section>
  );
}
