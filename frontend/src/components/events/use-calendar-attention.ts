"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

import { getCalendarSummary, type EventListQuery } from "@/lib/events-api";

const ATTENTION_EVENT = "ltf-calendar-attention";
const REMINDER_EVENT = "ltf-calendar-reminders";

export function notifyCalendarAttention() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(ATTENTION_EVENT));
}

export function notifyCalendarReminders() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(REMINDER_EVENT));
}

export function useCalendarAttention(options: {
  enabled: boolean;
  scope?: EventListQuery["scope"];
  clubId?: number | null;
}) {
  const t = useTranslations("Events");
  const pathname = usePathname();
  const [summary, setSummary] = useState({ upcoming_count: 0, unseen_count: 0 });
  const enabled = options.enabled && (options.scope !== "club" || options.clubId != null);
  const scope = options.scope;
  const clubId = options.clubId;

  const load = useCallback(async () => {
    if (!enabled) {
      setSummary({ upcoming_count: 0, unseen_count: 0 });
      return;
    }
    try {
      const row = await getCalendarSummary({
        scope,
        club: scope === "club" ? clubId : undefined,
      });
      setSummary(row);
    } catch {
      setSummary({ upcoming_count: 0, unseen_count: 0 });
    }
  }, [clubId, enabled, scope]);

  useEffect(() => {
    void load();
  }, [load, pathname]);

  useEffect(() => {
    const onChange = () => {
      void load();
    };
    window.addEventListener(ATTENTION_EVENT, onChange);
    return () => window.removeEventListener(ATTENTION_EVENT, onChange);
  }, [load]);

  if (!enabled || summary.upcoming_count < 1) {
    return {};
  }
  return {
    badgeCount: summary.upcoming_count,
    badgeNew: summary.unseen_count > 0 ? t("calendarNavNew") : undefined,
  };
}

export { REMINDER_EVENT };
