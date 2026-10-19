"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";

import { EmptyState } from "@/components/club-admin/empty-state";
import { EntityTable } from "@/components/club-admin/entity-table";
import { LtfAdminLayout } from "@/components/ltf-admin/ltf-admin-layout";
import { LtfStaffPanel, type StaffPanelMode } from "@/components/ltf-admin/ltf-staff-panel";
import { ActionMenu } from "@/components/ui/action-menu";
import { Button } from "@/components/ui/button";
import { FilterPills } from "@/components/ui/filter-pills";
import { Input } from "@/components/ui/input";
import { RowActionMenu } from "@/components/ui/row-action-menu";
import {
  ListActionsRow,
  ListPagination,
  ListToolbarPanel,
  PageSizeSelect,
  resolveListPageSize,
  ActionNotices
} from "@/components/ui/list-page-chrome";
import { StatusBadge } from "@/components/ui/status-badge";
import { staffFunctionLabel as staffFunctionText } from "@/lib/ltf-staff-label";
import { useClubSelection } from "@/components/club-selection-provider";
import { apiRequest } from "@/lib/api";
import {
  Club,
  LicenseType,
  LtfStaffInput,
  Member,
  MemberIssueFilter,
  MemberRoster,
  createLtfStaff,
  deleteLtfStaff,
  getClubs,
  getLicenseTypes,
  getMembersPage,
  issueLtfStaffLicense,
  revokeLtfStaffLicense,
  updateLtfStaff,
} from "@/lib/ltf-admin-api";
import { displayClubName } from "@/lib/club-label";
import { staffActionErrorMessage } from "@/lib/staff-action-error";
import { formatFullName } from "@/lib/person-name";
import { toOrderingParam, type TableSort } from "@/lib/table-sort";

function parseMemberIssue(value: string | null): MemberIssueFilter | null {
  if (value === "no_valid_license" || value === "missing_ltf_licenseid") {
    return value;
  }
  return null;
}

type MemberStatusFilter = "all" | "active" | "inactive";

function staffFunctionLabel(t: (key: string) => string, member: Member) {
  return staffFunctionText(t, member.ltf_staff?.function) || t("ltfStaffBadge");
}

