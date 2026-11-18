"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { CalendarRange, ListFilter, Rows3, Search, UserRound } from "lucide-react";

import { EntityTable } from "@/components/club-admin/entity-table";
import { EmptyState } from "@/components/club-admin/empty-state";
import { OpsLayout } from "@/components/ops/ops-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ListActionsRow,
  ListToolbarPanel,
  PageSizeSelect,
  ActionNotices,
} from "@/components/ui/list-page-chrome";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useListPage } from "@/components/ui/use-list-page";
import { apiRequest } from "@/lib/api";
import { formatDisplayDateTime } from "@/lib/date-display";
import {
  OPS_AUDIT_PAGE_SIZES,
  opsAuditActionLabel,
  opsAuditPageNumbers,
  opsAuditPageSizeKey,
} from "@/lib/ops-audit-page";
import { getOpsAudit, type OpsAuditEntry } from "@/lib/ops-api";

const fieldLabelClass = "mb-1 flex items-center gap-2";

export default function OpsAuditPage() {
  const t = useTranslations("Ops");
  const common = useTranslations("Common");
  const locale = useLocale();
  const router = useRouter();
  const [userId, setUserId] = useState<number | null>(null);
  const [pageSize, setPageSize] = useState("50");
  const [pageSizeReady, setPageSizeReady] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [actorInput, setActorInput] = useState("");
  const [actorQuery, setActorQuery] = useState("");
  const [action, setAction] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [rows, setRows] = useState<OpsAuditEntry[]>([]);
  const [actions, setActions] = useState<string[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useListPage(
    [searchQuery, actorQuery, action, from, to, pageSize].join("|"),
  );

  const actionLabels = {
    verify: t("auditActionVerify"),
    unlock: t("auditActionUnlock"),
  };

  useEffect(() => {
    let cancelled = false;
    apiRequest<{ id: number }>("/api/auth/me/")
      .then((me) => {
        if (cancelled) {
          return;
        }
        setUserId(me.id);
        try {
          const stored = window.localStorage.getItem(opsAuditPageSizeKey(me.id));
          if (stored && (OPS_AUDIT_PAGE_SIZES as readonly string[]).includes(stored)) {
            setPageSize(stored);
          }
        } catch {
          // The list still works if this browser blocks storage.
        }
        setPageSizeReady(true);
      })
      .catch(() => {
        if (!cancelled) {
          setPageSizeReady(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!pageSizeReady || userId == null) {
      return;
    }
    try {
      window.localStorage.setItem(opsAuditPageSizeKey(userId), pageSize);
    } catch {
      // Ignore a full or blocked store.
    }
  }, [pageSize, pageSizeReady, userId]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setSearchQuery(searchInput.trim());
      setActorQuery(actorInput.trim());
    }, 300);
    return () => window.clearTimeout(timeoutId);
  }, [actorInput, searchInput]);

  const load = useCallback(async () => {
    if (!pageSizeReady) {
      return;
    }
    setErrorMessage(null);
    setIsLoading(true);
    try {
      const page = await getOpsAudit({
        page: currentPage,
        pageSize: Number(pageSize),
        q: searchQuery || undefined,
        actor: actorQuery || undefined,
        action: action || undefined,
        from: from || undefined,
        to: to || undefined,
      });
      setRows(page.results);
      setTotalCount(page.count);
      setActions(page.actions);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("loadError"));
    } finally {
      setIsLoading(false);
    }
  }, [action, actorQuery, currentPage, from, pageSize, pageSizeReady, searchQuery, t, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const pageSizeNumber = Number(pageSize) || 50;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSizeNumber));

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, setCurrentPage, totalPages]);

  const pageNumbers = opsAuditPageNumbers(currentPage, totalCount === 0 ? 1 : totalPages);

  return (
    <OpsLayout title={t("auditTitle")} subtitle={t("auditSubtitle")} hintSubtitle>
      <ActionNotices error={errorMessage} onDismiss={() => setErrorMessage(null)} />
      <div className="flex flex-col gap-3">
        <ListToolbarPanel
          filtersPlacement="below"
          search={
            <div>
              <Label htmlFor="ops-audit-search" className={fieldLabelClass}>
                <Search className="size-4 text-muted" aria-hidden />
                {t("auditSearch")}
              </Label>
              <Input
                id="ops-audit-search"
                value={searchInput}
                placeholder={t("auditSearchPlaceholder")}
                onChange={(event) => setSearchInput(event.target.value)}
              />
            </div>
          }
          pageSize={
            <div>
              <Label className={fieldLabelClass}>
                <Rows3 className="size-4 text-muted" aria-hidden />
                {common("rowsPerPageLabel")}
              </Label>
              <PageSizeSelect
                value={pageSize}
                onChange={setPageSize}
                options={OPS_AUDIT_PAGE_SIZES}
                ariaLabel={common("rowsPerPageLabel")}
                allLabel={common("rowsPerPageAll")}
              />
            </div>
          }
          filters={
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <Label htmlFor="ops-audit-actor" className={fieldLabelClass}>
                  <UserRound className="size-4 text-muted" aria-hidden />
                  {t("auditActor")}
                </Label>
                <Input
                  id="ops-audit-actor"
                  value={actorInput}
                  onChange={(event) => setActorInput(event.target.value)}
                />
              </div>
              <div>
                <Label className={fieldLabelClass}>
                  <ListFilter className="size-4 text-muted" aria-hidden />
                  {t("auditActionFilter")}
                </Label>
                <Select browsing value={action || "all"} onValueChange={(value) => setAction(value === "all" ? "" : value)}>
                  <SelectTrigger browsing aria-label={t("auditActionFilter")}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("auditActionAll")}</SelectItem>
                    {actions.filter((item) => item && item !== "all").map((item) => (
                      <SelectItem key={item} value={item}>
                        {opsAuditActionLabel(item, actionLabels)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="ops-audit-from" className={fieldLabelClass}>
                  <CalendarRange className="size-4 text-muted" aria-hidden />
                  {t("auditFrom")}
                </Label>
                <Input id="ops-audit-from" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
              </div>
              <div>
                <Label htmlFor="ops-audit-to" className={fieldLabelClass}>
                  <CalendarRange className="size-4 text-muted" aria-hidden />
                  {t("auditTo")}
                </Label>
                <Input id="ops-audit-to" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
              </div>
            </div>
          }
        />
        <ListActionsRow
          actions={<span className="text-sm text-muted">{t("auditCount", { count: totalCount })}</span>}
          pagination={
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
              >
                {t("auditPrevious")}
              </Button>
              {pageNumbers.map((page) => (
                <Button
                  key={page}
                  variant={page === currentPage ? "default" : "outline"}
                  size="sm"
                  aria-current={page === currentPage ? "page" : undefined}
                  aria-label={t("auditPage", { page })}
                  onClick={() => setCurrentPage(page)}
                >
                  {page}
                </Button>
              ))}
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
              >
                {t("auditNext")}
              </Button>
            </div>
          }
        />
        {isLoading ? (
          <EmptyState title={t("auditTitle")} description={t("auditSubtitle")} loading />
        ) : rows.length === 0 ? (
          <EmptyState title={t("auditEmptyTitle")} description={t("auditEmptyBody")} />
        ) : (
          <EntityTable
            columns={[
              {
                key: "created_at",
                header: t("colCreated"),
                render: (row) => formatDisplayDateTime(row.created_at),
              },
              {
                key: "action",
                header: t("colAction"),
                render: (row) => opsAuditActionLabel(row.action, actionLabels),
              },
              { key: "actor_name", header: t("colActor"), render: (row) => row.actor_name || "—" },
              {
                key: "target",
                header: t("colTarget"),
                render: (row) =>
                  row.target_id ? `${row.target_type} #${row.target_id}` : row.target_type || "—",
              },
              { key: "club_name", header: t("auditClub"), render: (row) => row.club_name || "—" },
              { key: "message", header: t("colMessage") },
            ]}
            rows={rows}
            onRowClick={(row) => router.push(`/${locale}/dashboard/ops/audit/${row.id}`)}
          />
        )}
      </div>
    </OpsLayout>
  );
}
