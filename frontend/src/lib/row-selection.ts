export type HeaderCheck = boolean | "indeterminate";

export function visibleHeaderCheck(selected: readonly number[], visibleIds: readonly number[]): HeaderCheck {
  if (visibleIds.length === 0) {
    return false;
  }
  const selectedSet = new Set(selected);
  const onPage = visibleIds.filter((id) => selectedSet.has(id)).length;
  if (onPage === 0) {
    return false;
  }
  if (onPage === visibleIds.length) {
    return true;
  }
  return "indeterminate";
}

export function offPageSelectedCount(selected: readonly number[], visibleIds: readonly number[]): number {
  const visible = new Set(visibleIds);
  return selected.filter((id) => !visible.has(id)).length;
}

/** Select or clear only the rows on this page. Rows on other pages of the same list stay selected. */
export function togglePageSelection(selected: readonly number[], visibleIds: readonly number[]): number[] {
  const visible = new Set(visibleIds);
  const allVisible = visibleIds.length > 0 && visibleIds.every((id) => selected.includes(id));
  if (allVisible) {
    return selected.filter((id) => !visible.has(id));
  }
  const next = new Set(selected);
  for (const id of visibleIds) {
    next.add(id);
  }
  return Array.from(next);
}

/** Drop ids that are no longer in the filtered set. */
export function pruneSelection(selected: readonly number[], allowedIds: readonly number[]): number[] {
  const allowed = new Set(allowedIds);
  return selected.filter((id) => allowed.has(id));
}
