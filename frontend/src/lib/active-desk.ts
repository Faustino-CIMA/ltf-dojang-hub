export type DeskChoice = {
  desk: string;
  level: "full" | "read_only" | string;
  club_id: number | null;
  club_name?: string;
};

const STORAGE_KEY = "ltf_active_desk";
const LEVEL_KEY = "ltf_active_desk_level";

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

export function rememberActiveDesk(value: string | null, options?: { silent?: boolean }) {
  if (typeof window === "undefined") {
    return;
  }
  if (value) {
    window.sessionStorage.setItem(STORAGE_KEY, value);
  } else {
    window.sessionStorage.removeItem(STORAGE_KEY);
  }
  if (!options?.silent) {
    window.dispatchEvent(new Event("desk-changed"));
  }
}

export function rememberDeskLevel(level: string | null) {
  if (typeof window === "undefined") {
    return;
  }
  if (level) {
    window.sessionStorage.setItem(LEVEL_KEY, level);
  } else {
    window.sessionStorage.removeItem(LEVEL_KEY);
  }
}

export function readDeskReadOnly(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return window.sessionStorage.getItem(LEVEL_KEY) === "read_only";
}

export function clearActiveDesk() {
  rememberActiveDesk(null);
  rememberDeskLevel(null);
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
  if (path === "/dashboard/ops" || path.startsWith("/dashboard/ops/")) {
    return "ops";
  }
  return null;
}

let opsServerSyncNeeded = false;

export function opsServerSyncPending(): boolean {
  return opsServerSyncNeeded;
}

export function markOpsServerSyncPending() {
  opsServerSyncNeeded = true;
}

export function clearOpsServerSync() {
  opsServerSyncNeeded = false;
}

export function opsDeskChoice(desks: DeskChoice[]): DeskChoice {
  return grantForPath(desks, "ops") ?? { desk: "ops", level: "full", club_id: null };
}

/** Records Ops in this tab before the console opens, without reloading the page being left. */
export function activateOpsDesk(desks: DeskChoice[]): DeskChoice {
  const ops = opsDeskChoice(desks);
  rememberActiveDesk(deskHeaderValue(ops), { silent: true });
  markOpsServerSyncPending();
  return ops;
}

/** Header the switcher should show. The ops console is the Ops desk even if the stored header is older. */
export function displayedDeskHeader(
  pathname: string | null,
  header: string | null,
  desks: DeskChoice[],
): string | null {
  if (pathNeedsDesk(pathname) !== "ops") {
    return header;
  }
  const ops = grantForPath(desks, "ops");
  if (!ops) {
    return header;
  }
  return deskHeaderValue(ops);
}

export function shouldAskDeskSwitch(input: {
  pathname: string | null;
  header: string | null;
  desks: DeskChoice[];
}): boolean {
  const needed = pathNeedsDesk(input.pathname);
  if (!needed || needed === "ops" || input.desks.length < 2) {
    return false;
  }
  if (!grantForPath(input.desks, needed)) {
    return false;
  }
  return !headerMatchesPath(input.header, needed);
}

export function planOpsDeskAlign(input: {
  pathname: string | null;
  header: string | null;
  activeHeader: string | null;
  desks: DeskChoice[];
  serverPending: boolean;
}): { writeHeader: string | null; nextActiveHeader: string | null; sync: DeskChoice | null } {
  if (pathNeedsDesk(input.pathname) !== "ops") {
    return { writeHeader: null, nextActiveHeader: null, sync: null };
  }
  const grant = grantForPath(input.desks, "ops");
  if (!grant) {
    return { writeHeader: null, nextActiveHeader: null, sync: null };
  }
  const header = deskHeaderValue(grant);
  const hadOps = input.header === header;
  return {
    writeHeader: hadOps ? null : header,
    nextActiveHeader: input.activeHeader === header ? null : header,
    sync: hadOps && !input.serverPending ? null : grant,
  };
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

/** A desk that is open right now. A superuser keeps Ops. */
export function fallbackOpenDesk(input: {
  isSuperuser: boolean;
  desks: DeskChoice[];
  role: string;
  homeClubId: number | null;
}): DeskChoice | null {
  if (input.isSuperuser) {
    return input.desks.find((desk) => desk.desk === "ops") ?? { desk: "ops", level: "full", club_id: null };
  }
  return defaultDesk(input.desks, null, input.role, input.homeClubId);
}
