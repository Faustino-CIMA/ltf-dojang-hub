export const MEMBER_UPDATE_MODES = ["create_only", "create_and_update"] as const;

export type MemberUpdateMode = (typeof MEMBER_UPDATE_MODES)[number];

export const DEFAULT_MEMBER_UPDATE_MODE: MemberUpdateMode = "create_only";

export type MemberImportDisposition = "create" | "update" | "skip";

export type MemberPreviewRow = {
  row_index?: number;
  errors?: string[];
  disposition?: MemberImportDisposition;
  changed_fields?: string[];
};

export type MemberRowAction = "create" | "update" | "skip";

export type MemberPreviewOutcome = "create" | "update" | "skip" | "invalid";

export function isMemberUpdateMode(value: string): value is MemberUpdateMode {
  return (MEMBER_UPDATE_MODES as readonly string[]).includes(value);
}

export function defaultMemberRowAction(row: MemberPreviewRow): MemberRowAction {
  if ((row.errors?.length ?? 0) > 0) {
    return "create";
  }
  if (row.disposition === "update") {
    return "update";
  }
  if (row.disposition === "skip") {
    return "skip";
  }
  return "create";
}

export function memberPreviewOutcome(
  row: MemberPreviewRow,
  action: MemberRowAction
): MemberPreviewOutcome {
  if (action === "skip") {
    return "skip";
  }
  if ((row.errors?.length ?? 0) > 0) {
    return "invalid";
  }
  if (row.disposition === "skip") {
    return "skip";
  }
  if (row.disposition === "update") {
    return "update";
  }
  return "create";
}

export function visibleChangedFields(row: MemberPreviewRow, action: MemberRowAction): string[] {
  if (memberPreviewOutcome(row, action) !== "update") {
    return [];
  }
  return row.changed_fields ?? [];
}

export function memberPreviewTotals(
  rows: MemberPreviewRow[],
  actions: Record<number, MemberRowAction>
): { create: number; update: number; skip: number; invalid: number } {
  const totals = { create: 0, update: 0, skip: 0, invalid: 0 };
  for (const row of rows) {
    const action = actions[row.row_index ?? -1] ?? defaultMemberRowAction(row);
    const outcome = memberPreviewOutcome(row, action);
    if (outcome === "invalid") {
      totals.invalid += 1;
    } else if (outcome === "update") {
      totals.update += 1;
    } else if (outcome === "skip") {
      totals.skip += 1;
    } else {
      totals.create += 1;
    }
  }
  return totals;
}
