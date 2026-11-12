import { apiRequest } from "@/lib/api";

export type AccountState = "none" | "pending" | "active" | "disabled";

export type AccountMatch = {
  user_id: number;
  username: string;
};

export type AccountPreview = {
  member_id: number;
  name: string;
  club_name?: string;
  email?: string;
  account_state: AccountState;
  proposed_username: string;
  reason: string;
  match: AccountMatch | null;
  can_create: boolean;
  can_link: boolean;
  can_copy: boolean;
  minor?: boolean;
  guardian_choices?: Array<{ email: string; name: string; relation: string; suggested: boolean }>;
};

export type CreatedAccount = {
  member_id: number;
  name: string;
  username: string;
  email: string;
  invite_email?: string;
  minor_account?: boolean;
  club_name: string;
};

export type AccountActionResult = {
  created_count: number;
  linked_count: number;
  skipped: { member_id: number; reason: string }[];
  needs_link: { member_id: number; user_id: number; username: string }[];
  csv: string;
  pdf_base64: string;
  copy_link: string;
  created?: CreatedAccount[];
};

export function accountBadgeTone(state: AccountState): "neutral" | "info" | "warning" {
  if (state === "pending") {
    return "warning";
  }
  if (state === "active") {
    return "info";
  }
  return "neutral";
}

export function accountRowAction(
  state: AccountState | undefined,
  hide: boolean,
): "create" | "copy" | null {
  if (hide) {
    return null;
  }
  if (state === "pending") {
    return "copy";
  }
  if (!state || state === "none") {
    return "create";
  }
  return null;
}

/** Edit, then the account action, then Delete. */
export function clubMemberRowActionKeys(state: AccountState | undefined, hide: boolean): string[] {
  const keys = ["edit"];
  const account = accountRowAction(state, hide);
  if (account) {
    keys.push(account);
  }
  keys.push("delete");
  return keys;
}

export function canBulkCreateAccounts(
  selectedIds: readonly number[],
  visible: readonly { id: number; account_state?: AccountState }[],
): boolean {
  const visibleById = new Map(visible.map((member) => [member.id, member]));
  return selectedIds.some((id) => {
    const row = visibleById.get(id);
    if (!row) {
      return true;
    }
    return (row.account_state ?? "none") === "none";
  });
}

export function previewMemberAccounts(memberIds: number[]) {
  const search = new URLSearchParams({ ids: memberIds.join(",") });
  return apiRequest<{ results: AccountPreview[] }>(`/api/members/user-accounts/?${search.toString()}`);
}

export function postMemberAccounts(body: {
  action: "create" | "link" | "copy_link" | "send_invite" | "send_reset";
  member_ids: number[];
  locale: string;
  guardian_emails?: Record<number, string>;
}) {
  return apiRequest<AccountActionResult & { sent?: number; missing_email?: number; failed?: number }>("/api/members/user-accounts/", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
