export type AddressParts = {
  street: string;
  house_number: string;
  postal_code: string;
  locality: string;
};

const HOUSE_PREFIX = /^(\d+[A-Za-z]?)\s*,\s*(.+)$/;
const POSTAL_IN_REST = /^(.*?)(?:,\s*)?L-(\d{4})\s+(.+)$/i;
const LEADING_NUMBER = /^(\d+[A-Za-z]?)\s+(.+)$/;

export function splitAddressSuggestion(label: string): AddressParts {
  const original = label.trim().replace(/\s+/g, " ");
  if (!original) {
    return { street: "", house_number: "", postal_code: "", locality: "" };
  }
  let houseNumber = "";
  let text = original;
  const houseMatch = text.match(HOUSE_PREFIX);
  if (houseMatch) {
    houseNumber = houseMatch[1];
    text = houseMatch[2].trim();
  }
  const postalMatch = text.match(POSTAL_IN_REST);
  if (postalMatch) {
    return {
      house_number: houseNumber,
      street: postalMatch[1].replace(/,\s*$/, "").trim(),
      postal_code: postalMatch[2],
      locality: postalMatch[3].trim(),
    };
  }
  return { house_number: houseNumber, street: text, postal_code: "", locality: "" };
}

function suggestionHasParts(parsed: AddressParts): boolean {
  return Boolean(parsed.postal_code || parsed.house_number || parsed.locality);
}

/** Fill the fields a suggestion actually contains. Leave the rest as typed. */
export function applyAddressSuggestion<T extends AddressParts>(current: T, suggestion: string): T {
  const parsed = splitAddressSuggestion(suggestion);
  if (!suggestionHasParts(parsed)) {
    return { ...current, street: parsed.street || current.street };
  }
  return {
    ...current,
    street: parsed.street || current.street,
    house_number: parsed.house_number || current.house_number,
    postal_code: parsed.postal_code || current.postal_code,
    locality: parsed.locality || current.locality,
  };
}

/** A postcode typed after the street fills locality only. It does not replace the street. */
export function applyPostalLookup<T extends AddressParts>(
  current: T,
  lookup: { postal_code?: string; locality?: string },
): T {
  return {
    ...current,
    postal_code: current.postal_code || lookup.postal_code || "",
    locality: current.locality || lookup.locality || "",
  };
}

export function splitStreetLine(line: string): { house_number: string; street: string } {
  const parsed = splitAddressSuggestion(line);
  if (parsed.postal_code || parsed.locality) {
    return { house_number: parsed.house_number, street: parsed.street };
  }
  const match = line.trim().match(LEADING_NUMBER);
  if (match) {
    return { house_number: match[1], street: match[2].trim() };
  }
  return { house_number: "", street: line.trim() };
}

export function joinStreetLine(houseNumber: string, street: string): string {
  return [houseNumber.trim(), street.trim()].filter(Boolean).join(" ");
}
