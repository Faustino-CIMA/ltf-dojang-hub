"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { EntityTable } from "@/components/club-admin/entity-table";
import { StatusBadge } from "@/components/ui/status-badge";
import type { ClubModuleFeeQuote } from "@/lib/ltf-finance-api";
import type { TableSort } from "@/lib/table-sort";

function euro(amount: string | null | undefined): string {
  if (!amount) return "";
  return `€${amount}`;
}

export function ClubModulePrices({ quote }: { quote: ClubModuleFeeQuote }) {
  const t = useTranslations("ClubAdmin");
  const [sort, setSort] = useState<TableSort | null>({ key: "module", direction: "asc" });

  const moduleName = (moduleId: string) => {
    if (moduleId === "club_management") return t("moduleClubManagement");
    if (moduleId === "competition") return t("moduleCompetition");
    if (moduleId === "event_calendar") return t("moduleEventCalendar");
    return moduleId;
  };

  const pricingLabel = (pricing: string | null) => {
    if (pricing === "per_active_member") return t("modulePricesPricingPerMember");
    if (pricing === "flat") return t("modulePricesPricingFlat");
    return t("modulePricesNoPrice");
  };

  return (
    <section className="rounded-[var(--radius-card)] border border-border bg-card p-3">
      <h2 className="text-lg font-semibold text-foreground">{t("modulePricesTitle")}</h2>
      <p className="mt-2 text-sm text-muted">{t("modulePricesSubtitle")}</p>
      <p className="mt-2 text-sm text-muted">{t("modulePricesEstimateHint")}</p>
      <div className="mt-3">
        <EntityTable
          clientSort
          sort={sort}
          onSortChange={setSort}
          rows={quote.modules.map((row) => ({ ...row, id: row.module_id }))}
          columns={[
            {
              key: "module",
              header: t("modulePricesColumnModule"),
              sortable: true,
              sortValue: (row) => moduleName(row.module_id),
              render: (row) => moduleName(row.module_id),
            },
            {
              key: "status",
              header: t("modulePricesColumnStatus"),
              sortable: true,
              sortValue: (row) => (row.enabled ? 1 : 0),
              render: (row) => (
                <StatusBadge
                  label={row.enabled ? t("modulePricesOn") : t("modulePricesOff")}
                  tone={row.enabled ? "success" : "neutral"}
                />
              ),
            },
            {
              key: "pricing",
              header: t("modulePricesColumnPricing"),
              sortable: true,
              sortValue: (row) => row.pricing_type ?? "",
              render: (row) => pricingLabel(row.pricing_type),
            },
            {
              key: "price",
              header: t("modulePricesColumnPrice"),
              sortable: true,
              sortValue: (row) => Number(row.amount ?? 0),
              render: (row) => (row.amount ? `${row.amount} ${row.currency}` : t("modulePricesNoPrice")),
            },
            {
              key: "minimum",
              header: t("modulePricesColumnMinimum"),
              sortable: true,
              sortValue: (row) => Number(row.minimum_amount ?? 0),
              render: (row) => row.minimum_amount ?? "—",
            },
            {
              key: "estimate",
              header: t("modulePricesColumnEstimate"),
              sortable: true,
              sortValue: (row) => Number(row.estimated_amount ?? 0),
              render: (row) => {
                if (!row.has_price || !row.estimated_amount) {
                  return t("modulePricesNoPrice");
                }
                if (row.pricing_type === "per_active_member") {
                  const calculation = t("modulePricesCalculation", {
                    count: String(row.active_member_count),
                    price: euro(row.amount),
                    calculated: euro(row.calculated_amount),
                  });
                  if (row.minimum_applied) {
                    return `${calculation} ${t("modulePricesMinimumLine", {
                      minimum: euro(row.minimum_amount),
                      estimate: euro(row.estimated_amount),
                    })}`;
                  }
                  return calculation;
                }
                return t("modulePricesFlat", { amount: euro(row.estimated_amount) });
              },
            },
          ]}
        />
      </div>
    </section>
  );
}
