"use client";

import { useEffect } from "react";

const cache = new Map<string, unknown[]>();

/** Forget stored lists. Tests use this so one case cannot leak into the next. */
export function clearStaleLists() {
  cache.clear();
}

/**
 * Keep the last list on screen while the next request is in flight.
 * The first visit still shows a skeleton. A later visit, or a refresh of the
 * same page, keeps the previous rows until the new ones arrive.
 */
export function useStaleWhileLoading<T>(key: string, fresh: T[], isLoading: boolean) {
  const stored = cache.get(key) as T[] | undefined;
  useEffect(() => {
    if (!isLoading) {
      cache.set(key, fresh);
    }
  }, [fresh, isLoading, key]);

  const rows = isLoading && fresh.length === 0 && stored ? stored : fresh;
  const showSkeleton = isLoading && fresh.length === 0 && !stored;
  return { rows, showSkeleton };
}
