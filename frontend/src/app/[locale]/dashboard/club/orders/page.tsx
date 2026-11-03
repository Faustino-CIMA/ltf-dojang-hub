"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";

import { ClubAdminLayout } from "@/components/club-admin/club-admin-layout";
import { ClubFinanceTabs, type ClubLedgerFilterValue } from "@/components/club-admin/club-finance-tabs";
import { EmptyState } from "@/components/club-admin/empty-state";
import { EntityTable } from "@/components/club-admin/entity-table";
import { useClubSelection } from "@/components/club-selection-provider";
import { Button } from "@/components/ui/button";
import { ActionNotices, PageSizeSelect } from "@/components/ui/list-page-chrome";
import { useListPage } from "@/components/ui/use-list-page";
import { FinanceListFilters } from "@/components/finance/finance-list-filters";
import { FilterPills } from "@/components/ui/filter-pills";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDisplayDateTime } from "@/lib/date-display";
import { displayPageSize, readListPage } from "@/lib/list-page";
import { FinanceOrder, getClubOrdersPage } from "@/lib/club-finance-api";

type OrderStatusFilter = "all" | "placed" | "delivered" | "cancelled";

function statusQueryForFilter(filter: OrderStatusFilter): string | undefined {
  if (filter === "placed") {
    return "draft,pending";
  }
  if (filter === "delivered") {
    return "paid";
  }
  if (filter === "cancelled") {
    return "cancelled,refunded";
  }
  return undefined;
}

