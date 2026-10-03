import { apiRequest } from "./api";

export type EventKind = "calendar" | "kyorugi" | "poomsae";
export type EventOwnerScope = "federation" | "club";
export type EventVisibility = "public" | "internal" | "private" | "shared" | "presidents";

export type CalendarEvent = {
  id: number;
  title: string;
  description: string;
  kind: EventKind;
  owner_scope: EventOwnerScope;
  club: number | null;
  club_name: string | null;
  venue_name: string;
  venue_address: string;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  visibility: EventVisibility;
  audience_clubs: number[];
  created_by: number | null;
  created_at: string;
  updated_at: string;
  can_edit: boolean;
  reminder: EventReminder | null;
};

export type EventReminder = {
  remind_on: string | null;
  snoozed_until: string | null;
  dismissed: boolean;
};

export type CalendarSummary = {
  upcoming_count: number;
  unseen_count: number;
};

export type DueReminder = {
  id: number;
  title: string;
  starts_at: string;
  club_name: string | null;
  remind_on: string;
};

export type EventPayload = {
  title: string;
  description?: string;
  kind?: EventKind;
  owner_scope: EventOwnerScope;
  club?: number | null;
  venue_name?: string;
  venue_address?: string;
  starts_at: string;
  ends_at: string;
  all_day?: boolean;
  visibility?: EventVisibility;
  audience_clubs?: number[];
};

export type EventListQuery = {
  scope?: EventOwnerScope;
  club?: number | null;
  from?: string;
  to?: string;
};

function buildQuery(params: EventListQuery): string {
  const search = new URLSearchParams();
  if (params.scope) search.set("scope", params.scope);
  if (params.club != null) search.set("club", String(params.club));
  if (params.from) search.set("from", params.from);
  if (params.to) search.set("to", params.to);
  const raw = search.toString();
  return raw ? `?${raw}` : "";
}

export function listEvents(params: EventListQuery = {}) {
  return apiRequest<CalendarEvent[]>(`/api/events/${buildQuery(params)}`);
}

export function getEvent(id: number) {
  return apiRequest<CalendarEvent>(`/api/events/${id}/`);
}

export function createEvent(payload: EventPayload) {
  return apiRequest<CalendarEvent>("/api/events/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateEvent(id: number, payload: Partial<EventPayload>) {
  return apiRequest<CalendarEvent>(`/api/events/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteEvent(id: number) {
  return apiRequest<null>(`/api/events/${id}/`, { method: "DELETE" });
}

export function getCalendarSummary(params: EventListQuery = {}) {
  return apiRequest<CalendarSummary>(`/api/events/summary/${buildQuery(params)}`);
}

export function markEventSeen(id: number) {
  return apiRequest<null>(`/api/events/${id}/seen/`, { method: "POST" });
}

export function setEventReminder(id: number, remindOn: string) {
  return apiRequest<EventReminder>(`/api/events/${id}/reminder/`, {
    method: "POST",
    body: JSON.stringify({ remind_on: remindOn }),
  });
}

export function clearEventReminder(id: number) {
  return apiRequest<null>(`/api/events/${id}/reminder/`, { method: "DELETE" });
}

export function snoozeEventReminder(id: number) {
  return apiRequest<EventReminder>(`/api/events/${id}/reminder-snooze/`, { method: "POST" });
}

export function dismissEventReminder(id: number) {
  return apiRequest<EventReminder>(`/api/events/${id}/reminder-dismiss/`, { method: "POST" });
}

export function listDueReminders() {
  return apiRequest<DueReminder[]>("/api/events/reminders/");
}
