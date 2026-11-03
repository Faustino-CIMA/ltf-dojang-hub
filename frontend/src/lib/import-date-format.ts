import { buildAutoMapping } from "@/lib/import-mapping";

const DATE_FIELDS = [
  { key: "date_of_birth", label: "Date of birth" },
  { key: "membership_end_date", label: "Membership end date" },
];

export const IMPORT_DATE_FORMATS = [
  "YYYY-MM-DD",
  "DD/MM/YYYY",
  "MM/DD/YYYY",
  "DD-MM-YYYY",
  "DD.MM.YYYY",
  "EXCEL",
] as const;

export type ImportDateFormat = (typeof IMPORT_DATE_FORMATS)[number];

export type DateFormatDetection = {
  status: "detected" | "ambiguous" | "empty";
  format: ImportDateFormat | null;
  candidates: ImportDateFormat[];
};

const EMPTY_DETECTION: DateFormatDetection = {
  status: "empty",
  format: null,
  candidates: [],
};

export function isImportDateFormat(value: string): value is ImportDateFormat {
  return (IMPORT_DATE_FORMATS as readonly string[]).includes(value);
}

function isValidYmd(year: number, month: number, day: number): boolean {
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

function isExcelSerial(value: string): boolean {
  if (!/^\d+(\.0+)?$/.test(value)) {
    return false;
  }
  const serial = Number(value);
  if (!Number.isInteger(serial) || serial < 60 || serial > 80000) {
    return false;
  }
  // A column of calendar years (1900–2100) is not an Excel serial date.
  if (serial >= 1900 && serial <= 2100) {
    return false;
  }
  return true;
}

export function formatsForDateValue(value: string): ImportDateFormat[] {
  const text = value.trim().replace(/[ T]\d{1,2}:\d{2}(:\d{2})?(?:[.,]\d+)?$/, "");
  const formats: ImportDateFormat[] = [];

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (iso && isValidYmd(Number(iso[1]), Number(iso[2]), Number(iso[3]))) {
    formats.push("YYYY-MM-DD");
  }

  const dotted = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(text);
  if (dotted && isValidYmd(Number(dotted[3]), Number(dotted[2]), Number(dotted[1]))) {
    formats.push("DD.MM.YYYY");
  }

  const dashed = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(text);
  if (dashed && isValidYmd(Number(dashed[3]), Number(dashed[2]), Number(dashed[1]))) {
    formats.push("DD-MM-YYYY");
  }

  const slash = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  if (slash) {
    const first = Number(slash[1]);
    const second = Number(slash[2]);
    const year = Number(slash[3]);
    if (isValidYmd(year, second, first)) {
      formats.push("DD/MM/YYYY");
    }
    if (isValidYmd(year, first, second)) {
      formats.push("MM/DD/YYYY");
    }
  }

  if (isExcelSerial(text)) {
    formats.push("EXCEL");
  }

  return formats;
}

export function detectDateFormat(values: string[]): DateFormatDetection {
  const samples = values.map((value) => value.trim()).filter((value) => value.length > 0);
  if (samples.length === 0) {
    return EMPTY_DETECTION;
  }

  const possiblePerValue = samples.map((value) => formatsForDateValue(value));
  const recognized = possiblePerValue.filter((formats) => formats.length > 0);
  if (recognized.length === 0) {
    return EMPTY_DETECTION;
  }

  const universal = IMPORT_DATE_FORMATS.filter((format) =>
    recognized.every((formats) => formats.includes(format))
  );
  if (universal.length === 1) {
    return { status: "detected", format: universal[0], candidates: [universal[0]] };
  }
  if (universal.length > 1) {
    return { status: "ambiguous", format: null, candidates: [...universal] };
  }

  const counts = new Map<ImportDateFormat, number>();
  for (const formats of recognized) {
    for (const format of formats) {
      counts.set(format, (counts.get(format) ?? 0) + 1);
    }
  }
  const ranked = [...counts.entries()].sort((left, right) => right[1] - left[1]);
  const [bestFormat, bestCount] = ranked[0];
  const secondCount = ranked[1]?.[1] ?? 0;
  if (bestCount > secondCount && bestCount / samples.length >= 0.8) {
    return { status: "detected", format: bestFormat, candidates: [bestFormat] };
  }
  return {
    status: "ambiguous",
    format: null,
    candidates: ranked.map(([format]) => format),
  };
}

export function dateValuesFromTable(headers: string[], rows: string[][]): string[] {
  const mapping = buildAutoMapping(DATE_FIELDS, headers);
  const indexes = [mapping.date_of_birth, mapping.membership_end_date]
    .filter((header): header is string => Boolean(header))
    .map((header) => headers.indexOf(header))
    .filter((index) => index >= 0);
  if (indexes.length === 0) {
    return [];
  }
  const values: string[] = [];
  for (const row of rows) {
    for (const index of indexes) {
      const value = (row[index] ?? "").trim();
      if (value) {
        values.push(value);
      }
    }
  }
  return values;
}

export function parseCsv(text: string): string[][] {
  const input = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  const pushRow = () => {
    row.push(field.trim());
    field = "";
    if (row.some((cell) => cell.length > 0)) {
      rows.push(row);
    }
    row = [];
  };

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (inQuotes) {
      if (char === '"') {
        if (input[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
      continue;
    }
    if (char === ",") {
      row.push(field.trim());
      field = "";
      continue;
    }
    if (char === "\n" || char === "\r") {
      if (char === "\r" && input[index + 1] === "\n") {
        index += 1;
      }
      pushRow();
      if (rows.length >= 5001) {
        return rows;
      }
      continue;
    }
    field += char;
  }

  if (field.length > 0 || row.length > 0) {
    pushRow();
  }
  return rows.slice(0, 5001);
}
