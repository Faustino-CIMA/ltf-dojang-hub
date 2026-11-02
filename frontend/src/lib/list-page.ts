/** Server page size. Matches `API_PAGINATION_MAX_PAGE_SIZE` (default 200). */
export const LIST_SERVER_PAGE_CAP = 200;

export const LIST_PAGE_SIZE_OPTIONS = ["50", "150", "300", "all"] as const;

export type ListPage<T> = {
  count: number;
  results: T[];
};

type SingleRead = { mode: "single"; page: number; pageSize: number };
type WindowRead = {
  mode: "window";
  first: number;
  last: number;
  offset: number;
  size: number;
  serverCap: number;
};
type AllRead = { mode: "all"; serverCap: number };

export type ListReadPlan = SingleRead | WindowRead | AllRead;

export function numericPageSize(choice: string) {
  const size = Number(choice);
  if (!Number.isFinite(size) || size <= 0) {
    return 50;
  }
  return size;
}

/**
 * 50 and 150 are one server page. 300 and All are wider than the server cap,
 * so they are assembled from cap-sized pages.
 */
export function planListRead(choice: string, page: number, serverCap = LIST_SERVER_PAGE_CAP): ListReadPlan {
  if (choice === "all") {
    return { mode: "all", serverCap };
  }
  const size = numericPageSize(choice);
  const safePage = page > 0 ? page : 1;
  if (size <= serverCap) {
    return { mode: "single", page: safePage, pageSize: size };
  }
  const start = (safePage - 1) * size;
  const end = start + size;
  return {
    mode: "window",
    first: Math.floor(start / serverCap) + 1,
    last: Math.floor((end - 1) / serverCap) + 1,
    offset: start - Math.floor(start / serverCap) * serverCap,
    size,
    serverCap,
  };
}

/** Rows shown on one screen. All is the whole result, so there is one page. */
export function displayPageSize(choice: string, totalCount: number) {
  if (choice === "all") {
    return Math.max(totalCount, 1);
  }
  return numericPageSize(choice);
}

/** @deprecated Use displayPageSize for the screen and readListPage for the request. */
export function resolveListPageSize(pageSize: string, totalCount: number, cap = LIST_SERVER_PAGE_CAP) {
  if (pageSize === "all") {
    return Math.min(Math.max(totalCount, 1), cap);
  }
  return Math.min(numericPageSize(pageSize), cap);
}

export async function readListPage<T>(
  choice: string,
  page: number,
  load: (page: number, pageSize: number) => Promise<ListPage<T>>,
  serverCap = LIST_SERVER_PAGE_CAP,
): Promise<ListPage<T>> {
  const plan = planListRead(choice, page, serverCap);
  if (plan.mode === "single") {
    return load(plan.page, plan.pageSize);
  }
  const first = await load(plan.mode === "all" ? 1 : plan.first, plan.serverCap);
  const lastExisting = Math.max(1, Math.ceil(first.count / plan.serverCap));
  const last = plan.mode === "all" ? lastExisting : Math.min(plan.last, lastExisting);
  const startPage = plan.mode === "all" ? 1 : plan.first;
  const pages = [first];
  if (last > startPage) {
    const rest = await Promise.all(
      Array.from({ length: last - startPage }, (_, index) => load(startPage + index + 1, plan.serverCap)),
    );
    pages.push(...rest);
  }
  const flat = pages.flatMap((row) => row.results);
  if (plan.mode === "all") {
    return { count: first.count, results: flat };
  }
  return { count: first.count, results: flat.slice(plan.offset, plan.offset + plan.size) };
}
