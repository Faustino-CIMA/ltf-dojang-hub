"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";

import {
  ClubLedgerFilter,
  type ClubLedgerFilterValue,
} from "@/components/club-admin/club-finance-tabs";
import { MemberFilterBar } from "@/components/members/member-filter-bar";

export function FinanceListFilters({
  statusActive,
  onResetStatus,
  status,
  ledger,
  onLedgerChange,
}: {
  statusActive: boolean;
  onResetStatus: () => void;
  status: ReactNode;
  ledger?: ClubLedgerFilterValue;
  onLedgerChange?: (value: ClubLedgerFilterValue) => void;
}) {
  const common = useTranslations("Common");
  const club = useTranslations("ClubAdmin");
  const ledgerActive = ledger != null && ledger !== "all";
  return (
    <MemberFilterBar
      resetLabel={common("resetFilters")}
      onReset={() => {
        onResetStatus();
        onLedgerChange?.("all");
      }}
      groups={[
        {
          id: "status",
          label: common("filterGroupStatus"),
          count: statusActive ? 1 : 0,
          pressedLabel: common("filterGroupCountLabel", {
            label: common("filterGroupStatus"),
            count: statusActive ? 1 : 0,
          }),
          children: status,
        },
        ...(ledger != null && onLedgerChange
          ? [
              {
                id: "ledger",
                label: club("financeLedgerLabel"),
                count: ledgerActive ? 1 : 0,
                pressedLabel: common("filterGroupCountLabel", {
                  label: club("financeLedgerLabel"),
                  count: ledgerActive ? 1 : 0,
                }),
                children: <ClubLedgerFilter value={ledger} onChange={onLedgerChange} />,
              },
            ]
          : []),
      ]}
    />
  );
}
