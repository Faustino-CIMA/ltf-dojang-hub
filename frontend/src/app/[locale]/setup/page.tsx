"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";

import { AdminStep } from "@/components/setup/admin-step";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { PopoverSelect } from "@/components/ui/popover-select";
import { apiRequest } from "@/lib/api";
import { isValidRcsNumber, LBR_SEARCH_URL, normalizeRcsNumber } from "@/lib/rcs-number";
import {
  confirmSetupClubs,
  confirmSetupMembers,
  finishSetup,
  getSetupStatus,
  previewSetupClubs,
  previewSetupMembers,
  startSetup,
  type SetupClubPreview,
  type SetupClubRow,
  type SetupMemberPreview,
  type SetupStatus,
} from "@/lib/setup-api";
import { SETUP_STEPS, setupStepIndex, type SetupStepId } from "@/lib/setup-steps";

const STAFF_FUNCTIONS = ["coach", "medic", "media", "other", "secretary"] as const;

export default function SetupPage() {
  const t = useTranslations("Setup");
  const locale = useLocale();
  const router = useRouter();
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [step, setStep] = useState<SetupStepId>("welcome");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [clubFile, setClubFile] = useState<File | null>(null);
  const [clubPreview, setClubPreview] = useState<SetupClubPreview | null>(null);
  const [clubRows, setClubRows] = useState<SetupClubRow[]>([]);
  const [memberFile, setMemberFile] = useState<File | null>(null);
  const [memberPreview, setMemberPreview] = useState<SetupMemberPreview | null>(null);
  const [sexChoice, setSexChoice] = useState<Record<number, string>>({});
  const [activeChoice, setActiveChoice] = useState<Record<number, string>>({});
  const [clubChoice, setClubChoice] = useState<Record<string, string>>({});
  const [memberClubChoice, setMemberClubChoice] = useState<Record<string, string>>({});
  const [functionChoice, setFunctionChoice] = useState<Record<number, string>>({});
  const [allowMissing, setAllowMissing] = useState<Record<number, boolean>>({});
  const [dateFormat, setDateFormat] = useState("");
  const [finishOpen, setFinishOpen] = useState(false);

  const applyStatus = useCallback((next: SetupStatus) => {
    setStatus(next);
    setStep(SETUP_STEPS[setupStepIndex(next)]);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const me = await apiRequest<{ is_superuser?: boolean }>("/api/auth/me/");
        if (!me.is_superuser) {
          router.replace(`/${locale}/dashboard`);
          return;
        }
        const next = await getSetupStatus();
        if (!cancelled) applyStatus(next);
      } catch {
        if (!cancelled) router.replace(`/${locale}/login`);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [applyStatus, locale, router]);

  const memberPayload = useMemo(() => {
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
      else if (value) club_name_overrides[name] = { club_id: Number(value) };
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
      sex_overrides,
      active_overrides,
      club_name_overrides,
      club_choices,
      staff_function_overrides,
      allow_missing_id: Object.entries(allowMissing).filter(([, on]) => on).map(([key]) => Number(key)),
      ...(dateFormat ? { date_format: dateFormat } : {}),
    };
  }, [activeChoice, allowMissing, clubChoice, dateFormat, functionChoice, memberClubChoice, sexChoice]);

  const runClubPreview = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const preview = await previewSetupClubs(file);
      setClubPreview(preview);
      setClubRows(preview.rows);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("previewFailed"));
    } finally {
      setBusy(false);
    }
  };

  const runMemberPreview = async (file: File, payload = memberPayload) => {
    setBusy(true);
    setError(null);
    try {
      setMemberPreview(await previewSetupMembers(file, payload));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("previewFailed"));
    } finally {
      setBusy(false);
    }
  };

  if (!status) {
    return <main className="min-h-screen bg-background p-6 text-foreground">{t("loading")}</main>;
  }

  if (!status.available && !status.completed) {
    return (
      <main className="min-h-screen bg-background p-6 text-foreground">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="mt-2 text-sm text-muted">{t("unavailable")}</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background px-4 py-6 text-foreground">
      <div className="mx-auto max-w-6xl space-y-4">
        <header>
          <p className="text-sm text-muted">{t("eyebrow")}</p>
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
        </header>
        <ol className="flex flex-wrap gap-2">
          {SETUP_STEPS.map((item, index) => (
            <li key={item}>
              <button
                type="button"
                className={`rounded-[var(--radius-form)] border px-3 py-1.5 text-sm ${
                  step === item ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground"
                }`}
                onClick={() => setStep(item)}
              >
                {index + 1}. {t(`step_${item}`)}
              </button>
            </li>
          ))}
        </ol>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        {step === "welcome" ? (
          <section className="rounded-[var(--radius-card)] border border-border bg-card p-4">
            <h2 className="text-lg font-semibold">{t("welcomeTitle")}</h2>
            <p className="mt-2 text-sm text-muted">{t("welcomeBody")}</p>
            {!status.started ? (
              <Button
                className="mt-4"
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  startSetup()
                    .then(applyStatus)
                    .catch((cause) => setError(cause instanceof Error ? cause.message : t("previewFailed")))
                    .finally(() => setBusy(false));
                }}
              >
                {t("start")}
              </Button>
            ) : (
              <Button className="mt-4" onClick={() => setStep("clubs")}>
                {t("continue")}
              </Button>
            )}
          </section>
        ) : null}

        {step === "clubs" ? (
          <section className="space-y-3 rounded-[var(--radius-card)] border border-border bg-card p-4">
            <h2 className="text-lg font-semibold">{t("step_clubs")}</h2>
            <p className="text-sm text-muted">{t("clubsHelp")}</p>
            <Input
              type="file"
              accept=".csv,text/csv"
              aria-label={t("chooseFile")}
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                setClubFile(file);
                if (file) void runClubPreview(file);
              }}
            />
            {clubPreview ? (
              <p className="text-sm text-muted">
                {t("ignoredCounts", { blank: clubPreview.blank_rows_ignored, ltf: clubPreview.ltf_rows_ignored })}
              </p>
            ) : null}
            {clubRows.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-border text-muted">
                      <th className="py-2 pr-3">{t("clubName")}</th>
                      <th className="py-2 pr-3">{t("federation")}</th>
                      <th className="py-2 pr-3">{t("rcs")}</th>
                      <th className="py-2 pr-3">{t("headOffice")}</th>
                      <th className="py-2">{t("disposition")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clubRows.map((row) => (
                      <tr key={row.row_index} className="border-b border-border">
                        <td className="py-2 pr-3">{row.name}</td>
                        <td className="py-2 pr-3">
                          <PopoverSelect
                            value={row.federation}
                            ariaLabel={t("federation")}
                            onValueChange={(value) =>
                              setClubRows((current) =>
                                current.map((item) =>
                                  item.row_index === row.row_index
                                    ? { ...item, federation: value === "ITF" ? "ITF" : "WT" }
                                    : item,
                                ),
                              )
                            }
                            options={[
                              { value: "WT", label: "WT" },
                              { value: "ITF", label: "ITF" },
                            ]}
                          />
                        </td>
                        <td className="py-2 pr-3">
                          <Input
                            aria-label={t("rcs")}
                            value={row.rcs_number}
                            onChange={(event) =>
                              setClubRows((current) =>
                                current.map((item) =>
                                  item.row_index === row.row_index
                                    ? { ...item, rcs_number: event.target.value }
                                    : item,
                                ),
                              )
                            }
                          />
                          <a className="text-primary underline" href={LBR_SEARCH_URL} target="_blank" rel="noreferrer">
                            {t("openLbr")}
                          </a>
                          {row.rcs_error ? <p className="text-destructive">{t("rcsInvalid")}</p> : null}
                        </td>
                        <td className="py-2 pr-3">
                          {[row.address_line1, row.postal_code, row.locality].filter(Boolean).join(", ") || "—"}
                        </td>
                        <td className="py-2">{row.disposition}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            <Button
              disabled={!clubFile || busy || clubRows.some((row) => row.rcs_number && !isValidRcsNumber(row.rcs_number))}
              onClick={() => {
                if (!clubFile) return;
                const rows: Record<string, unknown> = {};
                for (const row of clubRows) {
                  rows[String(row.row_index)] = {
                    federation: row.federation,
                    rcs_number: normalizeRcsNumber(row.rcs_number),
                    address_line1: row.address_line1,
                    address_line2: row.address_line2,
                    postal_code: row.postal_code,
                    locality: row.locality,
                  };
                }
                setBusy(true);
                confirmSetupClubs(clubFile, { rows })
                  .then(async () => applyStatus(await getSetupStatus()))
                  .catch((cause) => setError(cause instanceof Error ? cause.message : t("previewFailed")))
                  .finally(() => setBusy(false));
              }}
            >
              {t("confirmClubs")}
            </Button>
          </section>
        ) : null}

        {step === "members" ? (
          <section className="space-y-3 rounded-[var(--radius-card)] border border-border bg-card p-4">
            <h2 className="text-lg font-semibold">{t("step_members")}</h2>
            <p className="text-sm text-muted">{t("membersHelp")}</p>
            <Input
              type="file"
              accept=".csv,text/csv"
              aria-label={t("chooseFile")}
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                setMemberFile(file);
                if (file) void runMemberPreview(file, memberPayload);
              }}
            />
            {memberPreview?.date_of_birth_format.ambiguous ? (
              <div className="rounded-[var(--radius-form)] border border-border p-3">
                <p>{t("dateQuestion", { example: memberPreview.date_of_birth_format.example || "03/04/2010" })}</p>
                <div className="mt-2 flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setDateFormat("DD/MM/YYYY");
                      if (memberFile) void runMemberPreview(memberFile, { ...memberPayload, date_format: "DD/MM/YYYY" });
                    }}
                  >
                    {t("dayFirst")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setDateFormat("MM/DD/YYYY");
                      if (memberFile) void runMemberPreview(memberFile, { ...memberPayload, date_format: "MM/DD/YYYY" });
                    }}
                  >
                    {t("monthFirst")}
                  </Button>
                </div>
              </div>
            ) : null}
            {memberPreview ? (
              <div className="grid gap-3 md:grid-cols-2">
                <Summary title={t("genderSummary")} rows={memberPreview.gender_summary.map((item) => `${item.value}: ${item.count}`)} />
                <Summary
                  title={t("roleSummary")}
                  rows={memberPreview.role_summary.map((item) =>
                    item.mapped ? `${item.value}: ${item.count} → ${item.mapped}` : `${item.value}: ${item.count} (${t("ignored")})`,
                  )}
                />
              </div>
            ) : null}
            {memberPreview?.unknown_clubs.length ? (
              <div className="space-y-2">
                {memberPreview.unknown_clubs.map((club) => (
                  <div key={club.name} className="flex flex-wrap items-center gap-2">
                    <span>{t("unknownClub", { count: club.count, name: club.name })}</span>
                    <PopoverSelect
                      value={clubChoice[club.name.toLowerCase()] || ""}
                      ariaLabel={t("resolveClub")}
                      onValueChange={(value) => setClubChoice((current) => ({ ...current, [club.name.toLowerCase()]: value }))}
                      options={[
                        { value: "staff", label: t("ltfStaff") },
                        { value: "skip", label: t("skipRows") },
                        ...memberPreview.clubs.map((item) => ({ value: String(item.id), label: item.name })),
                      ]}
                    />
                  </div>
                ))}
                <Button type="button" variant="outline" disabled={!memberFile || busy} onClick={() => memberFile && runMemberPreview(memberFile)}>
                  {t("refreshPreview")}
                </Button>
              </div>
            ) : null}
            {memberPreview ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-border text-muted">
                      <th className="py-2 pr-2">{t("memberId")}</th>
                      <th className="py-2 pr-2">{t("name")}</th>
                      <th className="py-2 pr-2">{t("club")}</th>
                      <th className="py-2 pr-2">{t("sex")}</th>
                      <th className="py-2 pr-2">{t("role")}</th>
                      <th className="py-2">{t("function")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {memberPreview.rows.map((row) => (
                      <tr key={row.row_index} className="border-b border-border align-top">
                        <td className="py-2 pr-2">{row.member_id || t("missingId")}</td>
                        <td className="py-2 pr-2">
                          {row.last_name} {row.first_name}
                          {row.dob_flag && row.dob_flag !== "ok" ? <p className="text-xs text-muted">{row.dob_flag}</p> : null}
                        </td>
                        <td className="py-2 pr-2">
                          {row.resolution.club_name || row.club_name}
                          {row.group_conflict ? (
                            <PopoverSelect
                              value={memberClubChoice[row.member_id] || ""}
                              ariaLabel={t("resolveClub")}
                              onValueChange={(value) =>
                                setMemberClubChoice((current) => ({ ...current, [row.member_id]: value }))
                              }
                              options={memberPreview.clubs.map((item) => ({ value: String(item.id), label: item.name }))}
                            />
                          ) : null}
                          {!row.member_id ? (
                            <label className="mt-1 flex items-center gap-2 text-xs">
                              <input
                                type="checkbox"
                                checked={Boolean(allowMissing[row.row_index])}
                                onChange={(event) =>
                                  setAllowMissing((current) => ({ ...current, [row.row_index]: event.target.checked }))
                                }
                              />
                              {t("allowMissing")}
                            </label>
                          ) : null}
                        </td>
                        <td className="py-2 pr-2">
                          {row.sex_blocking ? (
                            <PopoverSelect
                              value={sexChoice[row.row_index] || ""}
                              ariaLabel={t("sex")}
                              onValueChange={(value) => setSexChoice((current) => ({ ...current, [row.row_index]: value }))}
                              options={[
                                { value: "M", label: t("male") },
                                { value: "F", label: t("female") },
                                { value: "skip", label: t("skipRows") },
                              ]}
                            />
                          ) : (
                            row.sex || row.sex_raw
                          )}
                        </td>
                        <td className="py-2 pr-2">
                          {row.primary_license_role || t("ignored")}
                          {row.role_note ? <p className="text-xs text-muted">{row.role_note}</p> : null}
                        </td>
                        <td className="py-2">
                          {row.resolution.kind === "staff" || row.also_staff ? (
                            <PopoverSelect
                              value={functionChoice[row.row_index] || row.staff_function || "other"}
                              ariaLabel={t("function")}
                              onValueChange={(value) =>
                                setFunctionChoice((current) => ({ ...current, [row.row_index]: value }))
                              }
                              options={STAFF_FUNCTIONS.map((value) => ({ value, label: t(`function_${value}`) }))}
                            />
                          ) : (
                            "—"
                          )}
                          {row.end_unparseable ? (
                            <PopoverSelect
                              value={activeChoice[row.row_index] || ""}
                              ariaLabel={t("active")}
                              onValueChange={(value) => setActiveChoice((current) => ({ ...current, [row.row_index]: value }))}
                              options={[
                                { value: "active", label: t("active") },
                                { value: "inactive", label: t("inactive") },
                              ]}
                            />
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            <div className="flex gap-2">
              <Button type="button" variant="outline" disabled={!memberFile || busy} onClick={() => memberFile && runMemberPreview(memberFile)}>
                {t("refreshPreview")}
              </Button>
              <Button
                disabled={!memberFile || busy || !memberPreview?.can_confirm}
                onClick={() => {
                  if (!memberFile) return;
                  setBusy(true);
                  confirmSetupMembers(memberFile, memberPayload)
                    .then(async () => applyStatus(await getSetupStatus()))
                    .catch((cause) => setError(cause instanceof Error ? cause.message : t("previewFailed")))
                    .finally(() => setBusy(false));
                }}
              >
                {t("confirmMembers")}
              </Button>
            </div>
          </section>
        ) : null}

        {step === "admins" ? <AdminStep onFinish={() => setFinishOpen(true)} /> : null}

        {step === "done" ? (
          <section className="rounded-[var(--radius-card)] border border-border bg-card p-4">
            <h2 className="text-lg font-semibold">{t("step_done")}</h2>
            <p className="mt-2 text-sm text-muted">{t("doneBody")}</p>
            <ul className="mt-3 text-sm">
              <li>{t("countClubs", { count: status.counts.clubs })}</li>
              <li>{t("countMembers", { count: status.counts.club_members })}</li>
              <li>{t("countStaff", { count: status.counts.ltf_staff })}</li>
              <li>{t("countAdmins", { count: status.counts.admins })}</li>
              <li>{t("countNotImported", { count: status.counts.admins_not_imported ?? 0 })}</li>
              <li>{t("countLinksUnused", { count: status.counts.links_unused ?? 0 })}</li>
            </ul>
            <Button className="mt-4" asChild>
              <Link href={`/${locale}/dashboard/ops`}>{t("openOps")}</Link>
            </Button>
          </section>
        ) : null}
      </div>
      <Modal isOpen={finishOpen} onClose={() => setFinishOpen(false)} title={t("finishTitle")} description={status.needs_admin_step ? t("finishWarn") : t("finishBody")}>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setFinishOpen(false)}>
            {t("cancel")}
          </Button>
          <Button
            onClick={() => {
              setBusy(true);
              finishSetup()
                .then((next) => {
                  setFinishOpen(false);
                  applyStatus(next);
                })
                .catch((cause) => setError(cause instanceof Error ? cause.message : t("previewFailed")))
                .finally(() => setBusy(false));
            }}
          >
            {t("finish")}
          </Button>
        </div>
      </Modal>
    </main>
  );
}

function Summary({ title, rows }: { title: string; rows: string[] }) {
  return (
    <div className="rounded-[var(--radius-form)] border border-border p-3">
      <h3 className="font-medium">{title}</h3>
      <ul className="mt-2 space-y-1 text-sm text-muted">
        {rows.map((row) => (
          <li key={row}>{row}</li>
        ))}
      </ul>
    </div>
  );
}
