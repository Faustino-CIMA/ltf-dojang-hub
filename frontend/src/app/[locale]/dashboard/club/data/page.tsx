"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Award, Contact, Download, House, IdCard, Mail, Upload, Users } from "lucide-react";

import { ClubAdminLayout } from "@/components/club-admin/club-admin-layout";
import { ClubDataImport } from "@/components/club-admin/club-data-import";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ActionNotices } from "@/components/ui/list-page-chrome";
import { PopoverSelect } from "@/components/ui/popover-select";
import { UnderlineTabs } from "@/components/ui/underline-tabs";
import {
  downloadClubData,
  downloadClubDataFile,
  fetchClubDataSummary,
  readClubDataJob,
  type ClubDataSheet,
  type ClubDataSummary,
} from "@/lib/club-data-export";

export default function ClubDataPage() {
  const t = useTranslations("ClubAdmin");
  const pathname = usePathname();
  const locale = pathname?.split("/")[1] || "en";
  const [summary, setSummary] = useState<ClubDataSummary | null>(null);
  const [members, setMembers] = useState(true);
  const [licences, setLicences] = useState(true);
  const [grades, setGrades] = useState(true);
  const [emails, setEmails] = useState(true);
  const [contacts, setContacts] = useState(true);
  const [families, setFamilies] = useState(true);
  const [format, setFormat] = useState<"csv" | "xlsx" | "json" | "pdf">("xlsx");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [tab, setTab] = useState<"export" | "import">("export");

  useEffect(() => {
    let cancelled = false;
    fetchClubDataSummary()
      .then((row) => {
        if (!cancelled) setSummary(row);
      })
      .catch(() => {
        if (!cancelled) setErrorMessage(t("dataNeedClub"));
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  const managed = Boolean(summary?.club_management);
  const sheets: ClubDataSheet[] = [
    ...(members ? (["members"] as const) : []),
    ...(licences ? (["licences"] as const) : []),
    ...(grades ? (["grades"] as const) : []),
    ...(managed && emails ? (["emails"] as const) : []),
    ...(managed && contacts ? (["contacts"] as const) : []),
    ...(managed && families ? (["families"] as const) : []),
  ];
  const rowCount =
    (members ? summary?.member_count ?? 0 : 0) +
    (licences ? summary?.license_count ?? 0 : 0) +
    (grades ? summary?.grade_count ?? 0 : 0) +
    (managed && emails ? (summary?.email_count ?? 0) + (summary?.phone_count ?? 0) + (summary?.address_count ?? 0) : 0) +
    (managed && contacts ? (summary?.contact_count ?? 0) + (summary?.person_count ?? 0) : 0) +
    (managed && families
      ? (summary?.family_count ?? 0) + (summary?.family_member_count ?? 0) + (summary?.rebate_count ?? 0)
      : 0);
  const prepare = format === "pdf" || (summary != null && rowCount > summary.prepare_above);
  const selected = sheets.length;

  async function download() {
    if (!sheets.length || busy) {
      return;
    }
    setBusy(true);
    setProgress(prepare ? 0 : null);
    setErrorMessage(null);
    try {
      const started = await downloadClubData({ sheets, format, locale });
      if (started.jobId == null) {
        return;
      }
      const startedAt = Date.now();
      while (Date.now() - startedAt < 120_000) {
        const job = await readClubDataJob(started.jobId);
        setProgress(job.progress);
        if (job.status === "succeeded") {
          await downloadClubDataFile(started.jobId);
          return;
        }
        if (job.status === "failed") {
          throw new Error(job.error_detail || "failed");
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      throw new Error("timeout");
    } catch {
      setErrorMessage(t("dataNeedClub"));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <ClubAdminLayout title={t("dataTitle")}>
      <div className="space-y-4">
        <p className="text-sm text-muted">
          {summary ? t("dataClubLine", { club: summary.club_name }) : t("dataNeedClub")}
        </p>
        <UnderlineTabs
          value={tab}
          onChange={(value) => setTab(value as "export" | "import")}
          ariaLabel={t("dataTitle")}
          idPrefix="club-data"
          options={[
            { value: "export", label: t("dataExportTab"), icon: Download },
            { value: "import", label: t("dataImportTab"), icon: Upload },
          ]}
        />
        {tab === "import" ? <ClubDataImport locale={locale} /> : null}
        {tab === "export" ? (
        <>
        <ActionNotices error={errorMessage} onDismiss={() => setErrorMessage(null)} />
        <fieldset className="space-y-3">
          <legend className="sr-only">{t("dataExportTab")}</legend>
          <label className="flex min-h-[var(--control-height)] items-center gap-2 text-sm text-foreground">
            <Checkbox checked={members} onCheckedChange={(checked) => setMembers(Boolean(checked))} />
            <Users className="size-4 text-muted" aria-hidden />
            <span>{t("dataMembers")}</span>
          </label>
          <label className="flex min-h-[var(--control-height)] items-center gap-2 text-sm text-foreground">
            <Checkbox checked={licences} onCheckedChange={(checked) => setLicences(Boolean(checked))} />
            <IdCard className="size-4 text-muted" aria-hidden />
            <span>{t("dataLicenses")}</span>
          </label>
          <label className="flex min-h-[var(--control-height)] items-center gap-2 text-sm text-foreground">
            <Checkbox checked={grades} onCheckedChange={(checked) => setGrades(Boolean(checked))} />
            <Award className="size-4 text-muted" aria-hidden />
            <span>{t("dataGrades")}</span>
          </label>
        </fieldset>
        {managed ? (
          <fieldset className="space-y-3">
            <legend className="text-sm font-medium text-foreground">{t("dataHouseholdGroup")}</legend>
            <p className="text-sm text-muted">{t("dataHouseholdHint")}</p>
            <label className="flex min-h-[var(--control-height)] items-center gap-2 text-sm text-foreground">
              <Checkbox checked={emails} onCheckedChange={(checked) => setEmails(Boolean(checked))} />
              <Mail className="size-4 text-muted" aria-hidden />
              <span>{t("dataEmails")}</span>
            </label>
            <label className="flex min-h-[var(--control-height)] items-center gap-2 text-sm text-foreground">
              <Checkbox checked={contacts} onCheckedChange={(checked) => setContacts(Boolean(checked))} />
              <Contact className="size-4 text-muted" aria-hidden />
              <span>{t("dataContacts")}</span>
            </label>
            <label className="flex min-h-[var(--control-height)] items-center gap-2 text-sm text-foreground">
              <Checkbox checked={families} onCheckedChange={(checked) => setFamilies(Boolean(checked))} />
              <House className="size-4 text-muted" aria-hidden />
              <span>{t("dataFamilies")}</span>
            </label>
          </fieldset>
        ) : null}
        <div className="max-w-sm space-y-2">
          <p className="text-sm font-medium text-foreground">{t("dataFormat")}</p>
          <PopoverSelect
            ariaLabel={t("dataFormat")}
            className="w-full"
            value={format}
            onValueChange={(value) => setFormat(value as "csv" | "xlsx" | "json" | "pdf")}
            options={[
              { value: "xlsx", label: t("dataXlsx") },
              { value: "csv", label: t("dataCsv") },
              { value: "json", label: t("dataJson") },
              { value: "pdf", label: t("dataPdf") },
            ]}
          />
        </div>
        {selected === 0 ? <p className="text-sm text-muted">{t("dataChooseList")}</p> : null}
        {busy ? (
          <p className="text-sm text-muted" role="status">
            {progress == null ? t("dataPreparing") : t("dataPreparingProgress", { percent: progress })}
          </p>
        ) : null}
        <Button type="button" className="w-full sm:w-auto" disabled={selected === 0 || busy} onClick={() => void download()}>
          <Download aria-hidden />
          {prepare ? t("dataPrepare") : t("dataDownload")}
        </Button>
        </>
        ) : null}
      </div>
    </ClubAdminLayout>
  );
}
