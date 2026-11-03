function formatNamePart(part: string, mode: "first" | "last"): string {
  const trimmed = part.trim();
  if (!trimmed) {
    return "";
  }
  if (mode === "last") {
    return trimmed.toLocaleUpperCase("fr-LU");
  }
  const lower = trimmed.toLocaleLowerCase("fr-LU");
  return lower.charAt(0).toLocaleUpperCase("fr-LU") + lower.slice(1);
}

export function formatFirstName(value: string): string {
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.split("-").map((part) => formatNamePart(part, "first")).join("-"))
    .join(" ");
}

export function formatLastName(value: string): string {
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.split("-").map((part) => formatNamePart(part, "last")).join("-"))
    .join(" ");
}

export type PersonName = {
  first_name?: string | null;
  last_name?: string | null;
};

/** List and table display: family name, then given name. */
export function formatFullName(person: PersonName | null | undefined): string {
  if (!person) {
    return "";
  }
  const last = formatLastName(person.last_name ?? "");
  const first = formatFirstName(person.first_name ?? "");
  return [last, first].filter(Boolean).join(" ");
}

/** Sort key that orders by last name, then first name. */
export function fullNameSortKey(person: PersonName | null | undefined): string {
  if (!person) {
    return "";
  }
  return `${formatLastName(person.last_name ?? "")}\u0000${formatFirstName(person.first_name ?? "")}`;
}
