"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { notifyCalendarReminders } from "@/components/events/use-calendar-attention";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormPanel } from "@/components/ui/list-page-chrome";
import { apiRequest } from "@/lib/api";
import { clearEventReminder, setEventReminder, type EventReminder } from "@/lib/events-api";

function toDateInput(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function todayInput(): string {
  return toDateInput(new Date().toISOString());
}

type EventReminderPanelProps = {
  eventId: number;
  startsAt: string;
  endsAt: string;
  initial: EventReminder | null;
};

export function EventReminderPanel({ eventId, startsAt, endsAt, initial }: EventReminderPanelProps) {
  const t = useTranslations("Events");
  const suggested = toDateInput(startsAt);
  const today = todayInput();
  const defaultDay = suggested && suggested < today ? today : suggested;
  const [remindOn, setRemindOn] = useState(initial?.remind_on || defaultDay);
  const [savedOn, setSavedOn] = useState(initial?.remind_on ?? "");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [isClubAdmin, setIsClubAdmin] = useState(false);
  const ended = new Date(endsAt).getTime() < Date.now();

  useEffect(() => {
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
  }, []);

  if (!isClubAdmin || (ended && !savedOn)) {
    return null;
  }

  const save = async () => {
    if (!remindOn) {
      setErrorMessage(t("calendarReminderNeedDate"));
      return;
    }
    setBusy(true);
    setErrorMessage(null);
    try {
      const saved = await setEventReminder(eventId, remindOn);
      setSavedOn(saved.remind_on ?? remindOn);
      setRemindOn(saved.remind_on ?? remindOn);
      notifyCalendarReminders();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("calendarSaveError"));
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    setBusy(true);
    setErrorMessage(null);
    try {
      await clearEventReminder(eventId);
      setSavedOn("");
      notifyCalendarReminders();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("calendarSaveError"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormPanel className="mb-4">
      <div className="grid max-w-sm gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="remind-on">{t("calendarReminderOn")}</Label>
          <Input
            id="remind-on"
            type="date"
            value={remindOn}
            disabled={busy || ended}
            onChange={(event) => setRemindOn(event.target.value)}
          />
        </div>
        {savedOn ? <p className="text-sm text-muted">{t("calendarReminderSet")}</p> : null}
        {errorMessage ? <p className="text-sm text-destructive">{errorMessage}</p> : null}
        <div className="flex flex-wrap gap-2">
          {ended ? null : (
            <Button type="button" variant="primary" disabled={busy} onClick={() => void save()}>
              {t("calendarReminderSave")}
            </Button>
          )}
          {savedOn ? (
            <Button type="button" variant="outline" disabled={busy} onClick={() => void clear()}>
              {t("calendarReminderClear")}
            </Button>
          ) : null}
        </div>
      </div>
    </FormPanel>
  );
}
