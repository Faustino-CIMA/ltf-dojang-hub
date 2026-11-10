export type ClubAdminGrantChoice = "grant" | "already" | "needs-account" | "hidden";

/** Who may see Add club admin, and what that item should do. */
export function clubAdminGrantChoice(input: {
  canGrant: boolean;
  clubId: number | null | undefined;
  accountState?: "none" | "pending" | "active" | "disabled";
  isHomeClubAdmin?: boolean;
}): ClubAdminGrantChoice {
  if (!input.canGrant || input.clubId == null) {
    return "hidden";
  }
  if (input.isHomeClubAdmin) {
    return "already";
  }
  if (!input.accountState || input.accountState === "none") {
    return "needs-account";
  }
  return "grant";
}

export function grantFailureKind(message: string): "limit" | "home" | "already" | "other" {
  if (message.includes("Club admin limit reached")) {
    return "limit";
  }
  if (message.includes("actor_home_club") || message.includes("Not allowed")) {
    return "home";
  }
  if (message.includes("already_admin")) {
    return "already";
  }
  return "other";
}
