const RCS_RE = /^[A-Z]\d{1,6}$/;

export function normalizeRcsNumber(value: string): string {
  return value.replace(/\s+/g, "").toUpperCase();
}

export function isValidRcsNumber(value: string): boolean {
  const normalized = normalizeRcsNumber(value);
  return normalized === "" || RCS_RE.test(normalized);
}

export const LBR_SEARCH_URL = "https://www.lbr.lu/";
