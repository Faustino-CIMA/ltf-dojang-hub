"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Pencil, Trash2, X } from "lucide-react";

import { ClubFormPanel } from "@/components/ltf-admin/club-form-panel";
import { PopoverSelect } from "@/components/ui/popover-select";
import { LtfAdminLayout } from "@/components/ltf-admin/ltf-admin-layout";
import { EmptyState } from "@/components/club-admin/empty-state";
import { EntityTable } from "@/components/club-admin/entity-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { ActionMenu } from "@/components/ui/action-menu";
import { RowActionMenu } from "@/components/ui/row-action-menu";
import { DeleteConfirmModal } from "@/components/ui/delete-confirm-modal";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  ListActionsRow,
  ListPagination,
  ListToolbarPanel,
  PageSizeSelect,
  SelectionMeta,
  ActionNotices
} from "@/components/ui/list-page-chrome";
import { useListPage } from "@/components/ui/use-list-page";
import { useClubSelection } from "@/components/club-selection-provider";
import { Club, deleteClub, getClubs } from "@/lib/ltf-admin-api";
import { useConsumeSearchParam } from "@/lib/consume-search-param";
import { sortRowsByKey, type TableSort } from "@/lib/table-sort";
import { offPageSelectedCount, togglePageSelection, visibleHeaderCheck } from "@/lib/row-selection";

