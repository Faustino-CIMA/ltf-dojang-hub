import { apiRequest } from "@/lib/api";

export type NationalTeamPerson = {
  id: number;
  first_name: string;
  last_name: string;
  club_id: number | null;
  club_name: string;
};

export type NationalTeamLevel = {
  id: number;
  code: string;
  name: string;
  sort_order: number;
  is_active: boolean;
};

export type NationalTeamSeason = {
  id: number;
  year: number;
  starts_on: string;
  ends_on: string;
};

export type NationalTeamSquad = {
  id: number;
  code: string;
  name: string;
  discipline: string;
  is_active: boolean;
  sort_order: number;
};

export type CoslSnapshot = {
  pathway: string;
  rank: string;
  project: string;
};

export type NationalTeamCoach = {
  id: number;
  first_name: string;
  last_name: string;
  function: string;
};

export type SquadSelectionRow = {
  id: number;
  member: number;
  person: NationalTeamPerson;
  squad: number;
  squad_name: string;
  squad_code: string;
  season: number;
  season_year: number;
  club_id: number | null;
  club_name: string;
  age_class: string;
  weight_category: string;
  is_captain: boolean;
  started_on: string;
  ended_on: string | null;
  is_current: boolean;
  ltf_level: NationalTeamLevel | null;
  cosl: CoslSnapshot | null;
  support: string | null;
  coaches: NationalTeamCoach[];
};

export type AthleteStatusRow = {
  id: number;
  member: number;
  scheme: string;
  started_on: string;
  ended_on: string | null;
  source_note: string;
  cadre_level_id: number | null;
  level: NationalTeamLevel | null;
  cosl_pathway: string;
  cosl_rank: string;
  cosl_project: string;
  support_program: string;
};

export type NationalTeamStaffRow = {
  id: number;
  member: number;
  person: NationalTeamPerson;
  function: string;
  squad: number | null;
  title: string;
  started_on: string;
  ended_on: string | null;
};

export type NationalTeamSettings = {
  forbid_overlapping_squads: boolean;
};

export type AthleteNationalTeam = {
  member: NationalTeamPerson;
  selections: SquadSelectionRow[];
  statuses: AthleteStatusRow[];
  current: {
    ltf_level: { code: string; name: string } | null;
    cosl: CoslSnapshot | null;
    support: string | null;
  };
};

function query(params: Record<string, string | number | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") {
      search.set(key, String(value));
    }
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

export function getNationalTeamSeasons() {
  return apiRequest<NationalTeamSeason[]>("/api/national-team/seasons/");
}

export function saveNationalTeamSeason(id: number | null, input: Partial<NationalTeamSeason>) {
  return apiRequest<NationalTeamSeason>(`/api/national-team/seasons/${id ? `${id}/` : ""}`, {
    method: id ? "PATCH" : "POST",
    body: JSON.stringify(input),
  });
}

export function getNationalTeamSquads() {
  return apiRequest<NationalTeamSquad[]>("/api/national-team/squads/");
}

export function saveNationalTeamSquad(input: { name: string; discipline: string }) {
  return apiRequest<NationalTeamSquad>("/api/national-team/squads/", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getNationalTeamLevels() {
  return apiRequest<NationalTeamLevel[]>("/api/national-team/levels/");
}

export function saveNationalTeamLevel(id: number | null, input: Partial<NationalTeamLevel>) {
  return apiRequest<NationalTeamLevel>(`/api/national-team/levels/${id ? `${id}/` : ""}`, {
    method: id ? "PATCH" : "POST",
    body: JSON.stringify(input),
  });
}

export function getNationalTeamSettings() {
  return apiRequest<NationalTeamSettings>("/api/national-team/settings/");
}

export function saveNationalTeamSettings(input: NationalTeamSettings) {
  return apiRequest<NationalTeamSettings>("/api/national-team/settings/", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function getSquadSelections(filters: { season?: number; squad?: number; club?: number }) {
  return apiRequest<SquadSelectionRow[]>(`/api/national-team/selections/${query(filters)}`);
}

export function saveSquadSelection(id: number | null, input: Record<string, unknown>) {
  return apiRequest<SquadSelectionRow>(`/api/national-team/selections/${id ? `${id}/` : ""}`, {
    method: id ? "PATCH" : "POST",
    body: JSON.stringify(input),
  });
}

export function deleteSquadSelection(id: number) {
  return apiRequest<null>(`/api/national-team/selections/${id}/`, { method: "DELETE" });
}

export function getAthleteStatuses(memberId: number) {
  return apiRequest<AthleteStatusRow[]>(`/api/national-team/statuses/${query({ member: memberId })}`);
}

export function saveAthleteStatus(id: number | null, input: Record<string, unknown>) {
  return apiRequest<AthleteStatusRow>(`/api/national-team/statuses/${id ? `${id}/` : ""}`, {
    method: id ? "PATCH" : "POST",
    body: JSON.stringify(input),
  });
}

export function deleteAthleteStatus(id: number) {
  return apiRequest<null>(`/api/national-team/statuses/${id}/`, { method: "DELETE" });
}

export function getNationalTeamStaff() {
  return apiRequest<NationalTeamStaffRow[]>("/api/national-team/staff/");
}

export function saveNationalTeamStaff(id: number | null, input: Record<string, unknown>) {
  return apiRequest<NationalTeamStaffRow>(`/api/national-team/staff/${id ? `${id}/` : ""}`, {
    method: id ? "PATCH" : "POST",
    body: JSON.stringify(input),
  });
}

export function deleteNationalTeamStaff(id: number) {
  return apiRequest<null>(`/api/national-team/staff/${id}/`, { method: "DELETE" });
}

export type NationalTeamBadge = {
  selected: boolean;
  labels: string[];
};

export function getAthleteNationalTeam(memberId: number) {
  return apiRequest<AthleteNationalTeam>(`/api/national-team/athletes/${memberId}/`);
}

export function getNationalTeamBadge(memberId: number) {
  return apiRequest<NationalTeamBadge>(`/api/national-team/athletes/${memberId}/badge/`);
}
