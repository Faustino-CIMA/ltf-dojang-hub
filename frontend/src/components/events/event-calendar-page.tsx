"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";

import { ClubAdminLayout } from "@/components/club-admin/club-admin-layout";
import { EmptyState } from "@/components/club-admin/empty-state";
import { useClubSelection } from "@/components/club-selection-provider";
import { EventFormPanel } from "@/components/events/event-form-page";
import { LtfAdminLayout } from "@/components/ltf-admin/ltf-admin-layout";
import { MemberLayout } from "@/components/member/member-layout";
import { notifyCalendarAttention, notifyCalendarReminders } from "@/components/events/use-calendar-attention";
import { Button } from "@/components/ui/button";
import { DeleteConfirmModal } from "@/components/ui/delete-confirm-modal";
import { ActionNotices } from "@/components/ui/list-page-chrome";
import { RowActionMenu } from "@/components/ui/row-action-menu";
import { StatusBadge } from "@/components/ui/status-badge";
import { apiRequest } from "@/lib/api";
import { formatDisplayDateTime } from "@/lib/date-display";
import { useConsumeSearchParam } from "@/lib/consume-search-param";
import { deleteEvent, listEvents, markEventSeen, setEventReminder, type CalendarEvent } from "@/lib/events-api";

type CalendarVariant = "ltf" | "club" | "member";

type EventCalendarPageProps = {
  variant: CalendarVariant;
};

function startOfMonth(year: number, month: number) {
  return new Date(year, month, 1);
}

function addMonths(year: number, month: number, delta: number) {
  const next = new Date(year, month + delta, 1);
  return { year: next.getFullYear(), month: next.getMonth() };
}

