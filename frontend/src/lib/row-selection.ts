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

/**
 * Toggle one row, or the inclusive range from the last clicked row to this one.
 * `orderedIds` is the current page in the order the table shows it.
 * A shift-click that turns the current row on selects the range. One that turns it off clears the range.
 * Rows outside this page stay as they are.
 */
export function applyRowRangeSelection(
  selected: readonly number[],
  orderedIds: readonly number[],
  id: number,
  anchorId: number | null,
  shiftKey: boolean,
): number[] {
  const isSelected = selected.includes(id);
  const turnOn = !isSelected;
  if (shiftKey && anchorId !== null) {
    const anchorIndex = orderedIds.indexOf(anchorId);
    const targetIndex = orderedIds.indexOf(id);
    if (anchorIndex !== -1 && targetIndex !== -1) {
      const [from, to] = anchorIndex <= targetIndex ? [anchorIndex, targetIndex] : [targetIndex, anchorIndex];
      const rangeIds = orderedIds.slice(from, to + 1);
      const next = new Set(selected);
      if (turnOn) {
        rangeIds.forEach((rowId) => next.add(rowId));
      } else {
        rangeIds.forEach((rowId) => next.delete(rowId));
      }
      return Array.from(next);
    }
  }
  const next = new Set(selected);
  if (isSelected) {
    next.delete(id);
  } else {
    next.add(id);
  }
  return Array.from(next);
}