export default function LtfAdminClubsPage() {
  const t = useTranslations("LtfAdmin");
  const importT = useTranslations("Import");
  const common = useTranslations("Common");
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const locale = pathname?.split("/")[1] || "en";
  const issue = searchParams.get("issue") === "no_admin" ? "no_admin" : null;
  const [clubs, setClubs] = useState<Club[]>([]);
  const [clubToDelete, setClubToDelete] = useState<Club | null>(null);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isBatchDeleteOpen, setIsBatchDeleteOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [federationFilter, setFederationFilter] = useState("all");
  const [pageSize, setPageSize] = useState("50");
  const [tableSort, setTableSort] = useState<TableSort | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingClub, setEditingClub] = useState<Club | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { selectedClubId } = useClubSelection();
  const [currentPage, setCurrentPage] = useListPage(
    [
      federationFilter,
      searchQuery,
      pageSize,
      selectedClubId ?? "",
      tableSort?.key ?? "",
      tableSort?.direction ?? "",
    ].join("|"),
  );

  const loadClubs = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const clubsResponse = await getClubs(issue ? { issue } : undefined);
      setClubs(clubsResponse);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load clubs.");
    } finally {
      setIsLoading(false);
    }
  }, [issue]);

  useEffect(() => {
    void loadClubs();
  }, [loadClubs]);

  useConsumeSearchParam("create", () => setCreateOpen(true));

  const dismissIssueFilter = () => {
    router.replace(`/${locale}/dashboard/ltf/clubs`);
  };

  const searchedClubs = useMemo(() => {
    const scopedClubs = (selectedClubId
      ? clubs.filter((club) => club.id === selectedClubId)
      : clubs
    ).filter((club) => federationFilter === "all" || club.federation === federationFilter);
    const normalizedQuery = searchQuery.trim().toLowerCase();
    if (!normalizedQuery) {
      return scopedClubs;
    }
    return scopedClubs.filter((club) => {
      const name = club.name.toLowerCase();
      const locality = (club.locality || club.city || "").toLowerCase();
      const postalCode = (club.postal_code || "").toLowerCase();
      const address = (club.address_line1 || club.address || "").toLowerCase();
      const rcs = (club.rcs_number || "").toLowerCase();
      return (
        name.includes(normalizedQuery) ||
        locality.includes(normalizedQuery) ||
        postalCode.includes(normalizedQuery) ||
        address.includes(normalizedQuery) ||
        rcs.includes(normalizedQuery) ||
        (club.federation || "").toLowerCase().includes(normalizedQuery)
      );
    });
  }, [clubs, federationFilter, searchQuery, selectedClubId]);

  const sortedClubs = useMemo(
    () =>
      sortRowsByKey(searchedClubs, tableSort, {
        name: (club) => club.name,
        federation: (club) => club.federation,
        is_active: (club) => club.is_active,
        postal_code: (club) => club.postal_code,
        locality: (club) => club.locality || club.city || "",
      }),
    [searchedClubs, tableSort]
  );

  const resolvedPageSize =
    pageSize === "all" ? Math.max(sortedClubs.length, 1) : Number(pageSize);
  const totalPages = Math.max(1, Math.ceil(sortedClubs.length / resolvedPageSize));
  const pagedClubs = useMemo(() => {
    const startIndex = (currentPage - 1) * resolvedPageSize;
    return sortedClubs.slice(startIndex, startIndex + resolvedPageSize);
  }, [currentPage, sortedClubs, resolvedPageSize]);

  const visibleIds = useMemo(() => pagedClubs.map((club) => club.id), [pagedClubs]);
  const headerCheck = visibleHeaderCheck(selectedIds, visibleIds);
  const otherPageCount = offPageSelectedCount(selectedIds, visibleIds);

  const toggleSelectAll = () => {
    setSelectedIds((current) => togglePageSelection(current, visibleIds));
  };

  const toggleSelectRow = (id: number) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const handleDelete = (club: Club) => {
    setClubToDelete(club);
    setIsDeleteOpen(true);
  };

  const confirmDelete = async () => {
    if (!clubToDelete) {
      return;
    }
    try {
      await deleteClub(clubToDelete.id);
      setIsDeleteOpen(false);
      setClubToDelete(null);
      await loadClubs();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to delete club.");
    }
  };

  const knownClubs = useRef(new Map<number, Club>());
  for (const club of clubs) {
    knownClubs.current.set(club.id, club);
  }
  const selectedClubs = selectedIds
    .map((id) => knownClubs.current.get(id))
    .filter((club): club is Club => Boolean(club));

  const confirmBatchDelete = async () => {
    try {
      await Promise.all(selectedIds.map((id) => deleteClub(id)));
      setSelectedIds([]);
      await loadClubs();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to delete clubs.");
    }
  };

  const selectedClubItems = selectedClubs.map((club) =>
    club.locality || club.city ? `${club.name} · ${club.locality || club.city}` : club.name
  );

  return (
    <LtfAdminLayout title={t("clubsTitle")} subtitle={t("clubsSubtitle")}>
      <ActionNotices error={errorMessage} onDismiss={() => setErrorMessage(null)} />

      <div className="space-y-3">
        {issue === "no_admin" ? (
          <div className="flex items-start justify-between gap-3 rounded-[var(--radius-form)] border px-3 py-2 text-sm banner-info">
            <p className="min-w-0 flex-1">{t("clubsWithoutAdminFilterMessage")}</p>
            <button
              type="button"
              className="inline-flex h-[var(--control-height)] min-h-[var(--control-height)] w-[var(--control-height)] shrink-0 items-center justify-center rounded-[var(--radius-form)]"
              aria-label={common("modalClose")}
              onClick={dismissIssueFilter}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : null}

        <div className="flex flex-col gap-3">
          <ListToolbarPanel
            search={
              <div className="flex w-full max-w-xl flex-wrap gap-2">
                <Input
                  className="w-full max-w-xs"
                  placeholder={t("searchClubsPlaceholder")}
                  aria-label={t("searchClubsPlaceholder")}
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                />
                <PopoverSelect
                  value={federationFilter}
                  onValueChange={setFederationFilter}
                  ariaLabel={t("federationFilterLabel")}
                  options={[
                    { value: "all", label: t("federationAll") },
                    { value: "WT", label: t("federationWt") },
                    { value: "ITF", label: t("federationItf") },
                  ]}
                />
              </div>
            }
            pageSize={
              <PageSizeSelect
                value={pageSize}
                onChange={setPageSize}
                ariaLabel={common("rowsPerPageLabel")}
                allLabel={common("rowsPerPageAll")}
              />
            }
          />

          <ListActionsRow
            actions={
              <>
                <ActionMenu
                  label={t("clubsMenuLabel")}
                  actions={[
                    {
                      key: "create",
                      label: t("createClub"),
                      onSelect: () => setCreateOpen(true),
                    },
                    {
                      key: "import-clubs",
                      label: importT("importClubs"),
                      onSelect: () => router.push(`/${locale}/dashboard/ltf/import?type=clubs`),
                    },
                  ]}
                />
                <ActionMenu
                  label={common("batchActionsLabel")}
                  disabled={selectedIds.length === 0}
                  actions={[
                    {
                      key: "delete",
                      label: common("batchDeleteLabel"),
                      onSelect: () => setIsBatchDeleteOpen(true),
                    },
                  ]}
                />
                <SelectionMeta
                  count={selectedIds.length}
                  countLabel={t("selectedCountLabel", { count: selectedIds.length })}
                  offPageCount={otherPageCount}
                  offPageLabel={t("selectedOnOtherPagesLabel", { count: otherPageCount })}
                  clearLabel={t("clearSelection")}
                  onClear={() => setSelectedIds([])}
                />
              </>
            }
            pagination={
              <ListPagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPrevious={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                onNext={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                pageLabel={t("pageLabel", { current: currentPage, total: totalPages })}
                previousLabel={t("previousPage")}
                nextLabel={t("nextPage")}
              />
            }
          />
        </div>

        {isLoading ? (
          <EmptyState title={t("loadingTitle")} description={t("loadingSubtitle")} loading />
        ) : searchedClubs.length === 0 ? (
          <EmptyState title={t("noResultsTitle")} description={t("noClubsResultsSubtitle")} />
        ) : (
          <EntityTable
            columns={[
              {
                key: "select",
                header: (
                  <Checkbox
                    aria-label={common("selectAllLabel")}
                    checked={headerCheck}
                    onCheckedChange={() => toggleSelectAll()}
                  />
                ),
                render: (club) => (
                  <span
                    className="inline-flex"
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => event.stopPropagation()}
                  >
                    <Checkbox
                      aria-label={common("selectRowLabel")}
                      checked={selectedIds.includes(club.id)}
                      onCheckedChange={() => toggleSelectRow(club.id)}
                    />
                  </span>
                ),
              },
              { key: "name", header: t("clubNameLabel"), sortable: true },
              {
                key: "federation",
                header: t("federationLabel"),
                sortable: true,
                render: (club) => (
                  <StatusBadge
                    label={club.federation === "ITF" ? t("federationItf") : t("federationWt")}
                    tone="neutral"
                  />
                ),
              },
              {
                key: "is_active",
                header: t("clubStatusLabel"),
                sortable: true,
                render: (club) => (
                  <StatusBadge
                    label={club.is_active ? t("clubStatusActive") : t("clubStatusInactive")}
                    tone={club.is_active ? "success" : "neutral"}
                  />
                ),
              },
              { key: "postal_code", header: t("postalCodeLabel"), sortable: true },
              {
                key: "locality",
                header: t("localityLabel"),
                sortable: true,
                render: (club) => club.locality || club.city,
              },
              {
                key: "actions",
                header: t("actionsLabel"),
                render: (club) => (
                  <div onClick={(event) => event.stopPropagation()}>
                    <RowActionMenu
                      label={common("rowActionsLabel")}
                      actions={[
                        {
                          key: "edit",
                          icon: <Pencil aria-hidden />,
                          label: t("editAction"),
                          onSelect: () => setEditingClub(club),
                        },
                        {
                          key: "delete",
                          icon: <Trash2 aria-hidden />,
                          label: t("deleteAction"),
                          destructive: true,
                          onSelect: () => handleDelete(club),
                        },
                      ]}
                    />
                  </div>
                ),
              },
            ]}
            rows={pagedClubs}
            sort={tableSort}
            onSortChange={setTableSort}
            onRowClick={(club) => router.push(`/${locale}/dashboard/ltf/clubs/${club.id}`)}
          />
        )}
      </div>

      <ClubFormPanel
        open={createOpen || editingClub !== null}
        mode={editingClub ? "edit" : "create"}
        club={editingClub}
        onClose={() => {
          setCreateOpen(false);
          setEditingClub(null);
        }}
        onSaved={async () => {
          setCreateOpen(false);
          setEditingClub(null);
          await loadClubs();
        }}
      />

      <DeleteConfirmModal
        isOpen={isDeleteOpen}
        title={common("deleteTitle", { item: common("itemClub") })}
        description={common("deleteDescriptionWithName", {
          name: clubToDelete?.name ?? "",
        })}
        confirmLabel={common("deleteConfirmButton")}
        cancelLabel={common("deleteCancelButton")}
        onConfirm={confirmDelete}
        onCancel={() => {
          setIsDeleteOpen(false);
          setClubToDelete(null);
        }}
      />

      <DeleteConfirmModal
        isOpen={isBatchDeleteOpen}
        title={common("deleteTitle", { item: common("itemClub") })}
        description={common("deleteSelectedDescription", {
          count: selectedClubs.length,
          item: common("itemClub"),
        })}
        listTitle={common("batchDeleteListTitle")}
        listItems={selectedClubItems}
        confirmLabel={common("deleteConfirmButton")}
        cancelLabel={common("deleteCancelButton")}
        onConfirm={() => {
          setIsBatchDeleteOpen(false);
          confirmBatchDelete();
        }}
        onCancel={() => setIsBatchDeleteOpen(false)}
      />
    </LtfAdminLayout>
  );
}
