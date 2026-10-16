"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { EntityTable } from "@/components/club-admin/entity-table";
import { FormPanel } from "@/components/ui/list-page-chrome";
import { StatusBadge } from "@/components/ui/status-badge";
import { todayIso, type TermStatus } from "@/lib/committee-terms";
import { formatDisplayDate } from "@/lib/date-display";
import type { CommitteeTerm } from "@/lib/club-admin-api";
import type { TableSort } from "@/lib/table-sort";

const STATUS_TONE: Record<TermStatus, "success" | "info" | "neutral"> = {
  current: "success",
  upcoming: "info",
  past: "neutral",
};

export function MemberCommitteePanel({
  terms,
  today = todayIso(),
}: {
  terms: CommitteeTerm[];
  today?: string;
}) {
  const t = useTranslations("ClubMgmt");
  const [sort, setSort] = useState<TableSort | null>({ key: "started_on", direction: "desc" });

  const statusOf = (term: CommitteeTerm): TermStatus => {
    if (term.is_current) {
      return "current";
    }
    if (term.started_on > today && !term.ended_on) {
      return "upcoming";
    }
    return "past";
  };
  const statusLabel = (status: TermStatus) => {
    if (status === "current") {
      return t("current");
    }
    if (status === "upcoming") {
      return t("committeeUpcoming");
    }
    return t("committeeFilterPast");
  };

  return (
    <FormPanel>
      <h2 className="text-section text-foreground">{t("committeeHistoryTitle")}</h2>
      <p className="mt-1 text-sm text-muted">{t("committeeMemberSubtitle")}</p>
      <div className="mt-4">
        {terms.length === 0 ? (
          <p className="text-sm text-muted">{t("committeeHistoryEmpty")}</p>
        ) : (
          <EntityTable
            rows={terms}
            sort={sort}
            onSortChange={setSort}
            clientSort
            columns={[
              {
                key: "role",
                header: t("committeeColumnRole"),
                sortable: true,
                sortValue: (row) => t(`role_${row.role}`),
                render: (row) => (
                  <span>
                    {t(`role_${row.role}`)}
                    {row.title ? <span className="mt-0.5 block text-xs text-muted">{row.title}</span> : null}
                  </span>
                ),
              },
              {
                key: "club",
                header: t("committeeColumnClub"),
                sortable: true,
                sortValue: (row) => row.club_name || row.committee_name,
                render: (row) => row.club_name || row.committee_name,
              },
              {
                key: "started_on",
                header: t("committeeColumnStart"),
                sortable: true,
                sortValue: (row) => row.started_on,
                render: (row) => formatDisplayDate(row.started_on),
              },
              {
                key: "ended_on",
                header: t("committeeColumnEnd"),
                sortable: true,
                sortValue: (row) => row.ended_on ?? "",
                render: (row) => (row.ended_on ? formatDisplayDate(row.ended_on) : "—"),
              },
              {
                key: "status",
                header: t("committeeColumnStatus"),
                sortable: true,
                sortValue: (row) => statusOf(row),
                render: (row) => {
                  const status = statusOf(row);
                  return <StatusBadge label={statusLabel(status)} tone={STATUS_TONE[status]} />;
                },
              },
            ]}
          />
        )}
      </div>
    </FormPanel>
  );
}
