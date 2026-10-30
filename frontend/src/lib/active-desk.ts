export type DeskChoice = {
  desk: string;
  level: "full" | "read_only" | string;
  club_id: number | null;
  club_name?: string;
};

const STORAGE_KEY = "ltf_active_desk";

export function deskHeaderValue(desk: Pick<DeskChoice, "desk" | "club_id">): string {
  if ((desk.desk === "club_admin" || desk.desk === "coach") && desk.club_id) {
    return `${desk.desk}:${desk.club_id}`;
  }
  return desk.desk;
}

export function readActiveDeskHeader(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  const value = window.sessionStorage.getItem(STORAGE_KEY);
  return value && value.trim() ? value : null;
}

export function rememberActiveDesk(value: string | null) {
  if (typeof window === "undefined") {
    return;
  }
  if (value) {
    window.sessionStorage.setItem(STORAGE_KEY, value);
  } else {
    window.sessionStorage.removeItem(STORAGE_KEY);
  }
  window.dispatchEvent(new Event("desk-changed"));
}

export function clearActiveDesk() {
  rememberActiveDesk(null);
}

export function deskMatchesHeader(desk: DeskChoice, header: string | null): boolean {
  if (!header) {
    return false;
  }
  return deskHeaderValue(desk) === header;
}

export function pathNeedsDesk(pathname: string | null): string | null {
  if (!pathname) {
    return null;
  }
  const path = pathname.replace(/^\/[a-z]{2}(?=\/)/, "");
  if (path.startsWith("/dashboard/ltf-finance")) {
    return "ltf_finance";
  }
  if (path.startsWith("/dashboard/ltf")) {
    return "ltf_admin";
  }
  if (path.startsWith("/dashboard/club")) {
    return "club";
  }
  if (path.startsWith("/dashboard/member")) {
    return "member";
  }
  return null;
}

export function headerMatchesPath(header: string | null, needed: string | null): boolean {
  if (!needed || !header) {
    return true;
  }
  if (needed === "club") {
    return header.startsWith("club_admin:") || header.startsWith("coach:") || header === "club_admin" || header === "coach";
  }
  return header === needed || header.startsWith(`${needed}:`);
}

export function grantForPath(desks: DeskChoice[], needed: string | null): DeskChoice | null {
  if (!needed) {
    return null;
  }
  if (needed === "club") {
    return desks.find((desk) => desk.desk === "club_admin" || desk.desk === "coach") ?? null;
  }
  return desks.find((desk) => desk.desk === needed) ?? null;
}

export function defaultDesk(
  desks: DeskChoice[],
  last: { desk: string; club_id: number | null } | null,
  role: string,
  homeClubId: number | null,
): DeskChoice | null {
  if (last) {
    const remembered = desks.find(
      (desk) => desk.desk === last.desk && (desk.club_id ?? null) === (last.club_id ?? null),
    );
    if (remembered) {
      return remembered;
    }
  }
  const sameRole = desks.filter((desk) => desk.desk === role);
  const pool = sameRole.length > 0 ? sameRole : desks;
  return pool.find((desk) => desk.club_id != null && desk.club_id === homeClubId) ?? pool[0] ?? null;
}
