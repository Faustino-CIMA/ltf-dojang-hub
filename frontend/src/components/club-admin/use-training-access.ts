"use client";

import { useEffect, useState } from "react";

import { apiRequest } from "@/lib/api";

export function useCanManageTraining() {
  const [canManage, setCanManage] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiRequest<{ role: string; is_superuser?: boolean }>("/api/auth/me/")
      .then((me) => {
        if (!cancelled) {
          setCanManage(me.role === "club_admin" || me.role === "ltf_admin" || Boolean(me.is_superuser));
        }
      })
      .catch(() => {
        if (!cancelled) setCanManage(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return canManage;
}
