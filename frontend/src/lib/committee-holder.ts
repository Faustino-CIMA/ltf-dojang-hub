import { formatFullName } from "@/lib/person-name";

export function committeeHolderLabel(
  holder: { first_name?: string | null; last_name?: string | null; club_name?: string | null },
  noClubLabel: string,
): string {
  const name = formatFullName(holder);
  const club = (holder.club_name || "").trim() || noClubLabel;
  return name ? `${name} · ${club}` : club;
}
