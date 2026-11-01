import { formatDisplayDate } from "@/lib/date-display";

export type LicenseExpiryHint = "none" | "soon" | "expired" | "ok";

const DAY_MS = 86_400_000;

function dateOnly(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(year, month - 1, day);
  if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) {
    return null;
  }
  return parsed;
}

export function licenseExpiryHint(
  value: string | null | undefined,
  today = new Date(),
): LicenseExpiryHint {
  if (!value) {
    return "none";
  }
  const end = dateOnly(value);
  if (!end) {
    return "none";
  }
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const days = Math.round((end.getTime() - start.getTime()) / DAY_MS);
  if (days < 0) {
    return "expired";
  }
  if (days <= 30) {
    return "soon";
  }
  return "ok";
}

export function formatLicenseExpiry(value: string | null | undefined): string {
  if (!value) {
    return "—";
  }
  const formatted = formatDisplayDate(value);
  return formatted === "-" ? "—" : formatted;
}

export function licenseExpiryClass(hint: LicenseExpiryHint): string | undefined {
  if (hint === "soon") {
    return "text-[var(--badge-warning-fg)]";
  }
  if (hint === "expired") {
    return "text-muted";
  }
  return undefined;
}
