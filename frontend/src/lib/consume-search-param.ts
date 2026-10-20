"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** Reads a query flag once, then removes it so a refresh does not reopen the panel. */
export function useConsumeSearchParam(key: string, onValue: (value: string) => void, enabled = true) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const value = searchParams.get(key);
  const onValueRef = useRef(onValue);
  onValueRef.current = onValue;

  useEffect(() => {
    if (!enabled || !value) {
      return;
    }
    onValueRef.current(value);
    const next = new URLSearchParams(searchParams.toString());
    next.delete(key);
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [enabled, key, pathname, router, searchParams, value]);
}
