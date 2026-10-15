export type ImportResultCounts = {
  created: number;
  updated?: number;
  skipped: number;
  errors: unknown[];
};

export type ImportResultTone = "success" | "warning" | "error";

export function importResultTone(
  result: ImportResultCounts | null | undefined
): ImportResultTone {
  if (!result) {
    return "error";
  }
  if ((result.errors?.length ?? 0) === 0) {
    return "success";
  }
  if ((result.created ?? 0) + (result.updated ?? 0) > 0) {
    return "warning";
  }
  return "error";
}
