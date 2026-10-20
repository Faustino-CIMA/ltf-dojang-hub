"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { ClubAdminLayout } from "@/components/club-admin/club-admin-layout";
import { LedgerEntryPanel } from "@/components/finance/ledger-entry-panel";
import { ClubFinanceTabs } from "@/components/club-admin/club-finance-tabs";
import { useClubFinanceAccess } from "@/components/club-admin/use-club-finance-access";
import { EmptyState } from "@/components/club-admin/empty-state";
import { EntityTable } from "@/components/club-admin/entity-table";
import { useClubSelection } from "@/components/club-selection-provider";
import { Button } from "@/components/ui/button";
import { FilterPills } from "@/components/ui/filter-pills";
import { Input } from "@/components/ui/input";
import {
  LIST_PAGE_SIZE_CAP,
  ListActionsRow,
  ListPagination,
  ListToolbarPanel,
  PageSizeSelect,
  resolveListPageSize,
  ActionNotices,
} from "@/components/ui/list-page-chrome";
import { StatusBadge } from "@/components/ui/status-badge";
import { getClubExpensesPage } from "@/lib/club-finance-api";
import { formatDisplayDate } from "@/lib/date-display";
import { useConsumeSearchParam } from "@/lib/consume-search-param";
import { FinanceExpense } from "@/lib/ltf-finance-api";

type ExpenseStatusFilter = "all" | "recorded" | "paid" | "void";