export default function ClubAdminOrdersPage() {
  const t = useTranslations("ClubAdmin");
  const common = useTranslations("Common");
  const locale = useLocale();
  const router = useRouter();
  const { selectedClubId } = useClubSelection();
  const [orders, setOrders] = useState<FinanceOrder[]>([]);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [orderStatusFilter, setOrderStatusFilter] = useState<OrderStatusFilter>("all");
  const [ledgerFilter, setLedgerFilter] = useState<ClubLedgerFilterValue>("all");
  const [pageSize, setPageSize] = useState("50");
  const [totalCount, setTotalCount] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [orderFacetCounts, setOrderFacetCounts] = useState({
    all: 0,
    placed: 0,
    delivered: 0,
    cancelled: 0,
  });
  const requestAbortRef = useRef<AbortController | null>(null);
  const hasLoadedRef = useRef(false);

  const statusFilterParam = statusQueryForFilter(orderStatusFilter);
  const ordersListPageSize = displayPageSize(pageSize, totalCount);
  const [currentPage, setCurrentPage] = useListPage(
    [searchQuery, pageSize, selectedClubId ?? "", orderStatusFilter, ledgerFilter].join("|"),
  );

  const loadData = useCallback(async () => {
    const keepVisible = hasLoadedRef.current;
    requestAbortRef.current?.abort();
    const controller = new AbortController();
    requestAbortRef.current = controller;
    if (!keepVisible) {
      setIsLoading(true);
    }
    setErrorMessage(null);
    const q = searchQuery || undefined;
    const clubId = selectedClubId ?? undefined;
    const ledger = ledgerFilter === "all" ? undefined : ledgerFilter;
    try {
      const [ordersResponse, allCountRes, placedCountRes, deliveredCountRes, cancelledCountRes] =
        await Promise.all([
          readListPage(pageSize, currentPage, (page, size) =>
            getClubOrdersPage(
              {
                page,
                pageSize: size,
                clubId,
                q,
                status: statusFilterParam,
                ledger,
              },
              { signal: controller.signal },
            ),
          ),
          getClubOrdersPage({ page: 1, pageSize: 1, clubId, q, ledger }, { signal: controller.signal }),
          getClubOrdersPage(
            {
              page: 1,
              pageSize: 1,
              clubId,
              q,
              status: "draft,pending",
              ledger,
            },
            { signal: controller.signal }
          ),
          getClubOrdersPage(
            { page: 1, pageSize: 1, clubId, q, status: "paid", ledger },
            { signal: controller.signal }
          ),
          getClubOrdersPage(
            {
              page: 1,
              pageSize: 1,
              clubId,
              q,
              status: "cancelled,refunded",
              ledger,
            },
            { signal: controller.signal }
          ),
        ]);
      setOrders(ordersResponse.results);
      setTotalCount(ordersResponse.count);
      setOrderFacetCounts({
        all: allCountRes.count,
        placed: placedCountRes.count,
        delivered: deliveredCountRes.count,
        cancelled: cancelledCountRes.count,
      });
      hasLoadedRef.current = true;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      setErrorMessage(error instanceof Error ? error.message : t("ordersLoadError"));
    } finally {
      if (requestAbortRef.current === controller) {
        requestAbortRef.current = null;
        if (!keepVisible) {
          setIsLoading(false);
        }
      }
    }
  }, [currentPage, ledgerFilter, pageSize, searchQuery, selectedClubId, statusFilterParam, t]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    return () => {
      requestAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setSearchQuery(searchInput.trim());
    }, 250);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [searchInput]);

  const getOrderStatusMeta = (status: string) => {
    switch (status) {
      case "draft":
      case "pending":
        return { label: t("orderStatusPlaced"), tone: "info" as const };
      case "cancelled":
      case "refunded":
        return { label: t("orderStatusCancelled"), tone: "danger" as const };
      case "paid":
        return { label: t("orderStatusDelivered"), tone: "success" as const };
      default:
        return { label: status, tone: "neutral" as const };
    }
  };

  const getOrderQuantity = (order: FinanceOrder) => {
    if (typeof order.item_quantity === "number") {
      return order.item_quantity;
    }
    return order.items?.reduce((total, item) => total + (item.quantity ?? 0), 0) ?? 0;
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / ordersListPageSize));

  const columns = [
    { key: "order_number", header: t("orderNumberLabel") },
    {
      key: "status",
      header: t("statusLabel"),
      render: (row: FinanceOrder) => {
        const meta = getOrderStatusMeta(row.status);
        return <StatusBadge label={meta.label} tone={meta.tone} />;
      },
    },
    { key: "quantity", header: t("qtyLabel"), render: (row: FinanceOrder) => getOrderQuantity(row) },
    {
      key: "total",
      header: t("totalLabel"),
      render: (row: FinanceOrder) => `${row.total} ${row.currency}`,
    },
    {
      key: "created_at",
      header: t("createdAtLabel"),
      render: (row: FinanceOrder) => formatDisplayDateTime(row.created_at),
    },
  ];

  return (
    <ClubAdminLayout title={t("ordersTitle")} subtitle={t("ordersSubtitle")}>
      <div className="space-y-3">
        <ClubFinanceTabs />
        <ActionNotices error={errorMessage} onDismiss={() => setErrorMessage(null)} />

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-3">
            <div className="flex min-w-[12rem] flex-1 flex-wrap items-end gap-3">
              <div className="min-w-[10rem] flex-1">
                <Input
                  className="w-full max-w-xs"
                  placeholder={t("searchOrdersPlaceholder")}
                  aria-label={t("searchOrdersPlaceholder")}
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                />
              </div>
              <PageSizeSelect
                value={pageSize}
                onChange={setPageSize}
                ariaLabel={common("rowsPerPageLabel")}
                allLabel={common("rowsPerPageAll")}
              />
            </div>

            <div className="min-w-0 border-t border-[var(--border)] pt-3">
              <FinanceListFilters
                statusActive={orderStatusFilter !== "all"}
                onResetStatus={() => setOrderStatusFilter("all")}
                ledger={ledgerFilter}
                onLedgerChange={setLedgerFilter}
                status={
              <FilterPills
                ariaLabel={t("ordersStatusFilterAriaLabel")}
                layout="wrap"
                value={orderStatusFilter}
                onChange={setOrderStatusFilter}
                options={[
                  { value: "all", title: t("filterAllTitle"), count: orderFacetCounts.all },
                  { value: "placed", title: t("orderStatusPlaced"), count: orderFacetCounts.placed },
                  {
                    value: "delivered",
                    title: t("orderStatusDelivered"),
                    count: orderFacetCounts.delivered,
                  },
                  {
                    value: "cancelled",
                    title: t("orderStatusCancelled"),
                    count: orderFacetCounts.cancelled,
                  },
                ]}
              />
                }
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3">
            <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--muted)]">
              <span>{t("pageLabel", { current: currentPage, total: totalPages })}</span>
              <Button
                variant="outline"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              >
                {t("previousPage")}
              </Button>
              <Button
                variant="outline"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
              >
                {t("nextPage")}
              </Button>
            </div>
          </div>
        </div>

        {isLoading ? (
          <EmptyState title={t("loadingTitle")} description={t("loadingSubtitle")} loading />
        ) : orders.length === 0 ? (
          <EmptyState title={t("noOrdersTitle")} description={t("noOrdersSubtitle")} />
        ) : (
          <EntityTable
            columns={columns}
            rows={orders}
            onRowClick={(row) => {
              router.push(`/${locale}/dashboard/club/orders/${row.id}`);
            }}
          />
        )}
      </div>
    </ClubAdminLayout>
  );
}
