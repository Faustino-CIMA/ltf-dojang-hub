const STORAGE_KEY = "ltf.checkout.returnPath";

const LOCALES = new Set(["en", "lb"]);

const AREAS = ["ltf-finance", "club", "ltf", "member", "ops"] as const;

export type CheckoutReturnArea = (typeof AREAS)[number];

const AREA_PATH =
  /^\/(en|lb)\/dashboard\/(ltf-finance|club|ltf|member|ops)(\/[A-Za-z0-9/_-]*)?$/;

export type CheckoutReturnLabelKey =
  | "returnClub"
  | "returnLtf"
  | "returnFinance"
  | "returnMember"
  | "returnOps"
  | "returnDashboard";

function isLocale(value: string): boolean {
  return LOCALES.has(value);
}

/**
 * Keep only a same-origin dashboard area. Query strings, other origins, and
 * path tricks are rejected. A deeper dashboard path collapses to its area,
 * and the locale is the page the user is on now.
 */
export function sanitizeCheckoutReturnPath(
  raw: string | null | undefined,
  locale: string,
): string | null {
  if (!isLocale(locale) || typeof raw !== "string") {
    return null;
  }
  if (/[\u0000-\u001f]/.test(raw)) {
    return null;
  }
  const value = raw.trim();
  if (!value || value.length > 200) {
    return null;
  }
  if (!value.startsWith("/") || value.startsWith("//")) {
    return null;
  }
  if (
    value.includes("\\") ||
    value.includes("://") ||
    value.includes("?") ||
    value.includes("#") ||
    value.includes("%") ||
    value.includes("..")
  ) {
    return null;
  }
  const match = AREA_PATH.exec(value);
  if (!match) {
    return null;
  }
  return `/${locale}/dashboard/${match[2]}`;
}

export function dashboardPathForArea(
  area: string | null | undefined,
  locale: string,
): string | null {
  if (!area || !AREAS.includes(area as CheckoutReturnArea)) {
    return null;
  }
  return sanitizeCheckoutReturnPath(`/${locale}/dashboard/${area}`, locale);
}

export function rememberCheckoutReturn(pathname: string, locale: string): void {
  const path = sanitizeCheckoutReturnPath(pathname, locale);
  if (!path || typeof sessionStorage === "undefined") {
    return;
  }
  sessionStorage.setItem(STORAGE_KEY, path);
}

export function readCheckoutReturn(locale: string): string | null {
  if (typeof sessionStorage === "undefined") {
    return null;
  }
  try {
    return sanitizeCheckoutReturnPath(sessionStorage.getItem(STORAGE_KEY), locale);
  } catch {
    return null;
  }
}

export function resolveCheckoutDashboardHref(options: {
  locale: string;
  storedPath?: string | null;
  orderArea?: string | null;
  roleHref?: string | null;
}): string {
  const stored = sanitizeCheckoutReturnPath(options.storedPath, options.locale);
  if (stored) {
    return stored;
  }
  const fromOrder = dashboardPathForArea(options.orderArea, options.locale);
  if (fromOrder) {
    return fromOrder;
  }
  const fromRole = sanitizeCheckoutReturnPath(options.roleHref, options.locale);
  if (fromRole) {
    return fromRole;
  }
  if (isLocale(options.locale)) {
    return `/${options.locale}/dashboard`;
  }
  return "/en/dashboard";
}

export function checkoutReturnLabelKey(href: string, locale: string): CheckoutReturnLabelKey {
  const path = sanitizeCheckoutReturnPath(href, locale);
  if (!path) {
    return "returnDashboard";
  }
  if (path.endsWith("/dashboard/ltf-finance")) {
    return "returnFinance";
  }
  if (path.endsWith("/dashboard/club")) {
    return "returnClub";
  }
  if (path.endsWith("/dashboard/ltf")) {
    return "returnLtf";
  }
  if (path.endsWith("/dashboard/member")) {
    return "returnMember";
  }
  if (path.endsWith("/dashboard/ops")) {
    return "returnOps";
  }
  return "returnDashboard";
}
