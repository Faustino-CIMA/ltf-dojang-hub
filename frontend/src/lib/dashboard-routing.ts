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
  options?: { isSuperuser?: boolean; lastDesk?: RememberedDesk },
): string | null {
  const last = options?.lastDesk;
  if (last?.desk) {
    const remembered = routeForDesk(last.desk, locale);
    if (remembered) {
      return remembered;
    }
  }
  return getDashboardRouteForRole(role, locale, options);
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
