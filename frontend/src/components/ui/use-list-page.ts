"use client";

import { useState } from "react";

/**
 * Page 1 is applied in the same render that changes the page size or a filter.
 * A later effect would fetch the old page first, and that page is often empty
 * once the page size is larger.
 */
export function useListPage(resetKey: string) {
  const [page, setPage] = useState(1);
  const [key, setKey] = useState(resetKey);
  if (key !== resetKey) {
    setKey(resetKey);
    setPage(1);
  }
  return [page, setPage] as const;
}
