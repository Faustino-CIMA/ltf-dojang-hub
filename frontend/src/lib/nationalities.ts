import { ISO_3166_1_ALIASES, ISO_3166_1_ALPHA_2 } from "@/lib/iso-3166-1-alpha-2";

export const ISO_3166_1_CODES = ISO_3166_1_ALPHA_2;

export function nationalityCodeFromStored(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  if (/^[a-z]{2}$/i.test(trimmed)) {
    return trimmed.toUpperCase();
  }
  return ISO_3166_1_ALIASES[trimmed.toLocaleLowerCase()] ?? trimmed;
}

export function nationalityLabel(code: string, locale: string): string {
  if (!code) {
    return "";
  }
  if (!/^[a-z]{2}$/i.test(code)) {
    return code;
  }
  try {
    return new Intl.DisplayNames([locale, "en"], { type: "region" }).of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

const collatorCache = new Map<string, Intl.Collator>();

function nameCollator(locale: string): Intl.Collator {
  const cached = collatorCache.get(locale);
  if (cached) {
    return cached;
  }
  const collator = new Intl.Collator(locale, { usage: "sort", sensitivity: "variant" });
  collatorCache.set(locale, collator);
  return collator;
}

/** Every ISO 3166-1 country, labelled and sorted for the active locale. */
export function nationalityOptions(locale: string): Array<{ code: string; name: string }> {
  const collator = nameCollator(locale);
  return ISO_3166_1_CODES.map((code) => ({ code, name: nationalityLabel(code, locale) || code })).sort(
    (left, right) => collator.compare(left.name, right.name) || left.code.localeCompare(right.code),
  );
}

const POSTAL_RULES: Record<string, { postalDigits: number; lookup: boolean }> = {
  LU: { postalDigits: 4, lookup: true },
  DE: { postalDigits: 5, lookup: false },
  BE: { postalDigits: 4, lookup: false },
  FR: { postalDigits: 5, lookup: false },
};

export function normalizeAddressCountry(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "LU";
  }
  return nationalityCodeFromStored(trimmed);
}

export function addressCountryConfig(country: string) {
  const code = normalizeAddressCountry(country);
  const rule = POSTAL_RULES[code];
  return {
    name: nationalityLabel(code, "en") || code,
    code,
    postalDigits: rule?.postalDigits ?? 12,
    lookup: rule?.lookup ?? false,
  };
}

export const PHONE_LABELS = ["mobile", "home", "work", "other"] as const;
export type PhoneLabel = (typeof PHONE_LABELS)[number];

export function normalizePhoneLabel(value: string): PhoneLabel | "" {
  const raw = value.trim().toLowerCase();
  if (!raw) {
    return "";
  }
  if ((PHONE_LABELS as readonly string[]).includes(raw)) {
    return raw as PhoneLabel;
  }
  if (raw.includes("mob") || raw.includes("cell")) return "mobile";
  if (raw.includes("home") || raw.includes("priv")) return "home";
  if (raw.includes("work") || raw.includes("office") || raw.includes("bureau")) return "work";
  return "other";
}
