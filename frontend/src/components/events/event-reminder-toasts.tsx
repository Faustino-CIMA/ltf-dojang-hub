"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { REMINDER_EVENT } from "@/components/events/use-calendar-attention";
import { Button } from "@/components/ui/button";
import { formatDisplayDateTime } from "@/lib/date-display";
import {
  dismissEventReminder,
  listDueReminders,
  snoozeEventReminder,
  type DueReminder,
} from "@/lib/events-api";

export function EventReminderToasts() {
  const t = useTranslations("Events");
  const [items, setItems] = useState<DueReminder[]>([]);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      setItems(await listDueReminders());
    } catch {
      setItems([]);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      void load();
    }, 60_000);
    const onChange = () => {
      void load();
    };
    window.addEventListener(REMINDER_EVENT, onChange);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener(REMINDER_EVENT, onChange);
    };
  }, [load]);

  const snooze = async (id: number) => {
    setBusyId(id);
    setItems((current) => current.filter((item) => item.id !== id));
    try {
      await snoozeEventReminder(id);
    } catch {
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const dismiss = async (id: number) => {
    setBusyId(id);
    setItems((current) => current.filter((item) => item.id !== id));
    try {
      await dismissEventReminder(id);
    } catch {
      await load();
    } finally {
      setBusyId(null);
    }
  };

  if (items.length === 0) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-[70] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-3">
      {items.map((item) => (
        <div
          key={item.id}
          role="status"
          aria-live="polite"
          className="rounded-[var(--radius-form)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-float)]"
        >
          <p className="text-sm font-semibold text-foreground">{t("calendarReminderTitle")}</p>
          <p className="mt-1 text-sm text-foreground">{item.title}</p>
          <p className="mt-1 text-sm text-muted">
            {formatDisplayDateTime(item.starts_at)}
            {item.club_name ? ` · ${item.club_name}` : ""}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busyId === item.id}
              onClick={() => void snooze(item.id)}
            >
              {t("calendarReminderSnooze")}
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              disabled={busyId === item.id}
              onClick={() => void dismiss(item.id)}
            >
              {t("calendarReminderGotIt")}
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
