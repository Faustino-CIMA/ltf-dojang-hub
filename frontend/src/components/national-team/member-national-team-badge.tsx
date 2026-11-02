"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { StatusBadge } from "@/components/ui/status-badge";
import { getNationalTeamBadge, type NationalTeamBadge } from "@/lib/national-team-api";

export function MemberNationalTeamBadge({
  memberId,
  preview,
}: {
  memberId: number;
  preview?: NationalTeamBadge | null;
}) {
  const t = useTranslations("ClubAdmin");
  const [data, setData] = useState<NationalTeamBadge | null>(preview ?? null);

  useEffect(() => {
    let cancelled = false;
    const sync = () => {
      if (preview !== undefined) {
        setData(preview);
        return;
      }
      getNationalTeamBadge(memberId)
        .then((payload) => {
          if (!cancelled) setData(payload);
        })
        .catch(() => {
          if (!cancelled) setData(null);
        });
    };
    sync();
    return () => {
      cancelled = true;
    };
  }, [memberId, preview]);

  if (!data?.selected) {
    return null;
  }

  const detail = data.labels.filter(Boolean).join(", ");

  return (
    <span className="inline-flex max-w-full flex-wrap items-center gap-2">
      <StatusBadge label={t("nationalTeamBadge")} tone="info" />
      {detail ? <span className="text-xs text-muted">{detail}</span> : null}
    </span>
  );
}
