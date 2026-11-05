export type RememberedDesk = {
  desk: string;
  club_id?: number | null;
  level?: string;
} | null;

export function routeForDesk(desk: string, locale: string): string | null {
  if (desk === "ops") {
    return `/${locale}/dashboard/ops`;
  }
  if (desk === "ltf_admin") {
    return `/${locale}/dashboard/ltf`;
  }
  if (desk === "ltf_finance") {
    return `/${locale}/dashboard/ltf-finance`;
  }
  if (desk === "club_admin" || desk === "coach") {
    return `/${locale}/dashboard/club`;
  }
  if (desk === "member") {
    return `/${locale}/dashboard/member`;
  }
  return null;
}

export function routeAfterSignIn(
  role: string,
  locale: string,
  options?: {
    isSuperuser?: boolean;
    lastDesk?: RememberedDesk;
    desks?: Array<{ desk: string; club_id?: number | null }>;
  },
): string | null {
  const last = options?.lastDesk;
  const desks = options?.desks;
  const lastStillOpen =
    !desks ||
    desks.some(
      (desk) => desk.desk === last?.desk && (desk.club_id ?? null) === (last?.club_id ?? null),
    );
  if (last?.desk && lastStillOpen) {
    const remembered = routeForDesk(last.desk, locale);
    if (remembered) {
      return remembered;
    }
  }
  return getDashboardRouteForRole(role, locale, options);
}

function deskReachesRoleDashboard(desk: string, role: string): boolean {
  if (role === "ltf_admin") {
    return desk === "ltf_admin";
  }
  if (role === "ltf_finance") {
    return desk === "ltf_finance";
  }
  if (role === "club_admin" || role === "coach") {
    return desk === "club_admin" || desk === "coach";
  }
  if (role === "member") {
    return desk === "member";
  }
  return false;
}

/** The ops header link is only for a superuser who cannot open that dashboard from the desk switcher. */
export function showFederationDashboardLink(input: {
  isSuperuser: boolean;
  onOpsDashboard: boolean;
  role: string;
  desks: Array<{ desk: string }>;
}): boolean {
  if (!input.isSuperuser || !input.onOpsDashboard) {
    return false;
  }
  const route = getDashboardRouteForRole(input.role, "en");
  if (!route || route.includes("/dashboard/ops")) {
    return false;
  }
  return !input.desks.some((desk) => deskReachesRoleDashboard(desk.desk, input.role));
}

export function getDashboardRouteForRole(
  role: string,
  locale: string,
  options?: { isSuperuser?: boolean },
): string | null {
  if (options?.isSuperuser) {
    return `/${locale}/dashboard/ops`;
  }
  if (role === "ltf_admin") {
    return `/${locale}/dashboard/ltf`;
  }
  if (role === "ltf_finance") {
    return `/${locale}/dashboard/ltf-finance`;
  }
  if (role === "club_admin" || role === "coach") {
    return `/${locale}/dashboard/club`;
  }
  if (role === "member") {
    return `/${locale}/dashboard/member`;
  }
  return null;
}
