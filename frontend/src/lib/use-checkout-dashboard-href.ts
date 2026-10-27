"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

import { apiRequest } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { readCheckoutReturn, resolveCheckoutDashboardHref } from "@/lib/checkout-return";
import { getDashboardRouteForRole } from "@/lib/dashboard-routing";

type MeResponse = {
  role: string;
  is_superuser?: boolean;
};

function subscribeToCheckoutReturn(onStoreChange: () => void) {
  if (typeof window === "undefined") {
    return () => undefined;
  }
  window.addEventListener("storage", onStoreChange);
  return () => window.removeEventListener("storage", onStoreChange);
}

export function useCheckoutDashboardHref(locale: string, orderArea?: string | null): string {
  const storedPath = useSyncExternalStore(
    subscribeToCheckoutReturn,
    () => readCheckoutReturn(locale),
    () => null,
  );
  const [roleHref, setRoleHref] = useState<string | null>(null);

  useEffect(() => {
    if (!getToken()) {
      return;
    }
    let cancelled = false;
    apiRequest<MeResponse>("/api/auth/me/")
      .then((me) => {
        if (cancelled) {
          return;
        }
        setRoleHref(
          getDashboardRouteForRole(me.role, locale, {
            isSuperuser: Boolean(me.is_superuser),
          }),
        );
      })
      .catch(() => {
        if (!cancelled) {
          setRoleHref(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [locale]);

  return resolveCheckoutDashboardHref({
    locale,
    storedPath,
    orderArea,
    roleHref,
  });
}
