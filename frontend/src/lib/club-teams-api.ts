import { apiRequest, API_URL } from "@/lib/api";
import { getToken } from "@/lib/auth";
import type { ClothingChoice, RosterGear } from "@/lib/member-gear-api";

export type TeamDiscipline = "kyorugi" | "poomsae";

export type TeamMember = {
  id: number;
  first_name: string;
  last_name: string;
  sex?: string;
  birth_year?: number | null;
  belt_rank?: string;
  age_class?: string;
  poomsae_division?: string;
  latest_weight_kg?: string | null;
  latest_weight_on?: string | null;
  latest_height_cm?: number | null;
  latest_height_on?: string | null;
  weight_category?: string;
  weight_category_reason?: string;
  category_age?: number | null;
  weight_delta_kg?: string | null;
  weight_warning?: boolean;
  licence_status?: string;
  licence_warning?: "" | "expires" | "missing" | string;
  role?: "athlete" | "coach";
  gear?: RosterGear;
  clothing?: ClothingChoice[];
};

export type TeamGroup = {
  id: number;
  kind: "pair" | "team";
  name: string;
  members: Array<{ id: number; first_name: string; last_name: string; sex?: string }>;
};

export type CategorySetCode = "wt" | "be" | "nl" | "de" | "fr" | "at" | "custom";

export type CustomBand = {
  id?: number;
  label: string;
  age_min: number;
  age_max: number;
  sex: "M" | "F" | "X";
  ceilings: number[];
};

export type CategorySetOption = {
  code: string;
  source_note: string;
  age_basis: string;
};

export type ClubTeam = {
  id: number;
  club: number;
  name: string;
  discipline: TeamDiscipline;
  note: string;
  member_count: number;
  athlete_count?: number;
  coach_count?: number;
  suggested_coach_ids?: number[];
  competition_on?: string | null;
  competition_name?: string;
  weight_margin_kg?: string;
  category_set?: CategorySetCode;
  pss_system?: "" | "daedo" | "kpnp";
  archived?: boolean;
  custom_bands?: CustomBand[];
  category_sets?: CategorySetOption[];
  members?: TeamMember[];
  groups?: TeamGroup[];
};

export type ClubTeamInput = {
  club: number;
  name: string;
  discipline: TeamDiscipline;
  note?: string;
  competition_on?: string | null;
  competition_name?: string;
  weight_margin_kg?: string;
  pss_system?: "" | "daedo" | "kpnp";
};

export function getClubTeams(clubId: number, options?: { includeArchived?: boolean }) {
  const archived = options?.includeArchived ? "&archived=all" : "";
  return apiRequest<ClubTeam[]>(`/api/club-management/teams/?club=${clubId}${archived}`);
}

export function getClubTeam(teamId: number) {
  return apiRequest<ClubTeam>(`/api/club-management/teams/${teamId}/`);
}

export function saveClubTeam(id: number | null, input: ClubTeamInput) {
  const shared: Record<string, unknown> = {
    name: input.name,
    discipline: input.discipline,
    note: input.note ?? "",
  };
  if (input.competition_on !== undefined) shared.competition_on = input.competition_on;
  if (input.competition_name !== undefined) shared.competition_name = input.competition_name;
  if (input.weight_margin_kg !== undefined) shared.weight_margin_kg = input.weight_margin_kg;
  if (input.pss_system !== undefined) shared.pss_system = input.pss_system;
  const body = id ? shared : { ...shared, club: input.club };
  return apiRequest<ClubTeam>(`/api/club-management/teams/${id ? `${id}/` : ""}`, {
    method: id ? "PATCH" : "POST",
    body: JSON.stringify(body),
  });
}

export function removeTeamCompetition(teamId: number) {
  return apiRequest<ClubTeam>(`/api/club-management/teams/${teamId}/`, {
    method: "PATCH",
    body: JSON.stringify({ remove_competition: true }),
  });
}

