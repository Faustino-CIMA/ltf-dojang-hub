import { routeForDesk } from "@/lib/dashboard-routing";

export function pathIsDeskHome(pathname: string, desk: string, locale: string): boolean {
  const root = routeForDesk(desk, locale);
  if (!root) {
    return false;
  }
  const path = pathname.split("?")[0].replace(/\/$/, "") || "/";
  return path === root;
}

export function isLeavingDeepLink(pathname: string | null, desk: string | null, locale: string): boolean {
  if (!pathname || !desk) {
    return false;
  }
  const root = routeForDesk(desk, locale);
  if (!root) {
    return false;
  }
  const path = pathname.split("?")[0];
  if (path === root) {
    return false;
  }
  return path === root || path.startsWith(`${root}/`) ? path !== root : false;
}

export function showLegacyClubPicker(deskCount: number): boolean {
  return deskCount < 2;
}
