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

const HAS_LETTER = /[A-Za-zÀ-ÖØ-öø-ÿ]/;

function digits(value?: string): string {
  return (value || "").replace(/\D/g, "");
}

/** "12 Rue de Test" → number + street. "12 99" and "3rd floor" stay intact. */
function peelLeadingNumber(text: string): { house_number: string; street: string } | null {
  const match = text.trim().match(LEADING_NUMBER);
  if (!match) return null;
  const street = match[2].trim();
  if (!HAS_LETTER.test(street)) return null;
  return { house_number: match[1], street };
}

/**
 * Split a stored address line into the street and house-number fields.
 * A line that also contains a postcode or locality is only split when those
 * parts are already stored in their own fields. Otherwise the line stays as
 * typed, so a reload cannot hide part of it inside a field the form does not show.
 */
export function splitStreetLine(
  line: string,
  stored?: { postal_code?: string; locality?: string },
): { house_number: string; street: string } {
  const original = line.trim().replace(/\s+/g, " ");
  if (!original) return { house_number: "", street: "" };

  const parsed = splitAddressSuggestion(original);
  if (parsed.postal_code || parsed.locality) {
    const storedPostal = digits(stored?.postal_code);
    const storedLocality = (stored?.locality || "").trim().toLowerCase();
    const postalOk = !parsed.postal_code || storedPostal === parsed.postal_code;
    const localityOk = !parsed.locality || storedLocality === parsed.locality.toLowerCase();
    const storedHasPlace = Boolean(storedPostal || storedLocality);
    if (stored && storedHasPlace && postalOk && localityOk) {
      const peeled = peelLeadingNumber(parsed.street);
      return {
        house_number: parsed.house_number || peeled?.house_number || "",
        street: (peeled?.street || parsed.street).trim(),
      };
    }
    return { house_number: "", street: original };
  }

  if (parsed.house_number && parsed.street && HAS_LETTER.test(parsed.street)) {
    return { house_number: parsed.house_number, street: parsed.street };
  }

  const peeled = peelLeadingNumber(original);
  if (peeled) return peeled;
  return { house_number: "", street: original };
}

/** Names for the street field. A full Geoportail label contributes its street name only. */
export function lookupStreetNames(
  streets: string[],
  houses: Array<{ street?: string; label?: string }> = [],
): string[] {
  const names: string[] = [];
  const add = (raw: string | undefined) => {
    const trimmed = (raw || "").trim();
    if (!trimmed) return;
    const name = splitAddressSuggestion(trimmed).street.trim();
    if (!name) return;
    names.push(name);
  };
  streets.forEach(add);
  houses.forEach((house) => add(house.street || house.label));
  return [...new Set(names)];
}

export function joinStreetLine(houseNumber: string, street: string): string {
  return [houseNumber.trim(), street.trim()].filter(Boolean).join(" ");
}
