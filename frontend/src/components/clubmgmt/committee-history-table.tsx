"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Pencil, SquarePen, Trash2, UserRound } from "lucide-react";

import { EntityTable } from "@/components/club-admin/entity-table";
import { FilterPills } from "@/components/ui/filter-pills";
import { RowActionMenu } from "@/components/ui/row-action-menu";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  committeeRowActionKeys,
  isOpenTerm,
  mandateHolderName,
  mandateSortName,
  termStatus,
  todayIso,
  type TermStatus,
} from "@/lib/committee-terms";
import { formatDisplayDate } from "@/lib/date-display";
import type { TableSort } from "@/lib/table-sort";

export type CommitteeMandateRow = {
  id: number;
  role: string;
  title: string;
  member: number | null;
  member_name: string;
  member_first_name?: string;
  member_last_name?: string;
  person: number | null;
  person_name: string;
  person_first_name?: string;
  person_last_name?: string;
  started_on: string;
  ended_on: string | null;
  notes?: string;
};

type HistoryFilter = "all" | "current" | "past";

const STATUS_TONE: Record<TermStatus, "success" | "info" | "neutral"> = {
  current: "success",
  upcoming: "info",
  past: "neutral",
};

export function CommitteeOfficeMenu({
  mandate,
  today = todayIso(),
  onEdit,
  onReplace,
  onEnd,
  onDelete,
}: {
  mandate: CommitteeMandateRow;
  today?: string;
  onEdit: (mandate: CommitteeMandateRow) => void;
  onReplace: (mandate: CommitteeMandateRow) => void;
  onEnd: (mandate: CommitteeMandateRow) => void;
  onDelete: (mandate: CommitteeMandateRow) => void;
}) {
  const t = useTranslations("ClubMgmt");
  const vacant = !mandate.member && !mandate.person;
  const keys = committeeRowActionKeys({ ...mandate, vacant }, today);
  const byKey = {
    edit: {
      key: "edit",
      label: t("committeeEditTerm"),
      icon: <Pencil aria-hidden="true" />,
      onSelect: () => onEdit(mandate),
    },
    replace: {
      key: "replace",
      label: t("committeeReplaceTerm"),
      icon: <UserRound aria-hidden="true" />,
      onSelect: () => onReplace(mandate),
    },
    end: {
      key: "end",
      label: t("committeeEndTerm"),
      icon: <SquarePen aria-hidden="true" />,
      onSelect: () => onEnd(mandate),
    },
    delete: {
      key: "delete",
      label: t("committeeDeleteTerm"),
      icon: <Trash2 aria-hidden="true" />,
      destructive: true,
      onSelect: () => onDelete(mandate),
    },
  };
  return (
    <RowActionMenu
      label={t("committeeOfficeActions", { role: t(`role_${mandate.role}`) })}
      actions={keys.map((key) => byKey[key])}
    />
  );
}

export function CommitteeHistoryTable({
  mandates,
  canManage,
  today = todayIso(),
  onEdit,
  onReplace,
  onEnd,
  onDelete,
}: {
  mandates: CommitteeMandateRow[];
  canManage: boolean;
  today?: string;
  onEdit: (mandate: CommitteeMandateRow) => void;
  onReplace: (mandate: CommitteeMandateRow) => void;
  onEnd: (mandate: CommitteeMandateRow) => void;
  onDelete: (mandate: CommitteeMandateRow) => void;
}) {
  const t = useTranslations("ClubMgmt");
  const [filter, setFilter] = useState<HistoryFilter>("all");
  const [sort, setSort] = useState<TableSort | null>({ key: "started_on", direction: "desc" });
  const held = useMemo(
    () => mandates.filter((mandate) => mandate.member || mandate.person),
    [mandates],
  );
  const rows = useMemo(() => {
    return held.filter((mandate) => {
      if (filter === "current") {
        return isOpenTerm(mandate, today);
      }
      if (filter === "past") {
        return !isOpenTerm(mandate, today);
      }
      return true;
    });
  }, [filter, held, today]);

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
    <div className="space-y-3">
      <FilterPills
        ariaLabel={t("committeeFilterLabel")}
        layout="wrap"
        value={filter}
        onChange={setFilter}
        options={[
          { value: "all", title: t("committeeFilterAll"), count: held.length },
          {
            value: "current",
            title: t("committeeFilterCurrent"),
            count: held.filter((mandate) => isOpenTerm(mandate, today)).length,
          },
          {
            value: "past",
            title: t("committeeFilterPast"),
            count: held.filter((mandate) => !isOpenTerm(mandate, today)).length,
          },
        ]}
      />
      {rows.length === 0 ? (
        <p className="px-1 py-4 text-sm text-muted">{t("committeeHistoryEmpty")}</p>
      ) : (
        <EntityTable
          rows={rows}
          sort={sort}
          onSortChange={setSort}
          clientSort
          columns={[
            {
              key: "person",
              header: t("committeeColumnPerson"),
              sortable: true,
              sortValue: (row) => mandateSortName(row),
              render: (row) => mandateHolderName(row),
            },
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
              sortValue: (row) => termStatus(row, today),
              render: (row) => {
                const status = termStatus(row, today);
                return <StatusBadge label={statusLabel(status)} tone={STATUS_TONE[status]} />;
              },
            },
            ...(canManage
              ? [
                  {
                    key: "actions",
                    header: <span className="sr-only">{t("committeeRowActions")}</span>,
                    render: (row: CommitteeMandateRow) => (
                      <CommitteeOfficeMenu
                        mandate={row}
                        today={today}
                        onEdit={onEdit}
                        onReplace={onReplace}
                        onEnd={onEnd}
                        onDelete={onDelete}
                      />
                    ),
                  },
                ]
              : []),
          ]}
        />
      )}
    </div>
  );
}
