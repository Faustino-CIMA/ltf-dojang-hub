export const NO_CLUB_YET = "__unset__";

export type SetupClubDecision = { none: true } | { staff: true } | { skip: true } | { club_id: number };

type ClubTextRow = { row_index: number; club_name: string };

export function chooseClubForRow(choices: Record<number, string>, rowIndex: number, value: string): Record<number, string> {
  return { ...choices, [rowIndex]: value };
}

export function rowsSharingClubText<T extends ClubTextRow>(rows: T[], clubName: string): T[] {
  const text = clubName.trim().toLowerCase();
  if (!text) {
    return [];
  }
  return rows.filter((row) => row.club_name.trim().toLowerCase() === text);
}

export function applyClubChoiceToSameText<T extends ClubTextRow>(
  choices: Record<number, string>,
  rows: T[],
  source: T,
  value: string,
): Record<number, string> {
  const matches = rowsSharingClubText(rows, source.club_name);
  if (matches.length === 0) {
    return chooseClubForRow(choices, source.row_index, value);
  }
  const next = { ...choices };
  for (const row of matches) {
    next[row.row_index] = value;
  }
  return next;
}

export function clubRowOverrides(choices: Record<number, string>): Record<string, SetupClubDecision> {
  const overrides: Record<string, SetupClubDecision> = {};
  for (const [key, value] of Object.entries(choices)) {
    if (value === NO_CLUB_YET) {
      overrides[key] = { none: true };
    } else if (value === "staff") {
      overrides[key] = { staff: true };
    } else if (value === "skip") {
      overrides[key] = { skip: true };
    } else if (value) {
      overrides[key] = { club_id: Number(value) };
    }
  }
  return overrides;
}

export function parkedAfterClubChoice(parked: Record<number, boolean>, rowIndexes: number[], value: string): Record<number, boolean> {
  const next = { ...parked };
  const leaveWithoutClub = value === NO_CLUB_YET;
  for (const index of rowIndexes) {
    next[index] = leaveWithoutClub;
  }
  return next;
}
