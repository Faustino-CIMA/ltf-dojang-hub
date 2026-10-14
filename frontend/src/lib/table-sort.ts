export type SortDirection = "asc" | "desc";

export type TableSort = {
  key: string;
  direction: SortDirection;
};

export function toggleSort(current: TableSort | null | undefined, key: string): TableSort {
  if (!current || current.key !== key) {
    return { key, direction: "asc" };
  }
  return { key, direction: current.direction === "asc" ? "desc" : "asc" };
}

export function toOrderingParam(sort: TableSort | null | undefined): string | undefined {
  if (!sort) {
    return undefined;
  }
  return sort.direction === "desc" ? `-${sort.key}` : sort.key;
}

function isEmptySortValue(value: unknown): boolean {
  return value == null || value === "";
}

export function compareSortValues(left: unknown, right: unknown): number {
  if (isEmptySortValue(left) && isEmptySortValue(right)) {
    return 0;
  }
  if (isEmptySortValue(left)) {
    return 1;
  }
  if (isEmptySortValue(right)) {
    return -1;
  }
  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }
  if (typeof left === "boolean" && typeof right === "boolean") {
    return Number(left) - Number(right);
  }
  return String(left).localeCompare(String(right), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

export function directedCompare(left: unknown, right: unknown, direction: SortDirection): number {
  const result = compareSortValues(left, right);
  if (isEmptySortValue(left) || isEmptySortValue(right)) {
    return result;
  }
  return direction === "asc" ? result : -result;
}

export function sortRowsByKey<T>(
  rows: T[],
  sort: TableSort | null | undefined,
  getters: Record<string, (row: T) => unknown>
): T[] {
  if (!sort) {
    return rows;
  }
  const getValue = getters[sort.key];
  if (!getValue) {
    return rows;
  }
  return [...rows].sort((left, right) => directedCompare(getValue(left), getValue(right), sort.direction));
}
