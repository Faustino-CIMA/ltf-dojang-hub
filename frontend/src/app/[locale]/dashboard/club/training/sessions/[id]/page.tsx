"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

import { ClubAdminLayout } from "@/components/club-admin/club-admin-layout";
import { EmptyState } from "@/components/club-admin/empty-state";
import { StudentMultiPicker } from "@/components/club-admin/student-multi-picker";
import { useCanManageTraining } from "@/components/club-admin/use-training-access";
import { useClubSelection } from "@/components/club-selection-provider";
import { Button } from "@/components/ui/button";
import { FilterPills } from "@/components/ui/filter-pills";
import { ActionNotices, FormPanel } from "@/components/ui/list-page-chrome";
import { StatusBadge } from "@/components/ui/status-badge";
import { getTrainingRoll, saveTrainingAttendance, updateTrainingSession, type TrainingRoll } from "@/lib/training-api";

type AgeFilter = "all" | "under_12" | "from_12" | "adult";

function matchesAge(age: number | null, filter: AgeFilter) {
  if (filter === "all") return true;
  if (age === null) return false;
  if (filter === "under_12") return age < 12;
  if (filter === "from_12") return age >= 12;
  return age >= 18;
}

export default function TrainingRollPage() {
  const t = useTranslations("ClubAdmin");
  const locale = useLocale();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const canManage = useCanManageTraining();
  const { selectedClubId } = useClubSelection();
  const [roll, setRoll] = useState<TrainingRoll | null>(null);
  const [present, setPresent] = useState<number[]>([]);
  const [pinned, setPinned] = useState<number[]>([]);
  const [coachIds, setCoachIds] = useState<number[]>([]);
  const [ageFilter, setAgeFilter] = useState<AgeFilter>("all");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const load = useCallback(async () => {
    if (!selectedClubId) return;
    const next = await getTrainingRoll(selectedClubId, Number(params.id));
    const already = next.session.present_ids;
    const starting = already.length > 0 ? already : next.suggested_ids;
    setRoll(next);
    setPresent(starting);
    setPinned(starting);
    setCoachIds(next.session.coach_ids);
  }, [params.id, selectedClubId]);

  useEffect(() => {
    void load().catch((error: Error) => setErrorMessage(error.message));
  }, [load]);

  const cancelled = roll?.session.status === "cancelled";

  const shown = useMemo(() => {
    if (!roll) return [];
    return roll.members.filter((member) => pinned.includes(member.id) && matchesAge(member.age, ageFilter));
  }, [ageFilter, pinned, roll]);

  const additions = useMemo(() => {
    if (!roll) return [];
    return roll.members
      .filter((member) => !pinned.includes(member.id) && matchesAge(member.age, ageFilter))
      .map((member) => ({ id: member.id, label: member.name, age: member.age }));
  }, [ageFilter, pinned, roll]);

  const toggle = (id: number) => {
    setPresent((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  };

  const addPeople = (ids: number[]) => {
    setPinned((current) => Array.from(new Set([...current, ...ids])));
    setPresent((current) => Array.from(new Set([...current, ...ids])));
  };

  const save = async () => {
    if (!selectedClubId || !roll || cancelled) return;
    setIsSaving(true);
    setSuccessMessage(null);
    try {
      const next = await saveTrainingAttendance(selectedClubId, roll.session.id, present, coachIds);
      setRoll(next);
      setPresent(next.session.present_ids);
      setPinned(next.session.present_ids);
      setCoachIds(next.session.coach_ids);
      setErrorMessage(null);
      setSuccessMessage(t("trainingRollSaved"));
    } catch (error) {
      setSuccessMessage(null);
      setErrorMessage(error instanceof Error ? error.message : t("saveError"));
    } finally {
      setIsSaving(false);
    }
  };

  const setStatus = async (status: "cancelled" | "scheduled") => {
    if (!selectedClubId || !roll) return;
    try {
      await updateTrainingSession(selectedClubId, roll.session.id, { status });
      await load();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("saveError"));
    }
  };

  return (
    <ClubAdminLayout
      title={roll?.session.name || t("trainingOpenRoll")}
      subtitle={roll ? `${roll.session.held_on} · ${roll.session.start_time}–${roll.session.end_time}` : ""}
    >
      {!selectedClubId ? (
        <EmptyState title={t("selectClubPlaceholder")} description={t("trainingChooseClub")} />
      ) : !roll ? (
        <EmptyState title={t("loadingTitle")} description={t("loadingSubtitle")} loading />
      ) : (
        <div className="space-y-6">
          <ActionNotices
            error={errorMessage}
            success={successMessage}
            onDismiss={() => {
              setErrorMessage(null);
              setSuccessMessage(null);
            }}
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
              <span>{t(`trainingAudience_${roll.session.audience}`)}</span>
              <StatusBadge
                label={t(`trainingStatus_${roll.session.status}`)}
                tone={roll.session.status === "held" ? "success" : roll.session.status === "scheduled" ? "info" : "neutral"}
              />
              <span>{roll.session.hours} h</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => router.push(`/${locale}/dashboard/club/training`)}>
                {t("trainingThisWeek")}
              </Button>
              {canManage && !cancelled ? (
                <Button type="button" variant="outline" size="sm" onClick={() => void setStatus("cancelled")}>
                  {t("trainingCancel")}
                </Button>
              ) : null}
              {canManage && cancelled ? (
                <Button type="button" variant="outline" size="sm" onClick={() => void setStatus("scheduled")}>
                  {t("trainingRestore")}
                </Button>
              ) : null}
            </div>
          </div>
          <FormPanel>
            <h2 className="text-section text-foreground">{t("trainingSessionCoaches")}</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {roll.coaches.map((coach) => {
                const on = coachIds.includes(coach.id);
                return (
                  <button
                    key={coach.id}
                    type="button"
                    disabled={cancelled}
                    onClick={() => setCoachIds((current) => (on ? current.filter((id) => id !== coach.id) : [...current, coach.id]))}
                    className={`rounded-[var(--radius-form)] border px-3 py-2 text-sm ${on ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}
                  >
                    {coach.name}
                  </button>
                );
              })}
            </div>
          </FormPanel>
          <FilterPills
            layout="wrap"
            ariaLabel={t("trainingAgeFilterHint")}
            value={ageFilter}
            onChange={setAgeFilter}
            options={(["all", "under_12", "from_12", "adult"] as const).map((filter) => ({
              value: filter,
              title: t(`trainingAge_${filter}`),
              count: roll.members.filter((member) => matchesAge(member.age, filter)).length,
            }))}
          />
          <p className="text-sm text-muted">{t("trainingRollHint")}</p>
          <FormPanel>
            <h2 className="text-section text-foreground">{t("trainingOnTheRoll")}</h2>
            {shown.length === 0 ? (
              <p className="mt-3 text-sm text-muted">{t("trainingRollEmpty")}</p>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                {shown.map((member) => {
                  const on = present.includes(member.id);
                  return (
                    <button
                      key={member.id}
                      type="button"
                      disabled={cancelled}
                      onClick={() => toggle(member.id)}
                      className={`rounded-[var(--radius-form)] border px-4 py-3 text-base ${on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground"}`}
                    >
                      {member.name}{member.age !== null ? ` · ${member.age}` : ""}
                    </button>
                  );
                })}
              </div>
            )}
            {!cancelled ? (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <p className="text-sm text-muted">{t("trainingPresentCount", { count: present.length })}</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setPresent((current) => Array.from(new Set([...current, ...shown.map((member) => member.id)])))}
                  >
                    {t("trainingMarkShown")}
                  </Button>
                </div>
                <Button type="button" variant="primary" disabled={isSaving} onClick={() => void save()}>
                  {isSaving ? t("saving") : t("trainingSaveRoll")}
                </Button>
              </div>
            ) : null}
          </FormPanel>
          {!cancelled ? (
            <FormPanel>
              <h2 className="text-section text-foreground">{t("trainingAddStudents")}</h2>
              <p className="mt-1 text-xs text-muted">{t("trainingAgeFilterHint")}</p>
              <StudentMultiPicker options={additions} onAdd={addPeople} />
            </FormPanel>
          ) : null}
        </div>
      )}
    </ClubAdminLayout>
  );
}
