export const PRIORITY_NATIONALITY_CODES = [
  "LU",
  "FR",
  "DE",
  "BE",
  "PT",
  "IT",
  "ES",
  "NL",
  "PL",
  "RO",
  "CV",
  "TH",
] as const;

/** UN members plus common extras, used when Intl.supportedValuesOf is unavailable. */
export const FALLBACK_NATIONALITY_CODES = [
  ...PRIORITY_NATIONALITY_CODES,
  "AD",
  "AE",
  "AF",
  "AL",
  "AM",
  "AO",
  "AR",
  "AT",
  "AU",
  "AZ",
  "BA",
  "BD",
  "BG",
  "BR",
  "BY",
  "CA",
  "CD",
  "CG",
  "CH",
  "CI",
  "CL",
  "CM",
  "CN",
  "CO",
  "CY",
  "CZ",
  "DK",
  "DO",
  "DZ",
  "EE",
  "EG",
  "ET",
  "FI",
  "GB",
  "GE",
  "GH",
  "GN",
  "GR",
  "HR",
  "HU",
  "ID",
  "IE",
  "IL",
  "IN",
  "IQ",
  "IR",
  "IS",
  "JP",
  "KE",
  "KH",
  "KR",
  "KZ",
  "LB",
  "LK",
  "LT",
  "LV",
  "MA",
  "MD",
  "ME",
  "MK",
  "ML",
  "MT",
  "MX",
  "MY",
  "NG",
  "NO",
  "NP",
  "NZ",
  "PE",
  "PH",
  "PK",
  "PS",
  "RS",
  "RU",
  "SE",
  "SG",
  "SI",
  "SK",
  "SN",
  "SY",
  "TN",
  "TR",
  "TW",
  "UA",
  "US",
  "UZ",
  "VN",
  "XK",
  "ZA",
] as const;

export const NATIONALITY_CODES = FALLBACK_NATIONALITY_CODES;

const LEGACY_NATIONALITY_MAP: Record<string, string> = {
  luxembourg: "LU",
  luxembourgeois: "LU",
  lëtzebuergesch: "LU",
  france: "FR",
  french: "FR",
  germany: "DE",
  german: "DE",
  belgium: "BE",
  belgian: "BE",
  portugal: "PT",
  portuguese: "PT",
  italy: "IT",
  italian: "IT",
  spain: "ES",
  spanish: "ES",
  netherlands: "NL",
  dutch: "NL",
  poland: "PL",
  polish: "PL",
  romania: "RO",
  romanian: "RO",
  "cape verde": "CV",
  "cabo verde": "CV",
  thailand: "TH",
  thai: "TH",
  korea: "KR",
  "south korea": "KR",
  "côte d'ivoire": "CI",
  "ivory coast": "CI",
};

export function nationalityCodeFromStored(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  if (trimmed.length === 2) {
    return trimmed.toUpperCase();
  }
  return LEGACY_NATIONALITY_MAP[trimmed.toLowerCase()] ?? trimmed;
}

export function nationalityLabel(code: string, locale: string): string {
  if (!code) {
    return "";
  }
  if (code.length !== 2) {
    return code;
  }
  try {
    return new Intl.DisplayNames([locale, "en"], { type: "region" }).of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

function isoRegionCodes(): string[] {
  try {
    const supported = (Intl as typeof Intl & { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf;
    if (typeof supported === "function") {
      return supported.call(Intl, "region").filter((code) => /^[A-Z]{2}$/.test(code));
    }
  } catch {
    // Use the fallback catalog.
  }
  return [...FALLBACK_NATIONALITY_CODES];
}

export function nationalityOptions(locale: string): Array<{ code: string; name: string }> {
  const unique = [...new Set([...PRIORITY_NATIONALITY_CODES, ...isoRegionCodes()])];
  const names = unique
    .map((code) => ({ code, name: nationalityLabel(code, locale) }))
    .filter((row) => row.name && row.name !== row.code);
  const priority = new Set<string>(PRIORITY_NATIONALITY_CODES);
  const preferred = names.filter((row) => priority.has(row.code));
  const rest = names
    .filter((row) => !priority.has(row.code))
    .sort((a, b) => a.name.localeCompare(b.name, locale));
  return [...preferred, ...rest];
}

export const ADDRESS_COUNTRIES = [
  { name: "Luxembourg", code: "LU", postalDigits: 4, lookup: true },
  { name: "Germany", code: "DE", postalDigits: 5, lookup: false },
  { name: "Belgium", code: "BE", postalDigits: 4, lookup: false },
  { name: "France", code: "FR", postalDigits: 5, lookup: false },
] as const;

export type AddressCountryName = (typeof ADDRESS_COUNTRIES)[number]["name"];

const ADDRESS_COUNTRY_ALIASES: Record<string, AddressCountryName> = {
  lu: "Luxembourg",
  luxembourg: "Luxembourg",
  lëtzebuerg: "Luxembourg",
  luxemburg: "Luxembourg",
  de: "Germany",
  germany: "Germany",
  deutschland: "Germany",
  allemagne: "Germany",
  be: "Belgium",
  belgium: "Belgium",
  belgique: "Belgium",
  belgien: "Belgium",
  fr: "France",
  france: "France",
};

export function normalizeAddressCountry(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "Luxembourg";
  }
  return ADDRESS_COUNTRY_ALIASES[trimmed.toLowerCase()] ?? trimmed;
}

export function addressCountryConfig(country: string) {
  const name = normalizeAddressCountry(country);
  return (
    ADDRESS_COUNTRIES.find((row) => row.name === name) ?? {
      name,
      code: "",
      postalDigits: 12,
      lookup: false,
    }
  );
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
