export function displayClubName(
  clubId: number | null | undefined,
  name: string | null | undefined,
  labels: { noClub: string; unknownClub?: string },
): string {
  if (clubId == null) {
    return labels.noClub;
  }
  const trimmed = String(name ?? "").trim();
  if (trimmed) {
    return trimmed;
  }
  return labels.unknownClub ?? labels.noClub;
}

export function replaceNoClubToken(text: string, noClub: string): string {
  return text.replaceAll("{{no_club}}", noClub);
}