function isoDate(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function eventDayKey(iso: string) {
  return iso.slice(0, 10);
}

function toDateInput(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function visibilityTone(visibility: CalendarEvent["visibility"]): "success" | "warning" | "neutral" {
  if (visibility === "public") return "success";
  if (visibility === "internal") return "warning";
  if (visibility === "shared") return "warning";
  return "neutral";
}

export function EventCalendarPage({ variant }: EventCalendarPageProps) {
  const t = useTranslations("Events");
  const common = useTranslations("Common");
  const locale = useLocale();
  const { selectedClubId } = useClubSelection();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [armedReminders, setArmedReminders] = useState<Record<number, string>>({});
  const [isClubAdmin, setIsClubAdmin] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<string>(isoDate(now));
  const [panel, setPanel] = useState<{ eventId?: number } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ id: number; title: string } | null>(null);

  const range = useMemo(() => {
    const from = startOfMonth(year, month);
    const to = startOfMonth(year, month + 1);
    to.setMilliseconds(-1);
    return { from: isoDate(from), to: isoDate(to) };
  }, [month, year]);

  const canWrite = variant === "ltf" || variant === "club";
  useConsumeSearchParam("create", () => setPanel({}), canWrite);
  useConsumeSearchParam("edit", (value) => {
    const id = Number(value);
    if (Number.isFinite(id) && id > 0) setPanel({ eventId: id });
  });

  const load = useCallback(async () => {
    setErrorMessage(null);
    if (variant === "club" && selectedClubId == null) {
      setEvents([]);
      return;
    }
    try {
      const rows = await listEvents({
        scope: variant === "member" ? undefined : variant === "ltf" ? "federation" : "club",
        club: variant === "club" ? selectedClubId : undefined,
        from: range.from,
        to: range.to,
      });
      setEvents(rows);
      const armed: Record<number, string> = {};
      for (const row of rows) {
        if (row.reminder?.remind_on) armed[row.id] = row.reminder.remind_on;
      }
      setArmedReminders(armed);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("calendarLoadError"));
      setEvents([]);
    }
  }, [range.from, range.to, selectedClubId, t, variant]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (variant !== "club") return;
    let cancelled = false;
    apiRequest<{ role: string }>("/api/auth/me/")
      .then((me) => {
        if (!cancelled) setIsClubAdmin(me.role === "club_admin");
      })
      .catch(() => {
        if (!cancelled) setIsClubAdmin(false);
      });
    return () => {
      cancelled = true;
    };
  }, [variant]);

  const armReminder = async (event: CalendarEvent) => {
    const today = toDateInput(new Date().toISOString());
    const eventDay = toDateInput(event.starts_at);
    const remindOn = eventDay && eventDay < today ? today : eventDay;
    if (!remindOn) return;
    const saved = await setEventReminder(event.id, remindOn);
    setArmedReminders((current) => ({ ...current, [event.id]: saved.remind_on ?? remindOn }));
    notifyCalendarReminders();
  };

  const days = useMemo(() => {
    const first = startOfMonth(year, month);
    const startWeekday = (first.getDay() + 6) % 7;
    const grid: Array<{ date: Date; inMonth: boolean }> = [];
    const cursor = new Date(first);
    cursor.setDate(1 - startWeekday);
    for (let i = 0; i < 42; i += 1) {
      const date = new Date(cursor);
      grid.push({ date, inMonth: date.getMonth() === month });
      cursor.setDate(cursor.getDate() + 1);
    }
    return grid;
  }, [month, year]);

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of events) {
      const key = eventDayKey(event.starts_at);
      const list = map.get(key) ?? [];
      list.push(event);
      map.set(key, list);
    }
    return map;
  }, [events]);

  const selectedEvents = byDay.get(selectedDay) ?? [];
  const todayKey = isoDate(now);
  const monthLabel = startOfMonth(year, month).toLocaleDateString(locale === "lb" ? "lb-LU" : "en-GB", {
    month: "long",
    year: "numeric",
  });

  const weekdayLabels = [1, 2, 3, 4, 5, 6, 0].map((day) =>
    new Date(2026, 5, day === 0 ? 7 : day).toLocaleDateString(locale === "lb" ? "lb-LU" : "en-GB", {
      weekday: "short",
    }),
  );

  const content = (
    <>
      <ActionNotices error={errorMessage} onDismiss={() => setErrorMessage(null)} />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => {
              const next = addMonths(year, month, -1);
              setYear(next.year);
              setMonth(next.month);
            }}
            aria-label={t("calendarPrevMonth")}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <p className="min-w-40 text-center text-lg font-semibold capitalize text-foreground">{monthLabel}</p>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => {
              const next = addMonths(year, month, 1);
              setYear(next.year);
              setMonth(next.month);
            }}
            aria-label={t("calendarNextMonth")}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
        {canWrite ? (
          <Button type="button" variant="primary" onClick={() => setPanel({})}>
            <Plus className="size-4" aria-hidden />
            {t("calendarNew")}
          </Button>
        ) : null}
      </div>

      <div className="app-panel overflow-x-auto p-3">
        <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium uppercase tracking-wide text-muted">
          {weekdayLabels.map((label) => (
            <div key={label} className="py-2">
              {label}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {days.map(({ date, inMonth }) => {
            const key = isoDate(date);
            const dayEvents = byDay.get(key) ?? [];
            const selected = key === selectedDay;
            const isToday = key === todayKey;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setSelectedDay(key)}
                aria-current={isToday ? "date" : undefined}
                aria-label={
                  isToday
                    ? t("calendarTodayAria", { day: date.getDate() })
                    : undefined
                }
                className={`min-h-20 rounded-[var(--radius-control)] border p-1 text-left text-sm transition-colors ${
                  selected
                    ? "border-primary bg-[var(--accent-soft)]"
                    : "border-transparent hover:bg-secondary/70"
                } ${inMonth ? "text-foreground" : "text-muted"}`}
              >
                <span
                  className={`inline-flex size-7 items-center justify-center rounded-full text-sm font-semibold ${
                    isToday ? "bg-primary text-primary-foreground" : "font-medium"
                  }`}
                >
                  {date.getDate()}
                </span>
                {dayEvents.slice(0, 2).map((event) => (
                  <span key={event.id} className="mt-0.5 block truncate rounded bg-secondary px-1 text-xs">
                    {event.title}
                  </span>
                ))}
                {dayEvents.length > 2 ? (
                  <span className="mt-0.5 block px-1 text-xs text-muted">+{dayEvents.length - 2}</span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      <section className="mt-6">
        <h2 className="text-lg font-semibold text-foreground">{t("calendarDayTitle", { date: selectedDay })}</h2>
        {selectedEvents.length === 0 ? (
          <div className="mt-3">
            <EmptyState title={t("calendarEmptyTitle")} description={t("calendarEmptySubtitle")} />
          </div>
        ) : (
          <ul className="mt-3 space-y-2">
            {selectedEvents.map((event) => {
              const canEditEvent = variant !== "member" && event.can_edit;
              return (
                <li key={event.id} className="app-panel p-4">
                  <div className="flex items-start justify-between gap-2">
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() => {
                        void markEventSeen(event.id).then(() => notifyCalendarAttention());
                        setPanel({ eventId: event.id });
                      }}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-semibold text-foreground">{event.title}</p>
                        <StatusBadge
                          label={t(`calendarVisibility_${event.visibility}`)}
                          tone={visibilityTone(event.visibility)}
                        />
                      </div>
                      <p className="mt-1 text-sm text-muted">
                        {event.all_day ? t("calendarAllDay") : formatDisplayDateTime(event.starts_at)}
                        {event.kind !== "calendar" ? ` · ${t(`calendarKind_${event.kind}`)}` : ""}
                        {event.club_name ? ` · ${event.club_name}` : ""}
                        {event.venue_name ? ` · ${event.venue_name}` : ""}
                      </p>
                    </button>
                    {canEditEvent ? (
                      <RowActionMenu
                        label={common("rowActionsLabel")}
                        actions={[
                          {
                            key: "delete",
                            label: t("calendarDelete"),
                            destructive: true,
                            onSelect: () => setPendingDelete({ id: event.id, title: event.title }),
                          },
                        ]}
                      />
                    ) : null}
                  </div>
                  {variant === "club" && isClubAdmin ? (
                    <div className="mt-3">
                      {armedReminders[event.id] ? (
                        <p className="text-sm text-muted">{t("calendarReminderSet")}</p>
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            void armReminder(event).catch((error) => {
                              setErrorMessage(error instanceof Error ? error.message : t("calendarSaveError"));
                            });
                          }}
                        >
                          {t("calendarRemindMe")}
                        </Button>
                      )}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <EventFormPanel
        open={panel !== null}
        variant={variant}
        eventId={panel?.eventId}
        onClose={() => setPanel(null)}
        onSaved={() => {
          setPanel(null);
          void load();
        }}
        onRequestDelete={
          variant === "member"
            ? undefined
            : (title) => {
                if (!panel?.eventId) return;
                setPendingDelete({ id: panel.eventId, title: title || t("calendarEditTitle") });
              }
        }
      />
      <DeleteConfirmModal
        isOpen={pendingDelete !== null}
        title={t("calendarDelete")}
        description={common("deleteDescriptionWithName", { name: pendingDelete?.title ?? "" })}
        confirmLabel={common("deleteConfirmButton")}
        cancelLabel={common("deleteCancelButton")}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (!pendingDelete) return;
          void deleteEvent(pendingDelete.id)
            .then(() => {
              setPendingDelete(null);
              setPanel(null);
              return load();
            })
            .catch((error) => {
              setPendingDelete(null);
              setErrorMessage(error instanceof Error ? error.message : t("calendarSaveError"));
            });
        }}
      />
    </>
  );

  if (variant === "ltf") {
    return (
      <LtfAdminLayout title={t("calendarTitle")} subtitle={t("calendarSubtitle")}>
        {content}
      </LtfAdminLayout>
    );
  }
  if (variant === "club") {
    return (
      <ClubAdminLayout title={t("calendarTitle")} subtitle={t("calendarSubtitle")}>
        {content}
      </ClubAdminLayout>
    );
  }
  return (
    <MemberLayout title={t("calendarTitle")} subtitle={t("calendarSubtitle")}>
      {content}
    </MemberLayout>
  );
}
