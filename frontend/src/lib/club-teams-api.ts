import { apiRequest } from "@/lib/api";

export type TeamDiscipline = "kyorugi" | "poomsae";

export type TeamMember = {
  id: number;
  first_name: string;
  last_name: string;
};

export type ClubTeam = {
  id: number;
  club: number;
  name: string;
  discipline: TeamDiscipline;
  note: string;
  member_count: number;
  members?: TeamMember[];
};

export type ClubTeamInput = {
  club: number;
  name: string;
  discipline: TeamDiscipline;
  note?: string;
};

export function getClubTeams(clubId: number) {
  return apiRequest<ClubTeam[]>(`/api/club-management/teams/?club=${clubId}`);
}

export function getClubTeam(teamId: number) {
  return apiRequest<ClubTeam>(`/api/club-management/teams/${teamId}/`);
}

export function saveClubTeam(id: number | null, input: ClubTeamInput) {
  const body = id
    ? { name: input.name, discipline: input.discipline, note: input.note ?? "" }
    : { club: input.club, name: input.name, discipline: input.discipline, note: input.note ?? "" };
  return apiRequest<ClubTeam>(`/api/club-management/teams/${id ? `${id}/` : ""}`, {
    method: id ? "PATCH" : "POST",
    body: JSON.stringify(body),
  });
}

export function deleteClubTeam(teamId: number) {
  return apiRequest<null>(`/api/club-management/teams/${teamId}/`, { method: "DELETE" });
}

export function addTeamMember(teamId: number, memberId: number) {
  return apiRequest<ClubTeam>(`/api/club-management/teams/${teamId}/members/`, {
    method: "POST",
    body: JSON.stringify({ member: memberId }),
  });
}

export function removeTeamMember(teamId: number, memberId: number) {
  return apiRequest<ClubTeam>(`/api/club-management/teams/${teamId}/members/${memberId}/`, {
    method: "DELETE",
  });
}
