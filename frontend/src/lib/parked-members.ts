import { apiRequest } from "@/lib/api";

export const PARK_REASON_CODES = [
  "no_club",
  "club_not_found",
  "near_ltf",
  "ambiguous_club",
  "duplicate_clubs",
  "gender_blank",
  "gender_value",
  "end_date",
] as const;

export type ParkReasonCode = (typeof PARK_REASON_CODES)[number];

export type ParkDetail = {
  gender_value?: string;
  end_value?: string;
  matches?: string;
  clubs?: string;
};

export type ParkedMember = {
  id: number;
  first_name: string;
  last_name: string;
  wt_licenseid: string;
  ltf_licenseid: string;
  reasons: string[];
  park_club_text: string;
  park_detail: ParkDetail;
  sex: string;
  club_id: number | null;
  is_active: boolean;
};

type Translator = (key: string, values?: Record<string, string>) => string;

export function parkReasonText(t: Translator, code: string, member: Pick<ParkedMember, "park_club_text" | "park_detail">): string {
  const club = member.park_club_text || member.park_detail.matches || member.park_detail.clubs || "—";
  if (code === "no_club") return t("reason_no_club");
  if (code === "club_not_found") return t("reason_club_not_found", { club });
  if (code === "near_ltf") return t("reason_near_ltf", { club });
  if (code === "ambiguous_club") return t("reason_ambiguous_club", { club: member.park_detail.matches || club });
  if (code === "duplicate_clubs") return t("reason_duplicate_clubs", { clubs: member.park_detail.clubs || club });
  if (code === "gender_blank") return t("reason_gender_blank");
  if (code === "gender_value") return t("reason_gender_value", { value: member.park_detail.gender_value || "—" });
  if (code === "end_date") return t("reason_end_date", { value: member.park_detail.end_value || "—" });
  return code;
}

export function listParkedMembers(reason = "") {
  const query = reason ? `?reason=${encodeURIComponent(reason)}` : "";
  return apiRequest<{ results: ParkedMember[] }>(`/api/parked-members/${query}`);
}

export function resolveParkedMember(
  id: number,
  body: { sex: string; is_active: boolean; club_id?: number; ltf_staff?: boolean }
) {
  return apiRequest<ParkedMember>(`/api/parked-members/${id}/resolve/`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function deleteParkedMember(id: number) {
  return apiRequest<void>(`/api/parked-members/${id}/`, { method: "DELETE" });
}

export function bulkAssignParkedClub(ids: number[], clubId: number) {
  return apiRequest<{ resolved: number; updated: number }>("/api/parked-members/bulk-assign/", {
    method: "POST",
    body: JSON.stringify({ ids, club_id: clubId }),
  });
}

export function bulkDeleteParkedMembers(ids: number[]) {
  return apiRequest<{ deleted: number }>("/api/parked-members/bulk-delete/", {
    method: "POST",
    body: JSON.stringify({ ids, confirm: true }),
  });
}