export default function ClubExpensesPage() {
  const t = useTranslations("LtfFinance");
  const clubT = useTranslations("ClubAdmin");
  const common = useTranslations("Common");
  const { selectedClubId } = useClubSelection();
  const [entryPanel, setEntryPanel] = useState<{ mode: "create" } | { mode: "edit"; id: number } | null>(null);
  const { canRecordPayments } = useClubFinanceAccess();
  const [expenses, setExpenses] = useState<FinanceExpense[]>([]);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState("50");
  const [statusFilter, setStatusFilter] = useState<ExpenseStatusFilter>("all");
  const [totalCount, setTotalCount] = useState(0);
  const [facetCounts, setFacetCounts] = useState({ all: 0, recorded: 0, paid: 0, void: 0 });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useConsumeSearchParam("create", () => setEntryPanel({ mode: "create" }));
  useConsumeSearchParam("edit", (value) => {
    const id = Number(value);
    if (Number.isInteger(id) && id > 0) {
      setEntryPanel({ mode: "edit", id });
    }
  });
  const requestAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setSearchQuery(searchInput.trim()), 250);
    return () => window.clearTimeout(timeoutId);
  }, [searchInput]);

  const loadExpenses = useCallback(async () => {
    requestAbortRef.current?.abort();
    const controller = new AbortController();
    requestAbortRef.current = controller;
    setIsLoading(true);
    const clubId = selectedClubId ?? undefined;
    const query = { q: searchQuery || undefined, clubId };
    try {
      const [pageResponse, allRes, recordedRes, paidRes, voidRes] = await Promise.all([
        getClubExpensesPage({
          page: currentPage,
          pageSize: resolveListPageSize(pageSize, LIST_PAGE_SIZE_CAP),
          status: statusFilter === "all" ? undefined : statusFilter,
          ...query,
        }, { signal: controller.signal }),
        getClubExpensesPage({ page: 1, pageSize: 1, ...query }, { signal: controller.signal }),
        getClubExpensesPage({ page: 1, pageSize: 1, ...query, status: "recorded" }, { signal: controller.signal }),
        getClubExpensesPage({ page: 1, pageSize: 1, ...query, status: "paid" }, { signal: controller.signal }),
        getClubExpensesPage({ page: 1, pageSize: 1, ...query, status: "void" }, { signal: controller.signal }),
      ]);
      setExpenses(pageResponse.results);
      setTotalCount(pageResponse.count);
      setFacetCounts({ all: allRes.count, recorded: recordedRes.count, paid: paidRes.count, void: voidRes.count });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setErrorMessage(error instanceof Error ? error.message : t("expensesLoadError"));
    } finally {
      if (requestAbortRef.current === controller) requestAbortRef.current = null;
      setIsLoading(false);
    }
  }, [currentPage, pageSize, searchQuery, selectedClubId, statusFilter, t]);

  useEffect(() => { void loadExpenses(); }, [loadExpenses]);
  useEffect(() => () => requestAbortRef.current?.abort(), []);
  useEffect(() => setCurrentPage(1), [searchQuery, pageSize, statusFilter, selectedClubId]);
  const totalPages = Math.max(1, Math.ceil(totalCount / resolveListPageSize(pageSize, totalCount)));

  return (
    <ClubAdminLayout title={t("expensesTitle")} subtitle={t("clubExpensesSubtitle")}>
      <div className="space-y-3">
        <ClubFinanceTabs />
        <ActionNotices error={errorMessage} onDismiss={() => setErrorMessage(null)} />
        <div className="flex flex-col gap-3">
          <ListToolbarPanel
            search={<Input className="w-full max-w-xs" placeholder={t("searchExpensesPlaceholder")} value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />}
            pageSize={<PageSizeSelect value={pageSize} onChange={setPageSize} ariaLabel={common("rowsPerPageLabel")} allLabel={common("rowsPerPageAll")} />}
            filters={
              <FilterPills
                ariaLabel={t("expensesStatusFilterAriaLabel")}
                value={statusFilter}
                onChange={setStatusFilter}
                options={[
                  { value: "all", title: clubT("filterAllTitle"), count: facetCounts.all },
                  { value: "recorded", title: t("expenseStatusRecorded"), count: facetCounts.recorded },
                  { value: "paid", title: common("statusPaid"), count: facetCounts.paid },
                  { value: "void", title: common("statusVoid"), count: facetCounts.void },
                ]}
              />
            }
          />
          <ListActionsRow
            actions={
              canRecordPayments ? (
                <Button variant="primary" onClick={() => setEntryPanel({ mode: "create" })}>
                  {t("recordExpenseAction")}
                </Button>
              ) : null
            }
            pagination={
              <ListPagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPrevious={() => setCurrentPage((p) => Math.max(1, p - 1))}
                onNext={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                pageLabel={clubT("pageLabel", { current: currentPage, total: totalPages })}
                previousLabel={clubT("previousPage")}
                nextLabel={clubT("nextPage")}
              />
            }
          />
        </div>
        {isLoading ? (
          <EmptyState title={t("loadingTitle")} description={t("loadingSubtitle")} loading />
        ) : expenses.length === 0 ? (
          <EmptyState title={t("noExpensesTitle")} description={t("noExpensesSubtitle")} />
        ) : (
          <EntityTable
            columns={[
              { key: "expense_date", header: t("expenseDateLabel"), render: (row: FinanceExpense) => formatDisplayDate(row.expense_date) },
              { key: "expense_number", header: t("expenseNumberLabel") },
              { key: "category_name", header: t("expenseCategoryLabel") },
              { key: "payee", header: t("expensePayeeLabel"), render: (row: FinanceExpense) => row.payee || "-" },
              { key: "description", header: t("expenseDescriptionLabel") },
              { key: "amount", header: t("expenseAmountLabel"), render: (row: FinanceExpense) => `${row.amount} ${row.currency}` },
              {
                key: "status",
                header: t("statusLabel"),
                render: (row: FinanceExpense) => (
                  <StatusBadge
                    label={row.status === "paid" ? common("statusPaid") : row.status === "void" ? common("statusVoid") : t("expenseStatusRecorded")}
                    tone={row.status === "paid" ? "success" : row.status === "void" ? "danger" : "warning"}
                  />
                ),
              },
            ]}
            rows={expenses}
            onRowClick={(row) => setEntryPanel({ mode: "edit", id: row.id })}
          />
        )}
      </div>
      <LedgerEntryPanel
        open={entryPanel !== null}
        kind="expense"
        desk="club"
        mode={entryPanel?.mode ?? "create"}
        entryId={entryPanel?.mode === "edit" ? entryPanel.id : null}
        clubId={selectedClubId}
        onClose={() => setEntryPanel(null)}
        onSaved={async () => {
          setEntryPanel(null);
          await loadExpenses();
        }}
      />
    </ClubAdminLayout>
  );
}
