export type ChoiceRow = {
  sheet: string;
  line: number;
  action: string;
  codes: string[];
};

export function isListedDuplicate(row: ChoiceRow): boolean {
  return row.codes.includes("possible_duplicate") || row.action === "update";
}

export function applyListedChoice(
  rows: ChoiceRow[],
  actions: Record<string, string>,
  action: "create" | "update" | "skip",
): Record<string, string> {
  const next = { ...actions };
  for (const row of rows) {
    if (isListedDuplicate(row)) {
      next[`${row.sheet}:${row.line}`] = action;
    }
  }
  return next;
}
