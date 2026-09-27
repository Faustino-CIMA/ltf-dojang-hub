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
