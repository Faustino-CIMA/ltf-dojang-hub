import { apiRequest } from "./api";

export type SetupStatus = {
  available: boolean;
  current_step: "clubs" | "members" | "admins" | "done";
  completed: boolean;
  started: boolean;
  ltf_prefix_rewrite: boolean;
  needs_admin_step: boolean;
  counts: {
    clubs: number;
    club_members: number;
    ltf_staff: number;
    admins: number;
  };
  step_results: Record<string, unknown>;
};

export type SetupClubRow = {
  row_index: number;
  name: string;
  federation: "WT" | "ITF";
  rcs_number: string;
  rcs_error: string;
  address_line1: string;
  address_line2: string;
  postal_code: string;
  locality: string;
  disposition: "create" | "update" | "skip";
  errors: string[];
};

export type SetupClubPreview = {
  rows: SetupClubRow[];
  blank_rows_ignored: number;
  ltf_rows_ignored: number;
  can_confirm: boolean;
};

export type SetupMemberRow = {
  row_index: number;
  member_id: string;
  first_name: string;
  last_name: string;
  club_name: string;
  resolution: { kind: string; club_id: number | null; club_name: string };
  sex: string;
  sex_raw: string;
  sex_blocking: boolean;
  skipped: boolean;
  date_of_birth: string | null;
  dob_flag: string;
  primary_license_role: string;
  secondary_license_role: string;
  primary_raw: string;
  secondary_raw: string;
  role_note: string;
  is_active: boolean | null;
  end_unparseable: boolean;
  staff_function: string;
  group_conflict?: boolean;
  also_staff?: boolean;
};

export type SetupMemberPreview = {
  rows: SetupMemberRow[];
  blank_rows_ignored: number;
  gender_summary: Array<{ value: string; count: number }>;
  role_summary: Array<{ value: string; count: number; mapped: string | null }>;
  unknown_clubs: Array<{ name: string; count: number; row_indexes: number[] }>;
  date_of_birth_format: { format: string; ambiguous: boolean; example: string };
  can_confirm: boolean;
  email_ignored: boolean;
  clubs: Array<{ id: number; name: string; federation: string }>;
};

export function getSetupStatus() {
  return apiRequest<SetupStatus>("/api/setup/status/");
}

export function startSetup() {
  return apiRequest<SetupStatus>("/api/setup/start/", { method: "POST" });
}

export function finishSetup() {
  return apiRequest<SetupStatus>("/api/setup/finish/", { method: "POST" });
}

function upload(path: string, file: File, payload: Record<string, unknown>) {
  const body = new FormData();
  body.append("file", file);
  body.append("payload", JSON.stringify(payload));
  return apiRequest<SetupClubPreview & SetupMemberPreview>(path, { method: "POST", body });
}

export function previewSetupClubs(file: File, payload: Record<string, unknown> = {}) {
  return upload("/api/setup/clubs/preview/", file, payload) as Promise<SetupClubPreview>;
}

export function confirmSetupClubs(file: File, payload: Record<string, unknown>) {
  return upload("/api/setup/clubs/confirm/", file, payload);
}

export function previewSetupMembers(file: File, payload: Record<string, unknown>) {
  return upload("/api/setup/members/preview/", file, payload) as Promise<SetupMemberPreview>;
}

export function confirmSetupMembers(file: File, payload: Record<string, unknown>) {
  return upload("/api/setup/members/confirm/", file, payload);
}