export default function LtfAdminMembersPage() {
  const t = useTranslations("LtfAdmin");
  const importT = useTranslations("Import");
  const common = useTranslations("Common");
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const locale = pathname?.split("/")[1] || "en";
  const issue = parseMemberIssue(searchParams.get("issue"));

  const [clubs, setClubs] = useState<Club[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [memberStatusFilter, setMemberStatusFilter] = useState<MemberStatusFilter>("all");
  const [roster, setRoster] = useState<MemberRoster>("all");
  const [role, setRole] = useState<string | null>(null);
  const [licenseTypes, setLicenseTypes] = useState<LicenseType[]>([]);
  const [panelMode, setPanelMode] = useState<StaffPanelMode | null>(null);
  const [panelMember, setPanelMember] = useState<Member | null>(null);
  const [panelBusy, setPanelBusy] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState("50");
  const [totalCount, setTotalCount] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [tableSort, setTableSort] = useState<TableSort | null>(null);
  const ordering = toOrderingParam(tableSort);
  const [memberFacetCounts, setMemberFacetCounts] = useState({
    all: 0,
    active: 0,
    inactive: 0,
  });
  const { selectedClubId } = useClubSelection();

  const membersListPageSize = useMemo(
    () => resolveListPageSize(pageSize, totalCount),
    [pageSize, totalCount]
  );

  const isActiveFilter = useMemo(() => {
    if (memberStatusFilter === "all") {
      return undefined;
    }
    return memberStatusFilter === "active";
  }, [memberStatusFilter]);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    const q = searchQuery || undefined;
    const clubId = selectedClubId ?? undefined;
    try {
      const [clubsResponse, membersResponse, allCountRes, activeCountRes, inactiveCountRes, me] =
        await Promise.all([
          getClubs(),
          getMembersPage({
            page: currentPage,
            pageSize: membersListPageSize,
            q,
            clubId,
            isActive: isActiveFilter,
            issue: issue ?? undefined,
            roster,
            ordering,
          }),
          getMembersPage({
            page: 1,
            pageSize: 1,
            q,
            clubId,
            isActive: undefined,
            issue: issue ?? undefined,
            roster,
          }),
          getMembersPage({
            page: 1,
            pageSize: 1,
            q,
            clubId,
            isActive: true,
            issue: issue ?? undefined,
            roster,
          }),
          getMembersPage({
            page: 1,
            pageSize: 1,
            q,
            clubId,
            isActive: false,
            issue: issue ?? undefined,
            roster,
          }),
          apiRequest<{ role: string }>("/api/auth/me/"),
        ]);
      setRole(me.role);
      setClubs(clubsResponse);
      setMembers(membersResponse.results);
      setTotalCount(membersResponse.count);
      setMemberFacetCounts({
        all: allCountRes.count,
        active: activeCountRes.count,
        inactive: inactiveCountRes.count,
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load members.");
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, isActiveFilter, issue, membersListPageSize, ordering, roster, searchQuery, selectedClubId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedClubId, pageSize, searchQuery, isActiveFilter, issue, roster, tableSort]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setSearchQuery(searchInput.trim());
    }, 250);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [searchInput]);

  const clubById = useMemo(() => new Map(clubs.map((club) => [club.id, club])), [clubs]);
  const canManageStaff = role === "ltf_admin";

  const openPanel = useCallback(async (mode: StaffPanelMode, member: Member | null) => {
    setPanelMember(member);
    setPanelMode(mode);
    if (licenseTypes.length === 0) {
      try {
        setLicenseTypes(await getLicenseTypes());
      } catch {
        setLicenseTypes([]);
      }
    }
  }, [licenseTypes.length]);

  const submitPanel = async (mode: StaffPanelMode, input: LtfStaffInput) => {
    setPanelBusy(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      if (mode === "create") {
        await createLtfStaff({ ...input, locale });
        setSuccessMessage(t("staffSaved"));
      } else if (mode === "edit" && panelMember) {
        await updateLtfStaff(panelMember.id, { ...input, locale });
        setSuccessMessage(t("staffSaved"));
      } else if (mode === "issue" && panelMember && input.license_type && input.license_year) {
        await issueLtfStaffLicense(panelMember.id, input.license_type, input.license_year);
        setSuccessMessage(t("staffLicenseIssued"));
      } else if (mode === "revoke" && panelMember) {
        await revokeLtfStaffLicense(panelMember.id);
        setSuccessMessage(t("staffLicenseRevoked"));
      } else if (mode === "delete" && panelMember) {
        await deleteLtfStaff(panelMember.id);
        setSuccessMessage(t("staffDeleted"));
      }
      setPanelMode(null);
      setPanelMember(null);
      await loadData();
    } catch (error) {
      setErrorMessage(staffActionErrorMessage(error, t, t("staffSaved")));
    } finally {
      setPanelBusy(false);
    }
  };
  const totalPages = Math.max(1, Math.ceil(totalCount / membersListPageSize));

  const dismissIssueFilter = () => {
    router.replace(`/${locale}/dashboard/ltf/members`);
  };

  const getLicenseStatusMeta = useCallback(
    (status: string) => {
      if (status === "active") {
        return { label: t("statusActive"), tone: "success" as const };
      }
      if (status === "pending") {
        return { label: t("statusPending"), tone: "warning" as const };
      }
      if (status === "expired") {
        return { label: t("statusExpired"), tone: "neutral" as const };
      }
      return { label: t("statusRevoked"), tone: "danger" as const };
    },
    [t]
  );

  const columns = useMemo(
    () => [
      {
        key: "name",
        header: common("fullNameLabel"),
        sortable: true,
        render: (row: Member) => (
          <span className="inline-flex flex-wrap items-center gap-2">
            <span>{formatFullName(row)}</span>
            {row.is_ltf_staff ? <StatusBadge label={staffFunctionLabel(t, row)} tone="info" /> : null}
            {row.is_club_tourist ? <StatusBadge label={t("clubTouristBadge")} tone="warning" /> : null}
          </span>
        ),
      },
      {
        key: "club",
        header: t("clubLabel"),
        sortable: true,
        render: (row: Member) =>
          displayClubName(row.club, row.club ? clubById.get(row.club)?.name : "", {
            noClub: t("noClub"),
            unknownClub: t("unknownClub"),
          }),
      },
      {
        key: "ltf_licenseid",
        header: t("ltfLicenseLabel"),
        sortable: true,
        render: (row: Member) => row.ltf_licenseid || "-",
      },
      {
        key: "belt_rank",
        header: t("beltRankLabel"),
        sortable: true,
        render: (row: Member) => row.belt_rank || "-",
      },
      {
        key: "is_active",
        header: t("statusLabel"),
        sortable: true,
        render: (row: Member) => (
          <StatusBadge
            label={row.is_active ? t("activeLabel") : t("inactiveLabel")}
            tone={row.is_active ? "success" : "neutral"}
          />
        ),
      },
      {
        key: "current_license",
        header: t("licensesTitle"),
        render: (row: Member) => {
          const current = row.current_licenses?.[0];
          if (!current) {
            return "-";
          }
          const meta = getLicenseStatusMeta(current.status);
          const extra = (row.current_licenses?.length ?? 0) > 1
            ? ` +${(row.current_licenses?.length ?? 0) - 1}`
            : "";
          return (
            <span className="inline-flex flex-wrap items-center gap-2">
              <span className="text-sm">{current.year}</span>
              <StatusBadge label={`${meta.label}${extra}`} tone={meta.tone} />
            </span>
          );
        },
      },
      ...(canManageStaff
        ? [
            {
              key: "actions",
              header: <span className="sr-only">{t("staffRowActions")}</span>,
              render: (row: Member) => {
                const current = row.current_licenses?.[0];
                const hasCurrent = current?.status === "active" || current?.status === "pending";
                return (
                  <RowActionMenu
                    label={t("staffRowActions")}
                    actions={[
                      {
                        key: "edit",
                        label: t("staffEditAction"),
                        onSelect: () => void openPanel(row.is_ltf_staff ? "edit" : "create", row),
                      },
                      ...(!row.club && !hasCurrent
                        ? [
                            {
                              key: "issue",
                              label: t("staffIssueAction"),
                              onSelect: () => void openPanel("issue", row),
                            },
                          ]
                        : []),
                      ...(!row.club && hasCurrent
                        ? [
                            {
                              key: "revoke",
                              label: t("staffRevokeAction"),
                              onSelect: () => void openPanel("revoke", row),
                            },
                          ]
                        : []),
                      {
                        key: "delete",
                        label: t("staffDeleteAction"),
                        destructive: true,
                        disabled: !row.is_ltf_staff,
                        onSelect: () => void openPanel("delete", row),
                      },
                    ]}
                  />
                );
              },
            },
          ]
        : []),
    ],
    [canManageStaff, clubById, common, getLicenseStatusMeta, openPanel, t]
  );

  return (
    <LtfAdminLayout title={t("membersTitle")} subtitle={t("membersSubtitle")}>
      <ActionNotices
        error={errorMessage}
        success={successMessage}
        onDismiss={() => {
          setErrorMessage(null);
          setSuccessMessage(null);
        }}
      />

      <div className="space-y-3">
        {issue ? (
          <div className="flex items-start justify-between gap-3 rounded-[var(--radius-form)] border px-3 py-2 text-sm banner-info">
            <p className="min-w-0 flex-1">
              {issue === "no_valid_license"
                ? t("membersWithoutValidLicenseFilterMessage")
                : t("membersMissingLtfLicenseIdFilterMessage")}
            </p>
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

        <div className="flex flex-col gap-4">
          <ListToolbarPanel
            search={
              <Input
                className="w-full max-w-xs"
                placeholder={t("searchMembersPlaceholder")}
                aria-label={t("searchMembersPlaceholder")}
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
              />
            }
            pageSize={
              <PageSizeSelect
                value={pageSize}
                onChange={setPageSize}
                ariaLabel={common("rowsPerPageLabel")}
                allLabel={common("rowsPerPageAll")}
              />
            }
            filters={
              issue ? undefined : (
                <div className="flex flex-col gap-2">
                  <FilterPills
                    ariaLabel={t("staffFilterAriaLabel")}
                    value={roster}
                    onChange={setRoster}
                    options={[
                      { value: "all", title: t("staffFilterAll") },
                      { value: "club", title: t("staffFilterClub") },
                      { value: "staff", title: t("staffFilterStaff") },
                    ]}
                  />
                  <FilterPills
                    ariaLabel={t("membersStatusFilterAriaLabel")}
                    value={memberStatusFilter}
                    onChange={setMemberStatusFilter}
                    options={[
                      { value: "all", title: t("filterAllTitle"), count: memberFacetCounts.all },
                      { value: "active", title: t("filterActiveTitle"), count: memberFacetCounts.active },
                      {
                        value: "inactive",
                        title: t("filterInactiveTitle"),
                        count: memberFacetCounts.inactive,
                      },
                    ]}
                  />
                </div>
              )
            }
          />

          <ListActionsRow
            actions={
              <div className="flex flex-wrap items-center gap-3">
                {canManageStaff ? (
                  <Button type="button" onClick={() => void openPanel("create", null)}>
                    {t("staffAddAction")}
                  </Button>
                ) : null}
                <ActionMenu
                  label={t("membersMenuLabel")}
                  actions={[
                    {
                      key: "import-members",
                      label: importT("importMembers"),
                      onSelect: () => router.push(`/${locale}/dashboard/ltf/members/import`),
                    },
                  ]}
                />
                <p className="text-sm text-muted">{t("membersReadOnlyHint")}</p>
              </div>
            }
            pagination={
              <ListPagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPrevious={() => setCurrentPage((previous) => Math.max(1, previous - 1))}
                onNext={() => setCurrentPage((previous) => Math.min(totalPages, previous + 1))}
                pageLabel={t("pageLabel", { current: currentPage, total: totalPages })}
                previousLabel={t("previousPage")}
                nextLabel={t("nextPage")}
              />
            }
          />
        </div>

        {isLoading ? (
          <EmptyState title={t("loadingTitle")} description={t("loadingSubtitle")} loading />
        ) : members.length === 0 ? (
          <EmptyState title={t("noResultsTitle")} description={t("noMembersResultsSubtitle")} />
        ) : (
          <EntityTable
            columns={columns}
            rows={members}
            sort={tableSort}
            onSortChange={setTableSort}
            onRowClick={(member) => router.push(`/${locale}/dashboard/ltf/members/${member.id}`)}
          />
        )}
      </div>
      <LtfStaffPanel
        mode={panelMode}
        member={panelMember}
        clubs={clubs}
        licenseTypes={licenseTypes}
        busy={panelBusy}
        onClose={() => {
          setPanelMode(null);
          setPanelMember(null);
        }}
        onSubmit={(mode, input) => void submitPanel(mode, input)}
      />
    </LtfAdminLayout>
  );
}
