export const OPS_AUDIT_PAGE_SIZES = ["25", "50", "100", "200"] as const;

export function opsAuditPageSizeKey(userId: number): string {
  return `ops-audit-page-size:${userId}`;
}

/** Up to five page numbers, keeping the current page in view. */
export function opsAuditPageNumbers(current: number, total: number): number[] {
  const safeTotal = Math.max(total, 1);
  const safeCurrent = Math.min(Math.max(current, 1), safeTotal);
  const start = Math.max(1, Math.min(safeCurrent - 2, Math.max(1, safeTotal - 4)));
  const end = Math.min(safeTotal, start + 4);
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

export function opsAuditActionLabel(
  action: string,
  labels: { verify: string; unlock: string },
): string {
  if (action === "member_verification.verify") {
    return labels.verify;
  }
  if (action === "member_verification.unlock") {
    return labels.unlock;
  }
  return action;
}
