const EN_MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const MONTH_INDEX_BY_SHORT = new Map(
  EN_MONTH_SHORT.map((label, index) => [label.toLowerCase(), index])
);

const LUXEMBOURG = "Europe/Luxembourg";

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function numericDate(day: number, month: number, year: number): string {
  return `${pad2(day)}.${pad2(month)}.${year}`;
}

function parseIsoDateOnly(value: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  return { year, month, day };
}

function asDate(value: string | Date): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isValidDateParts(year: number, monthIndex: number, day: number): boolean {
  const probe = new Date(Date.UTC(year, monthIndex, day));
  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === monthIndex &&
    probe.getUTCDate() === day
  );
}

function toIsoDate(year: number, monthIndex: number, day: number): string {
  return `${year}-${pad2(monthIndex + 1)}-${pad2(day)}`;
}

function luxembourgParts(value: Date): { year: number; month: number; day: number; hour: number; minute: number } {
  const formatted = new Intl.DateTimeFormat("en-GB", {
    timeZone: LUXEMBOURG,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    Number(formatted.find((part) => part.type === type)?.value ?? "0");
  const hour = pick("hour") === 24 ? 0 : pick("hour");
  return { year: pick("year"), month: pick("month"), day: pick("day"), hour, minute: pick("minute") };
}

export function parseDisplayDateToIso(value: string | null | undefined): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return null;
  }

  const isoDateOnly = parseIsoDateOnly(raw);
  if (isoDateOnly) {
    if (!isValidDateParts(isoDateOnly.year, isoDateOnly.month - 1, isoDateOnly.day)) {
      return null;
    }
    return toIsoDate(isoDateOnly.year, isoDateOnly.month - 1, isoDateOnly.day);
  }

  const dayFirstMatch = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(raw);
  if (dayFirstMatch) {
    const day = Number(dayFirstMatch[1]);
    const month = Number(dayFirstMatch[2]);
    const year = Number(dayFirstMatch[3]);
    const monthIndex = month - 1;
    if (!isValidDateParts(year, monthIndex, day)) {
      return null;
    }
    return toIsoDate(year, monthIndex, day);
  }

  const displayMatch = /^(\d{1,2})\s+([a-zA-Z]{3})\s+(\d{4})$/.exec(raw);
  if (displayMatch) {
    const day = Number(displayMatch[1]);
    const monthIndex = MONTH_INDEX_BY_SHORT.get(displayMatch[2].toLowerCase());
    const year = Number(displayMatch[3]);
    if (monthIndex === undefined || !isValidDateParts(year, monthIndex, day)) {
      return null;
    }
    return toIsoDate(year, monthIndex, day);
  }

  return null;
}

export function formatDateInputValue(value: string | null | undefined): string {
  const iso = parseDisplayDateToIso(value);
  if (!iso) {
    return value ? String(value) : "";
  }
  return formatDisplayDate(iso);
}

export function formatDisplayDate(value: string | Date | null | undefined): string {
  if (!value) {
    return "-";
  }
  if (typeof value === "string") {
    const isoDateOnly = parseIsoDateOnly(value);
    if (isoDateOnly) {
      return numericDate(isoDateOnly.day, isoDateOnly.month, isoDateOnly.year);
    }
  }
  const parsed = asDate(value);
  if (!parsed) {
    return typeof value === "string" ? value : "-";
  }
  const parts = luxembourgParts(parsed);
  return numericDate(parts.day, parts.month, parts.year);
}

export function formatDisplayDateTime(value: string | Date | null | undefined): string {
  if (!value) {
    return "-";
  }
  if (typeof value === "string") {
    const isoDateOnly = parseIsoDateOnly(value);
    if (isoDateOnly) {
      return `${numericDate(isoDateOnly.day, isoDateOnly.month, isoDateOnly.year)} 00:00`;
    }
  }
  const parsed = asDate(value);
  if (!parsed) {
    return typeof value === "string" ? value : "-";
  }
  const parts = luxembourgParts(parsed);
  return `${numericDate(parts.day, parts.month, parts.year)} ${pad2(parts.hour)}:${pad2(parts.minute)}`;
}

export function luxembourgTodayIso(now: Date = new Date()): string {
  const parts = luxembourgParts(now);
  return toIsoDate(parts.year, parts.month - 1, parts.day);
}

export function screenDateLocale(locale: string): string {
  if (locale === "lb") {
    return "de-LU";
  }
  if (locale === "en") {
    return "en-GB";
  }
  return locale;
}
