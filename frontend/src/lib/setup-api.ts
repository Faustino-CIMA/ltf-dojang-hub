import { getToken } from "./auth";
import { API_URL, apiRequest } from "./api";
import type { LtfLicensePrefixRewritePolicy } from "./import-api";

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
    admins_not_imported?: number;
    links_unused?: number;
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
  wt_license_id?: string;
  ltf_license_id?: string;
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
  allow_missing_id?: boolean;
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
  mapping?: Record<string, string>;
  ltf_license_prefix_rewrite?: LtfLicensePrefixRewritePolicy;
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

function upload<T>(path: string, file: File, payload: Record<string, unknown>) {
  const body = new FormData();
  body.append("file", file);
  body.append("payload", JSON.stringify(payload));
  return apiRequest<T>(path, { method: "POST", body });
}

export function previewSetupClubs(file: File, payload: Record<string, unknown> = {}) {
  return upload<SetupClubPreview>("/api/setup/clubs/preview/", file, payload);
}

export function confirmSetupClubs(file: File, payload: Record<string, unknown>) {
  return upload("/api/setup/clubs/confirm/", file, payload);
}

export function previewSetupMembers(file: File, payload: Record<string, unknown>) {
  return upload<SetupMemberPreview>("/api/setup/members/preview/", file, payload);
}

export function confirmSetupMembers(file: File, payload: Record<string, unknown>) {
  return upload("/api/setup/members/confirm/", file, payload);
}

export type SetupAdminRow = {
  row_index: number;
  organization: string;
  admin_id: string;
  display_name: string;
  first_name: string;
  last_name: string;
  club_name: string;
  status: string;
  flags: string[];
};

export type SetupAdminPreview = {
  rows: SetupAdminRow[];
  not_imported: string[];
  blank_rows_ignored: number;
  ltf_rows_ignored: number;
  skipped_admin_ids: number;
  can_confirm: boolean;
};

export type SetupAdminRecord = {
  user_id: number;
  username: string;
  first_name: string;
  last_name: string;
  clubs: Array<{ id: number; name: string }>;
  flags: string[];
  link_status: string;
};

export type SetupAdminResult = {
  admins: SetupAdminRecord[];
  not_imported: string[];
  blank_rows_ignored?: number;
  ltf_rows_ignored?: number;
  skipped_admin_ids?: number;
};

export function previewSetupAdmins(file: File) {
  return upload<SetupAdminPreview>("/api/setup/admins/preview/", file, {});
}

export function confirmSetupAdmins(file: File) {
  return upload<SetupAdminPreview & { confirmed: boolean; admins: SetupAdminRecord[] }>("/api/setup/admins/confirm/", file, {});
}

export function getSetupAdmins() {
  return apiRequest<SetupAdminResult>("/api/setup/admins/");
}

export function issueSetupLink(userId: number, locale: string) {
  return apiRequest<{ setup_link: string; expires_at: string; link_status: string }>(
    `/api/setup/admins/${userId}/setup-link/`,
    { method: "POST", body: JSON.stringify({ locale }) }
  );
}

export async function downloadSetupLinks(locale: string) {
  const token = getToken();
  const response = await fetch(`${API_URL}/api/setup/admins/setup-links.csv`, {
    method: "POST",
    headers: {
      ...(token ? { Authorization: `Token ${token}` } : {}),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ locale }),
  });
  if (!response.ok) {
    throw new Error("Download failed");
  }
  const blob = await response.blob();
  const disposition = response.headers.get("Content-Disposition") || "";
  const match = /filename="([^"]+)"/.exec(disposition);
  const filename = match?.[1] || `setup-links-CONFIDENTIAL-${new Date().toISOString().slice(0, 10)}.csv`;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export type AccountSetupAssignment = {
  role: string;
  organisation: string;
};

export type AccountSetupInfo = {
  username: string;
  first_name: string;
  last_name: string;
  assignments: AccountSetupAssignment[];
};

export function getAccountSetup(token: string) {
  return apiRequest<AccountSetupInfo>(`/api/auth/account-setup/?token=${encodeURIComponent(token)}`);
}

export function completeAccountSetup(body: { token: string; email: string; password: string; password_confirm: string }) {
  return apiRequest<{ detail: string }>("/api/auth/account-setup/", { method: "POST", body: JSON.stringify(body) });
}