export function saveTeamCompetition(
  teamId: number,
  input: {
    competition_on: string | null;
    competition_name: string;
    weight_margin_kg: string;
    category_set?: string;
    custom_bands?: CustomBand[];
  },
) {
  return apiRequest<ClubTeam>(`/api/club-management/teams/${teamId}/`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function saveTeamWeighIn(teamId: number, measuredOn: string, entries: Array<{ member: number; weight_kg: string }>) {
  return apiRequest<{ created: number; team: ClubTeam }>(`/api/club-management/teams/${teamId}/weigh-in/`, {
    method: "POST",
    body: JSON.stringify({ measured_on: measuredOn, entries }),
  });
}

export function saveTeamGroup(
  teamId: number,
  groupId: number | null,
  input: { kind: "pair" | "team"; name: string; members: number[] },
) {
  return apiRequest<ClubTeam>(`/api/club-management/teams/${teamId}/groups/${groupId ? `${groupId}/` : ""}`, {
    method: groupId ? "PATCH" : "POST",
    body: JSON.stringify(input),
  });
}

export function deleteTeamGroup(teamId: number, groupId: number) {
  return apiRequest<ClubTeam>(`/api/club-management/teams/${teamId}/groups/${groupId}/`, { method: "DELETE" });
}

export async function downloadTeamSheet(teamId: number, format: "csv" | "pdf", lang: string) {
  const token = getToken();
  const response = await fetch(`${API_URL}/api/club-management/teams/${teamId}/sheet.${format}?lang=${encodeURIComponent(lang)}`, {
    headers: { ...(token ? { Authorization: `Token ${token}` } : {}) },
  });
  if (!response.ok) {
    throw new Error("Could not download the team sheet.");
  }
  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `team-${teamId}.${format}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

export type TeamDuplicateResult = {
  team: ClubTeam;
  skipped_left_club: number;
  dropped_groups: Array<{ name: string; kind: "pair" | "team" }>;
};

export type TeamHistoryPerson = {
  id: number;
  first_name: string;
  last_name: string;
  role: "athlete" | "coach";
};

export type TeamHistoryEvent = {
  id: number;
  action: "already" | "added" | "removed" | "role_changed";
  role: "athlete" | "coach";
  previous_role: string;
  first_name: string;
  last_name: string;
  note: string;
  occurred_on: string;
  occurred_time: string;
  actor_name: string;
};

export type TeamHistory = {
  on: string;
  history_started_on: string | null;
  incomplete: boolean;
  roster: TeamHistoryPerson[];
  events: TeamHistoryEvent[];
};

export function getTeamHistory(teamId: number, on: string) {
  return apiRequest<TeamHistory>(`/api/club-management/teams/${teamId}/history/?on=${encodeURIComponent(on)}`);
}

export function duplicateClubTeam(teamId: number, name: string) {
  return apiRequest<TeamDuplicateResult>(`/api/club-management/teams/${teamId}/duplicate/`, {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export function deleteClubTeam(teamId: number) {
  return apiRequest<null>(`/api/club-management/teams/${teamId}/`, { method: "DELETE" });
}

export function addTeamMember(teamId: number, memberId: number, role: "athlete" | "coach" = "athlete") {
  return apiRequest<ClubTeam>(`/api/club-management/teams/${teamId}/members/`, {
    method: "POST",
    body: JSON.stringify({ member: memberId, role }),
  });
}

export function updateTeamMemberRole(teamId: number, memberId: number, role: "athlete" | "coach") {
  return apiRequest<ClubTeam>(`/api/club-management/teams/${teamId}/members/${memberId}/`, {
    method: "PATCH",
    body: JSON.stringify({ role }),
  });
}

export function setTeamArchived(teamId: number, archived: boolean) {
  return apiRequest<ClubTeam>(`/api/club-management/teams/${teamId}/`, {
    method: "PATCH",
    body: JSON.stringify({ archived }),
  });
}

export function bulkTeamMembers(teamId: number, action: "remove" | "coach" | "athlete", members: number[]) {
  return apiRequest<ClubTeam>(`/api/club-management/teams/${teamId}/members/bulk/`, {
    method: "POST",
    body: JSON.stringify({ action, members }),
  });
}

export function removeTeamMember(teamId: number, memberId: number) {
  return apiRequest<ClubTeam>(`/api/club-management/teams/${teamId}/members/${memberId}/`, {
    method: "DELETE",
  });
}
