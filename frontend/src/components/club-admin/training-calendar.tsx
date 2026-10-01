"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { EmptyState } from "@/components/club-admin/empty-state";
import { useClubSelection } from "@/components/club-selection-provider";
import { Button } from "@/components/ui/button";
import { FilterPills } from "@/components/ui/filter-pills";
import { ActionNotices } from "@/components/ui/list-page-chrome";
import { StatusBadge } from "@/components/ui/status-badge";
import { getTrainingSessions, type TrainingSession } from "@/lib/training-api";

type StatusFilter = "all" | TrainingSession["status"];

export function isoDate(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function monthGrid(year: number, month: number) {
  const first = new Date(year, month, 1);
  const startWeekday = (first.getDay() + 6) % 7;
  const cursor = new Date(year, month, 1 - startWeekday);
  return Array.from({ length: 42 }, () => {
    const date = new Date(cursor);
    cursor.setDate(cursor.getDate() + 1);
    return { date, iso: isoDate(date), inMonth: date.getMonth() === month };
  });
}

function addMonths(year: number, month: number, delta: number) {
  const next = new Date(year, month + delta, 1);
  return { year: next.getFullYear(), month: next.getMonth() };
}

function dateLocale(locale: string) {
  return locale === "lb" ? "lb-LU" : "en-GB";
}

function sessionTone(status: TrainingSession["status"]) {
  if (status === "held") return "success" as const;
  if (status === "scheduled") return "info" as const;
  return "neutral" as const;
}

function matchesStatus(row: TrainingSession, filter: StatusFilter) {
  return filter === "all" || row.status === filter;
}

function useSessions(from: string, to: string) {
  const t = useTranslations("ClubAdmin");
  const { selectedClubId } = useClubSelection();
  const [rows, setRows] = useState<TrainingSession[] | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!selectedClubId) return;
    try {
      setRows(await getTrainingSessions(selectedClubId, from, to));
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("loadError"));
      setRows([]);
    }
  }, [from, selectedClubId, t, to]);

  useEffect(() => {
    void load();
  }, [load]);

  return { selectedClubId, rows, errorMessage, setErrorMessage };
}

function StatusFilterBar({ value, onChange, rows }: { value: StatusFilter; onChange: (value: StatusFilter) => void; rows: TrainingSession[] }) {
  const t = useTranslations("ClubAdmin");
  return (
    <FilterPills
      layout="wrap"
      ariaLabel={t("trainingFilterStatus")}
      value={value}
      onChange={onChange}
      options={(["all", "scheduled", "held", "cancelled"] as const).map((status) => ({
        value: status,
        title: status === "all" ? t("filterAllTitle") : t(`trainingStatus_${status}`),
        count: status === "all" ? rows.length : rows.filter((row) => row.status === status).length,
      }))}
    />
  );
}

