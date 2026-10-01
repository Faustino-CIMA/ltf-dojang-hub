"use client";

import { useEffect, useState } from "react";

import { useClubSelection } from "@/components/club-selection-provider";
import { getClubFinanceAccess } from "@/lib/clubmgmt-api";

export function useClubFinanceAccess(clubId?: number | null) {
  const { selectedClubId } = useClubSelection();
  const resolvedClubId = clubId ?? selectedClubId;
  const [canRecordPayments, setCanRecordPayments] = useState(false);
  const [mandateRole, setMandateRole] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setIsLoaded(false);
    getClubFinanceAccess(resolvedClubId)
      .then((access) => {
        if (cancelled) {
          return;
        }
        setCanRecordPayments(Boolean(access.can_record_payments));
        setMandateRole(access.mandate_role);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        setCanRecordPayments(false);
        setMandateRole(null);
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoaded(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [resolvedClubId]);

  return { canRecordPayments, mandateRole, isLoaded };
}
