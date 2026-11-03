"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";

import { ExplainedCount, StepIntro } from "@/components/import/wizard-chrome";
import { AdminStep } from "@/components/setup/admin-step";
import { SetupClubStep } from "@/components/setup/setup-club-step";
import { SetupMemberWizard } from "@/components/setup/setup-member-wizard";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { apiRequest } from "@/lib/api";
import { isValidRcsNumber, normalizeRcsNumber } from "@/lib/rcs-number";
import {
  confirmSetupClubs,
  finishSetup,
  getSetupStatus,
  previewSetupClubs,
  startSetup,
  type SetupClubPreview,
  type SetupClubRow,
  type SetupStatus,
} from "@/lib/setup-api";
import { SETUP_STEPS, setupStepIndex, type SetupStepId } from "@/lib/setup-steps";

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

  const runClubPreview = async (file: File) => {
    setBusy(true);
    setError(null);
    setClubFile(file);
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

  const confirmClubs = () => {
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

  const clubCanConfirm =
    Boolean(clubFile && clubPreview) &&
    clubRows.every((row) => (!row.rcs_number || isValidRcsNumber(row.rcs_number)) && !row.rcs_error);

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
        {error ? <p className="banner-danger rounded-[var(--radius-form)] border px-3 py-2 text-sm">{error}</p> : null}

        {step === "welcome" ? (
          <section className="rounded-[var(--radius-card)] border border-border bg-card p-4" data-setup-panel="welcome">
            <StepIntro title={t("welcomeTitle")}>
              <p>{t("welcomeIntro")}</p>
              <ol className="list-decimal space-y-2 pl-5">
                <li>{t("welcomeClubs")}</li>
                <li>{t("welcomeMembers")}</li>
                <li>{t("welcomeAdmins")}</li>
              </ol>
              <p>{t("welcomeNotImported")}</p>
              <p>{t("welcomeNext")}</p>
            </StepIntro>
            {!status.started ? (
              <Button
                className="mt-4"
                variant="primary"
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
              <Button className="mt-4" variant="primary" onClick={() => setStep("clubs")}>
                {t("continue")}
              </Button>
            )}
          </section>
        ) : null}

        {step === "clubs" ? (
          <SetupClubStep
            busy={busy}
            fileName={clubFile?.name ?? null}
            preview={clubPreview}
            rows={clubRows}
            canConfirm={clubCanConfirm}
            onFile={(file) => void runClubPreview(file)}
            onChange={(rowIndex, patch) =>
              setClubRows((current) =>
                current.map((item) => {
                  if (item.row_index !== rowIndex) return item;
                  const next = { ...item, ...patch };
                  if (patch.rcs_number !== undefined) {
                    next.rcs_error = !patch.rcs_number || isValidRcsNumber(patch.rcs_number) ? "" : "invalid_rcs";
                  }
                  return next;
                }),
              )
            }
            onConfirm={confirmClubs}
          />
        ) : null}

        {step === "members" ? (
          <div data-setup-panel="members">
            <SetupMemberWizard onDone={() => void getSetupStatus().then(applyStatus)} />
          </div>
        ) : null}

        {step === "admins" ? <AdminStep onFinish={() => setFinishOpen(true)} /> : null}

        {step === "done" ? (
          <section className="space-y-3 rounded-[var(--radius-card)] border border-border bg-card p-4" data-setup-panel="done">
            <StepIntro title={t("step_done")}>
              <p>{t("doneIntro")}</p>
              <p>{t("doneNext")}</p>
            </StepIntro>
            <div className="grid gap-3 md:grid-cols-2">
              <ExplainedCount label={t("countClubs", { count: status.counts.clubs })} hint={t("countClubsHint")} hintLabel={t("hintLabel")} tone="success" />
              <ExplainedCount label={t("countMembers", { count: status.counts.club_members })} hint={t("countMembersHint")} hintLabel={t("hintLabel")} />
              <ExplainedCount label={t("countStaff", { count: status.counts.ltf_staff })} hint={t("countStaffHint")} hintLabel={t("hintLabel")} tone="info" />
              <ExplainedCount label={t("countAdmins", { count: status.counts.admins })} hint={t("countAdminsHint")} hintLabel={t("hintLabel")} />
              <ExplainedCount
                label={t("countNotImported", { count: status.counts.admins_not_imported ?? 0 })}
                hint={t("countNotImportedHint")}
                hintLabel={t("hintLabel")}
                tone={status.counts.admins_not_imported ? "warning" : "neutral"}
              />
              <ExplainedCount
                label={t("countLinksUnused", { count: status.counts.links_unused ?? 0 })}
                hint={t("countLinksUnusedHint")}
                hintLabel={t("hintLabel")}
              />
            </div>
            <Button variant="primary" asChild>
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
            variant="primary"
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
