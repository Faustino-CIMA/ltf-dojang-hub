"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { ClubAdminLayout } from "@/components/club-admin/club-admin-layout";
import { EmptyState } from "@/components/club-admin/empty-state";
import { EntityTable } from "@/components/club-admin/entity-table";
import { ActionNotices } from "@/components/ui/list-page-chrome";
import { resolveAssignedClubId, useClubSelection } from "@/components/club-selection-provider";
import {
  License,
  LicenseType,
  Member,
  getClubs,
  getLicenseTypes,
  getLicensesPage,
  getMembersList,
} from "@/lib/club-admin-api";
import { formatDisplayDate } from "@/lib/date-display";
import { formatFullName } from "@/lib/person-name";
import { toOrderingParam, type TableSort } from "@/lib/table-sort";
import { Button } from "@/components/ui/button";
import { FilterPills } from "@/components/ui/filter-pills";
import { StatusBadge } from "@/components/ui/status-badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type LicenseStatusFilter = "all" | "active" | "pending" | "expired";

/** Matches backend `API_PAGINATION_MAX_PAGE_SIZE`. */
const LICENSES_LIST_PAGE_SIZE_CAP = 200;

export default function ClubAdminLicensesPage() {
  const t = useTranslations("ClubAdmin");
  const common = useTranslations("Common");
  const pathname = usePathname();
  const router = useRouter();
  const locale = pathname?.split("/")[1] || "en";
  const { selectedClubId, setSelectedClubId } = useClubSelection();
  const [members, setMembers] = useState<Member[]>([]);
  const [licenses, setLicenses] = useState<License[]>([]);
  const [licenseTypes, setLicenseTypes] = useState<LicenseType[]>([]);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [licenseStatusFilter, setLicenseStatusFilter] = useState<LicenseStatusFilter>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState("50");
  const [totalCount, setTotalCount] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [tableSort, setTableSort] = useState<TableSort | null>(null);
  const ordering = toOrderingParam(tableSort);
  const [licenseFacetCounts, setLicenseFacetCounts] = useState({
    all: 0,
    active: 0,
    pending: 0,
    expired: 0,
  });

  const pageSizeOptions = ["50", "150", "300", "all"];
  const statusFilterParam = licenseStatusFilter === "all" ? undefined : licenseStatusFilter;

  const licensesListPageSize = useMemo(() => {
    if (pageSize === "all") {
      return Math.min(Math.max(totalCount, 1), LICENSES_LIST_PAGE_SIZE_CAP);
    }
    const n = Number(pageSize);
    if (!Number.isFinite(n) || n <= 0) {
      return 50;
    }
    return Math.min(n, LICENSES_LIST_PAGE_SIZE_CAP);
  }, [pageSize, totalCount]);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const clubsResponse = await getClubs();
      const effectiveClubId = resolveAssignedClubId(clubsResponse, selectedClubId);
      if (effectiveClubId !== selectedClubId) {
        setSelectedClubId(effectiveClubId);
      }

      const licenseTypesPromise = getLicenseTypes();
      if (!effectiveClubId) {
        const licenseTypesResponse = await licenseTypesPromise;
        setLicenseTypes(licenseTypesResponse);
        setLicenses([]);
        setMembers([]);
        setTotalCount(0);
        setLicenseFacetCounts({ all: 0, active: 0, pending: 0, expired: 0 });
        return;
      }

      const q = searchQuery || undefined;
      const [licensesResponse, allCountRes, activeCountRes, pendingCountRes, expiredCountRes] =
        await Promise.all([
          getLicensesPage({
            page: currentPage,
            pageSize: licensesListPageSize,
            clubId: effectiveClubId,
            q,
            status: statusFilterParam,
            ordering,
          }),
          getLicensesPage({
            page: 1,
            pageSize: 1,
            clubId: effectiveClubId,
            q,
          }),
          getLicensesPage({
            page: 1,
            pageSize: 1,
            clubId: effectiveClubId,
            q,
            status: "active",
          }),
          getLicensesPage({
            page: 1,
            pageSize: 1,
            clubId: effectiveClubId,
            q,
            status: "pending",
          }),
          getLicensesPage({
            page: 1,
            pageSize: 1,
            clubId: effectiveClubId,
            q,
            status: "expired",
          }),
        ]);
      setLicenses(licensesResponse.results);
      setTotalCount(licensesResponse.count);
      setLicenseFacetCounts({
        all: allCountRes.count,
        active: activeCountRes.count,
        pending: pendingCountRes.count,
        expired: expiredCountRes.count,
      });

      const memberIds = Array.from(new Set(licensesResponse.results.map((license) => license.member)));
      if (memberIds.length > 0) {
        const membersResponse = await getMembersList({
          clubId: effectiveClubId,
          ids: memberIds,
        });
        setMembers(membersResponse);
      } else {
        setMembers([]);
      }

      const licenseTypesResponse = await licenseTypesPromise;
      setLicenseTypes(licenseTypesResponse);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load licenses.");
    } finally {
      setIsLoading(false);
    }
  }, [
    currentPage,
    licensesListPageSize,
    searchQuery,
    selectedClubId,
    setSelectedClubId,
    statusFilterParam,
    ordering,
  ]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setSearchQuery(searchInput.trim());
    }, 250);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [searchInput]);

  const memberById = useMemo(() => {
    return new Map(members.map((member) => [member.id, member]));
  }, [members]);

  const licenseTypeNameById = useMemo(
    () => new Map(licenseTypes.map((licenseType) => [licenseType.id, licenseType.name])),
    [licenseTypes]
  );

  const totalPages = Math.max(1, Math.ceil(totalCount / licensesListPageSize));

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedClubId, pageSize, licenseStatusFilter, tableSort]);

  const getStatusLabel = (status: License["status"]) => {
    if (status === "active") {
      return t("statusActive");
    }
    if (status === "expired") {
      return t("statusExpired");
    }
    if (status === "pending") {
      return t("statusPending");
    }
    return status;
  };

  const getStatusTone = (status: License["status"]): "success" | "warning" | "danger" | "neutral" => {
    if (status === "active") {
      return "success";
    }
    if (status === "expired") {
      return "neutral";
    }
    if (status === "pending") {
      return "warning";
    }
    return "danger";
  };

  const formatIssuedAt = (value: string | null) => {
    if (!value) {
      return "—";
    }
    return formatDisplayDate(value);
  };

  const columns = [
    {
      key: "member",
      header: common("fullNameLabel"),
      sortable: true,
      render: (license: License) => {
        const member = memberById.get(license.member);
        return member ? formatFullName(member) : t("unknownMember");
      },
    },
    { key: "year", header: t("yearLabel"), sortable: true },
    {
      key: "license_type",
      header: t("licenseTypeLabel"),
      sortable: true,
      render: (license: License) =>
        licenseTypeNameById.get(license.license_type) ?? t("unknownLicenseType"),
    },
    {
      key: "status",
      header: t("statusLabel"),
      sortable: true,
      render: (license: License) => (
        <StatusBadge label={getStatusLabel(license.status)} tone={getStatusTone(license.status)} />
      ),
    },
    {
      key: "issued_at",
      header: t("issuedAtLabel"),
      sortable: true,
      render: (license: License) => formatIssuedAt(license.issued_at),
    },
  ];

  return (
    <ClubAdminLayout title={t("licensesTitle")} subtitle={t("licensesSubtitle")}>
      <ActionNotices error={errorMessage} onDismiss={() => setErrorMessage(null)} />

      <div className="space-y-6">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end gap-4 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
            <div className="flex min-w-[12rem] flex-1 flex-wrap items-end gap-3">
              <div className="min-w-[10rem] flex-1">
                <Input
                  className="w-full max-w-xs"
                  placeholder={t("searchLicensesPlaceholder")}
                  aria-label={t("searchLicensesPlaceholder")}
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                />
              </div>
              <div>
                <Select value={pageSize} onValueChange={setPageSize}>
                  <SelectTrigger className="w-[150px]" aria-label={common("rowsPerPageLabel")}>
                    <SelectValue placeholder={common("rowsPerPageLabel")} />
                  </SelectTrigger>
                  <SelectContent>
                    {pageSizeOptions.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option === "all" ? common("rowsPerPageAll") : option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="min-w-0 flex-1 border-t border-[var(--border)] pt-4 sm:border-t-0 sm:pt-0">
              <FilterPills
                ariaLabel={t("licensesStatusFilterAriaLabel")}
                value={licenseStatusFilter}
                onChange={setLicenseStatusFilter}
                options={[
                  { value: "all", title: t("filterAllTitle"), count: licenseFacetCounts.all },
                  { value: "active", title: t("filterActiveTitle"), count: licenseFacetCounts.active },
                  { value: "pending", title: t("filterPendingTitle"), count: licenseFacetCounts.pending },
                  { value: "expired", title: t("filterExpiredTitle"), count: licenseFacetCounts.expired },
                ]}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-4">
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
        ) : licenses.length === 0 ? (
          <EmptyState title={t("noResultsTitle")} description={t("noLicensesResultsSubtitle")} />
        ) : (
          <EntityTable
            columns={columns}
            rows={licenses}
            sort={tableSort}
            onSortChange={setTableSort}
            onRowClick={(license) =>
              router.push(`/${locale}/dashboard/club/members/${license.member}`)
            }
          />
        )}
      </div>
    </ClubAdminLayout>
  );
}