export function TrainingMonthView() {
  const t = useTranslations("ClubAdmin");
  const locale = useLocale();
  const router = useRouter();
  const params = useSearchParams();
  const now = new Date();
  const year = Number(params.get("year")) || now.getFullYear();
  const monthParam = Number(params.get("month"));
  const month = monthParam >= 1 && monthParam <= 12 ? monthParam - 1 : now.getMonth();
  const days = useMemo(() => monthGrid(year, month), [month, year]);
  const { selectedClubId, rows, errorMessage, setErrorMessage } = useSessions(days[0].iso, days[41].iso);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const requestedDay = params.get("day");
  const selectedDay = days.some((day) => day.iso === requestedDay) ? requestedDay! : isoDate(new Date(year, month, 1));

  const visible = useMemo(() => (rows ?? []).filter((row) => matchesStatus(row, statusFilter)), [rows, statusFilter]);
  const byDay = useMemo(() => {
    const map = new Map<string, TrainingSession[]>();
    for (const row of visible) {
      const list = map.get(row.held_on) ?? [];
      list.push(row);
      map.set(row.held_on, list);
    }
    return map;
  }, [visible]);

  const openMonth = (nextYear: number, nextMonth: number, day?: string) => {
    const dayQuery = day ? `&day=${day}` : "";
    router.push(`/${locale}/dashboard/club/training/month?year=${nextYear}&month=${nextMonth + 1}${dayQuery}`);
  };

  const label = new Date(year, month, 1).toLocaleDateString(dateLocale(locale), { month: "long", year: "numeric" });
  const weekdayLabels = monthGrid(2026, 5).slice(0, 7).map((day) =>
    day.date.toLocaleDateString(dateLocale(locale), { weekday: "short" }),
  );
  const selectedSessions = byDay.get(selectedDay) ?? [];

  if (!selectedClubId) {
    return <EmptyState title={t("selectClubPlaceholder")} description={t("trainingChooseClub")} />;
  }

  return (
    <div className="space-y-4">
      <ActionNotices error={errorMessage} onDismiss={() => setErrorMessage(null)} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={t("trainingPrevMonth")}
            onClick={() => {
              const next = addMonths(year, month, -1);
              openMonth(next.year, next.month);
            }}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <p className="min-w-40 text-center text-lg font-semibold capitalize text-foreground">{label}</p>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={t("trainingNextMonth")}
            onClick={() => {
              const next = addMonths(year, month, 1);
              openMonth(next.year, next.month);
            }}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
        <Button type="button" variant="outline" onClick={() => openMonth(now.getFullYear(), now.getMonth(), isoDate(now))}>
          {t("trainingToday")}
        </Button>
      </div>
      {rows === null ? (
        <EmptyState title={t("loadingTitle")} description={t("loadingSubtitle")} loading />
      ) : (
        <>
          <StatusFilterBar value={statusFilter} onChange={setStatusFilter} rows={rows} />
          <div className="app-panel overflow-x-auto p-3">
            <div className="grid min-w-[42rem] grid-cols-7 gap-1 text-center text-xs font-medium uppercase tracking-wide text-muted">
              {weekdayLabels.map((name) => (
                <div key={name} className="py-2">{name}</div>
              ))}
            </div>
            <div className="grid min-w-[42rem] grid-cols-7 gap-1">
              {days.map((day) => {
                const daySessions = byDay.get(day.iso) ?? [];
                const selected = day.iso === selectedDay;
                const isToday = day.iso === isoDate(now);
                return (
                  <button
                    key={day.iso}
                    type="button"
                    onClick={() => openMonth(year, month, day.iso)}
                    className={`min-h-24 rounded-[var(--radius-control)] border p-1 text-left text-sm ${
                      selected ? "border-primary bg-[var(--accent-soft)]" : "border-transparent hover:bg-secondary/70"
                    } ${day.inMonth ? "text-foreground" : "text-muted"}`}
                  >
                    <span className={`inline-flex size-7 items-center justify-center rounded-full text-sm ${isToday ? "bg-primary font-semibold text-primary-foreground" : "font-medium"}`}>
                      {day.date.getDate()}
                    </span>
                    {daySessions.slice(0, 3).map((session) => (
                      <span
                        key={session.id}
                        className={`mt-0.5 block truncate rounded px-1 text-[11px] ${session.status === "cancelled" ? "text-muted line-through" : "bg-secondary"}`}
                      >
                        {session.start_time.slice(0, 5)} {session.name}
                      </span>
                    ))}
                    {daySessions.length > 3 ? (
                      <span className="mt-0.5 block px-1 text-[11px] text-muted">+{daySessions.length - 3}</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
          <section>
            <h2 className="text-section text-foreground">{selectedDay}</h2>
            {selectedSessions.length === 0 ? (
              <div className="mt-3">
                <EmptyState title={t("trainingMonthEmpty")} description={t("trainingMonthEmptyHint")} />
              </div>
            ) : (
              <ul className="mt-3 space-y-2">
                {selectedSessions.map((session) => (
                  <li key={session.id}>
                    <button
                      type="button"
                      className="app-panel flex w-full flex-wrap items-center justify-between gap-3 p-4 text-left hover:bg-secondary/50"
                      onClick={() => router.push(`/${locale}/dashboard/club/training/sessions/${session.id}`)}
                    >
                      <span>
                        <span className="block text-sm font-medium text-foreground">
                          {session.start_time.slice(0, 5)}–{session.end_time.slice(0, 5)} · {session.name}
                        </span>
                        <span className="block text-sm text-muted">
                          {t(`trainingAudience_${session.audience}`)}
                          {session.coach_names.length > 0 ? ` · ${session.coach_names.join(", ")}` : ""}
                        </span>
                      </span>
                      <StatusBadge label={t(`trainingStatus_${session.status}`)} tone={sessionTone(session.status)} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

export function TrainingYearView() {
  const t = useTranslations("ClubAdmin");
  const locale = useLocale();
  const router = useRouter();
  const params = useSearchParams();
  const now = new Date();
  const year = Number(params.get("year")) || now.getFullYear();
  const { selectedClubId, rows, errorMessage, setErrorMessage } = useSessions(`${year}-01-01`, `${year}-12-31`);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const visible = useMemo(() => (rows ?? []).filter((row) => matchesStatus(row, statusFilter)), [rows, statusFilter]);
  const byDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of visible) map.set(row.held_on, (map.get(row.held_on) ?? 0) + 1);
    return map;
  }, [visible]);

  const openYear = (nextYear: number) => router.push(`/${locale}/dashboard/club/training/year?year=${nextYear}`);
  const weekdayLabels = monthGrid(2026, 5).slice(0, 7).map((day) =>
    day.date.toLocaleDateString(dateLocale(locale), { weekday: "narrow" }),
  );

  if (!selectedClubId) {
    return <EmptyState title={t("selectClubPlaceholder")} description={t("trainingChooseClub")} />;
  }

  return (
    <div className="space-y-4">
      <ActionNotices error={errorMessage} onDismiss={() => setErrorMessage(null)} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="icon" aria-label={t("trainingPrevYear")} onClick={() => openYear(year - 1)}>
            <ChevronLeft className="size-4" />
          </Button>
          <p className="min-w-24 text-center text-lg font-semibold text-foreground">{year}</p>
          <Button type="button" variant="outline" size="icon" aria-label={t("trainingNextYear")} onClick={() => openYear(year + 1)}>
            <ChevronRight className="size-4" />
          </Button>
        </div>
        <Button type="button" variant="outline" onClick={() => openYear(now.getFullYear())}>
          {t("trainingToday")}
        </Button>
      </div>
      <p className="text-sm text-muted">{t("trainingYearHint")}</p>
      {rows === null ? (
        <EmptyState title={t("loadingTitle")} description={t("loadingSubtitle")} loading />
      ) : (
        <>
          <StatusFilterBar value={statusFilter} onChange={setStatusFilter} rows={rows} />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 12 }, (_, month) => {
              const days = monthGrid(year, month);
              const title = new Date(year, month, 1).toLocaleDateString(dateLocale(locale), { month: "long" });
              return (
                <section key={month} className="app-panel p-3">
                  <button
                    type="button"
                    className="text-sm font-semibold capitalize text-foreground hover:underline"
                    onClick={() => router.push(`/${locale}/dashboard/club/training/month?year=${year}&month=${month + 1}`)}
                  >
                    {title}
                  </button>
                  <div className="mt-2 grid grid-cols-7 gap-0.5 text-center text-[10px] uppercase text-muted">
                    {weekdayLabels.map((name, index) => (
                      <div key={`${month}-${index}`}>{name}</div>
                    ))}
                  </div>
                  <div className="mt-1 grid grid-cols-7 gap-0.5">
                    {days.map((day) => {
                      const count = byDay.get(day.iso) ?? 0;
                      const isToday = day.iso === isoDate(now);
                      return (
                        <button
                          key={day.iso}
                          type="button"
                          aria-label={`${day.iso}${count > 0 ? `, ${count}` : ""}`}
                          onClick={() => router.push(`/${locale}/dashboard/club/training/month?year=${year}&month=${month + 1}&day=${day.iso}`)}
                          className={`flex aspect-square items-center justify-center rounded text-[11px] ${
                            day.inMonth ? "text-foreground" : "text-muted"
                          } ${count > 0 ? "bg-primary/15 font-semibold" : "hover:bg-secondary"} ${isToday ? "ring-1 ring-primary" : ""}`}
                        >
                          {day.date.getDate()}
                        </button>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
