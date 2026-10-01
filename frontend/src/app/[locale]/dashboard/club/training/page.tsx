"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

import { EntityTable } from "@/components/club-admin/entity-table";
import { ClubAdminLayout } from "@/components/club-admin/club-admin-layout";
import { EmptyState } from "@/components/club-admin/empty-state";
import { useCanManageTraining } from "@/components/club-admin/use-training-access";
import { useClubSelection } from "@/components/club-selection-provider";
import { Button } from "@/components/ui/button";
import { FilterPills } from "@/components/ui/filter-pills";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ActionNotices, FormPanel } from "@/components/ui/list-page-chrome";
import { StatusBadge } from "@/components/ui/status-badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getClubTrainers } from "@/lib/club-admin-api";
import {
  createTrainingSession,
  getTrainingWeek,
  updateTrainingSession,
  type TrainingAudience,
  type TrainingSession,
} from "@/lib/training-api";

const AUDIENCES: TrainingAudience[] = ["kids", "adults", "belt_test", "competition", "other"];

function todayIso() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function weekdayIndex(iso: string) {
  const day = new Date(`${iso}T00:00:00`).getDay();
  return day === 0 ? 6 : day - 1;
}

export default function TrainingWeekPage() {
  const t = useTranslations("ClubAdmin");
  const locale = useLocale();
  const router = useRouter();
  const canManage = useCanManageTraining();
  const { selectedClubId } = useClubSelection();
  const [rows, setRows] = useState<TrainingSession[] | null>(null);
  const [coaches, setCoaches] = useState<{ user_id: number; first_name: string; last_name: string }[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [audience, setAudience] = useState<TrainingAudience>("kids");
  const [heldOn, setHeldOn] = useState(todayIso);
  const [startTime, setStartTime] = useState("17:00");
  const [endTime, setEndTime] = useState("18:30");
  const [coachIds, setCoachIds] = useState<number[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | TrainingSession["status"]>("all");

  const load = useCallback(async () => {
    if (!selectedClubId) return;
    try {
      setRows(await getTrainingWeek(selectedClubId));
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("loadError"));
      setRows([]);
    }
  }, [selectedClubId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!selectedClubId || !canManage) return;
    getClubTrainers(selectedClubId)
      .then((result) => setCoaches(result.trainers))
      .catch(() => setCoaches([]));
  }, [canManage, selectedClubId]);

  const onCreate = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedClubId) return;
    setIsSaving(true);
    try {
      const created = await createTrainingSession(selectedClubId, {
        name,
        audience,
        held_on: heldOn,
        start_time: startTime,
        end_time: endTime,
        coach_ids: coachIds,
      });
      router.push(`/${locale}/dashboard/club/training/sessions/${created.id}`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("saveError"));
    } finally {
      setIsSaving(false);
    }
  };

  const visibleRows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (rows ?? []).filter((row) => {
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      if (!needle) return true;
      return (
        row.name.toLowerCase().includes(needle) ||
        row.coach_names.join(" ").toLowerCase().includes(needle) ||
        t(`trainingAudience_${row.audience}`).toLowerCase().includes(needle)
      );
    });
  }, [rows, search, statusFilter, t]);

  const statusTone = (status: TrainingSession["status"]) => {
    if (status === "held") return "success" as const;
    if (status === "scheduled") return "info" as const;
    return "neutral" as const;
  };

  const setStatus = async (id: number, status: "cancelled" | "scheduled") => {
    if (!selectedClubId) return;
    try {
      await updateTrainingSession(selectedClubId, id, { status });
      await load();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("saveError"));
    }
  };

  return (
    <ClubAdminLayout title={t("trainingTitle")} subtitle={t("trainingThisWeek")}>
      {!selectedClubId ? (
        <EmptyState title={t("selectClubPlaceholder")} description={t("trainingChooseClub")} />
      ) : (
        <div className="space-y-6">
          <ActionNotices error={errorMessage} onDismiss={() => setErrorMessage(null)} />
          {canManage ? (
            <FormPanel>
              <h2 className="text-section text-foreground">{t("trainingAddSession")}</h2>
              <p className="mt-1 text-sm text-muted">{t("trainingAddSessionHint")}</p>
              <form className="mt-4 grid gap-3 md:grid-cols-2" onSubmit={(event) => void onCreate(event)}>
                <div>
                  <Label>{t("trainingClassName")}</Label>
                  <Input className="mt-1" value={name} onChange={(event) => setName(event.target.value)} required />
                </div>
                <div>
                  <Label>{t("trainingAudience")}</Label>
                  <Select value={audience} onValueChange={(value) => setAudience(value as TrainingAudience)}>
                    <SelectTrigger className="mt-1 w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {AUDIENCES.map((item) => (
                        <SelectItem key={item} value={item}>{t(`trainingAudience_${item}`)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{t("trainingDate")}</Label>
                  <Input className="mt-1" type="date" value={heldOn} onChange={(event) => setHeldOn(event.target.value)} required />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label>{t("trainingStarts")}</Label>
                    <Input className="mt-1" type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} required />
                  </div>
                  <div>
                    <Label>{t("trainingEnds")}</Label>
                    <Input className="mt-1" type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} required />
                  </div>
                </div>
                <div className="md:col-span-2">
                  <p className="text-sm font-medium">{t("trainingSessionCoaches")}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {coaches.map((coach) => {
                      const on = coachIds.includes(coach.user_id);
                      return (
                        <button
                          key={coach.user_id}
                          type="button"
                          onClick={() => setCoachIds((current) => (on ? current.filter((id) => id !== coach.user_id) : [...current, coach.user_id]))}
                          className={`rounded-[var(--radius-form)] border px-3 py-2 text-sm ${on ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}
                        >
                          {coach.first_name} {coach.last_name}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <Button type="submit" variant="primary" disabled={isSaving}>
                    {isSaving ? t("saving") : t("trainingAddSession")}
                  </Button>
                </div>
              </form>
            </FormPanel>
          ) : null}
          {rows === null ? (
            <EmptyState title={t("loadingTitle")} description={t("loadingSubtitle")} loading />
          ) : rows.length === 0 ? (
            <EmptyState title={t("trainingNoSessions")} description={t("trainingNoSessionsHint")} />
          ) : (
            <>
              <div className="flex flex-wrap items-end gap-4 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
                <div className="min-w-[12rem] flex-1">
                  <Input
                    className="w-full max-w-xs"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder={t("trainingSearchSessions")}
                    aria-label={t("trainingSearchSessions")}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <FilterPills
                    layout="wrap"
                    ariaLabel={t("trainingFilterStatus")}
                    value={statusFilter}
                    onChange={setStatusFilter}
                    options={(["all", "scheduled", "held", "cancelled"] as const).map((status) => ({
                      value: status,
                      title: status === "all" ? t("filterAllTitle") : t(`trainingStatus_${status}`),
                      count: status === "all" ? rows.length : rows.filter((row) => row.status === status).length,
                    }))}
                  />
                </div>
              </div>
              {visibleRows.length === 0 ? (
                <EmptyState title={t("trainingNoSessionsFilter")} description={t("trainingNoSessionsFilterHint")} />
              ) : (
                <EntityTable
                  rows={visibleRows}
                  onRowClick={(row) => router.push(`/${locale}/dashboard/club/training/sessions/${row.id}`)}
                  columns={[
                    {
                      key: "day",
                      header: t("trainingWeekday"),
                      render: (row) => t(`trainingDay_${weekdayIndex(row.held_on)}`),
                    },
                    { key: "held_on", header: t("trainingDate") },
                    {
                      key: "time",
                      header: t("trainingTime"),
                      render: (row) => `${row.start_time}–${row.end_time}`,
                    },
                    { key: "name", header: t("trainingClassName") },
                    {
                      key: "audience",
                      header: t("trainingAudience"),
                      render: (row) => t(`trainingAudience_${row.audience}`),
                    },
                    {
                      key: "status",
                      header: t("statusLabel"),
                      render: (row) => <StatusBadge label={t(`trainingStatus_${row.status}`)} tone={statusTone(row.status)} />,
                    },
                    {
                      key: "present",
                      header: t("trainingPresentColumn"),
                      render: (row) => row.present_ids.length,
                    },
                    {
                      key: "coaches",
                      header: t("trainingCoachesColumn"),
                      render: (row) => row.coach_names.join(", ") || "—",
                    },
                    {
                      key: "actions",
                      header: "",
                      render: (row) => (
                        <div className="flex flex-wrap gap-2">
                          {canManage && row.status !== "cancelled" ? (
                            <Button type="button" variant="outline" size="sm" onClick={() => void setStatus(row.id, "cancelled")}>
                              {t("trainingCancel")}
                            </Button>
                          ) : null}
                          {canManage && row.status === "cancelled" ? (
                            <Button type="button" variant="outline" size="sm" onClick={() => void setStatus(row.id, "scheduled")}>
                              {t("trainingRestore")}
                            </Button>
                          ) : null}
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => router.push(`/${locale}/dashboard/club/training/sessions/${row.id}`)}
                          >
                            {t("trainingOpenRoll")}
                          </Button>
                        </div>
                      ),
                    },
                  ]}
                />
              )}
            </>
          )}
        </div>
      )}
    </ClubAdminLayout>
  );
}
