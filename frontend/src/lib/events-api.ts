import { apiRequest } from "./api";

export type EventKind = "calendar" | "kyorugi" | "poomsae";
export type EventOwnerScope = "federation" | "club";
export type EventVisibility = "public" | "internal" | "private";

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
  created_by: number | null;
  created_at: string;
  updated_at: string;
  can_edit: boolean;
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
