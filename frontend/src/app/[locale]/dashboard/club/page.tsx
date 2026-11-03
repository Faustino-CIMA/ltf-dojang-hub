"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { BadgeEuro, Clock3, IdCard, Users } from "lucide-react";

import { ActionQueue } from "@/components/club-admin/action-queue";
import { ClubAdminLayout } from "@/components/club-admin/club-admin-layout";
import { EmptyState } from "@/components/club-admin/empty-state";
import { EntityTable } from "@/components/club-admin/entity-table";
import { StatBreakdown } from "@/components/club-admin/stat-breakdown";
import { SummaryCard } from "@/components/club-admin/summary-card";
import { resolveAssignedClubId, useClubSelection } from "@/components/club-selection-provider";
import { Button } from "@/components/ui/button";
import {
  formatWelcomeDate,
  formatWelcomeShortDate,
  parseIsoDate,
  WelcomeOverview,
  type WelcomeAttention,
  type WelcomeTile,
} from "@/components/welcome-overview";
import { apiRequest } from "@/lib/api";
import {
  Club,
  License,
  Member,
  getClubs,
  getLicenses,
  getMemberTransfers,
  getMembers,
} from "@/lib/club-admin-api";
import { getClubInvoices, getClubOrders } from "@/lib/club-finance-api";
import { getClubTeams } from "@/lib/club-teams-api";
import { formatDisplayDateTime } from "@/lib/date-display";
import { COMPETITION_MODULE_ID, getModuleStatus, isClubModuleAssigned } from "@/lib/modules-api";
import { formatFullName } from "@/lib/person-name";
import type { TableSort } from "@/lib/table-sort";
import type { FinanceInvoice, FinanceOrder } from "@/lib/ltf-finance-api";

type MeResponse = {
  first_name: string;
  username: string;
};

type ActivityRow = {
  id: string;
  typeLabel: string;
  reference: string;
  statusLabel: string;
  totalLabel: string;
  atLabel: string;
  timestamp: number;
  href: string;
};

export default function ClubAdminOverviewPage() {
  const t = useTranslations("ClubAdmin");
  const home = useTranslations("Home");
  const common = useTranslations("Common");
  const locale = useLocale();
  const router = useRouter();
  const { selectedClubId, setSelectedClubId } = useClubSelection();
  const [clubs, setClubs] = useState<Club[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [licenses, setLicenses] = useState<License[]>([]);
  const [orders, setOrders] = useState<FinanceOrder[]>([]);
  const [invoices, setInvoices] = useState<FinanceInvoice[]>([]);
  const [incomingTransferCount, setIncomingTransferCount] = useState(0);
  const [teamCount, setTeamCount] = useState<number | null>(null);
  const [firstName, setFirstName] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshAt, setLastRefreshAt] = useState<string | null>(null);
  const [activitySort, setActivitySort] = useState<TableSort | null>(null);
  const [issuedInvoicesOverdue7d, setIssuedInvoicesOverdue7d] = useState(0);

  const loadOverview = useCallback(
    async (options?: { silent?: boolean }) => {
      const silent = options?.silent ?? false;
      if (silent) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
        setTeamCount(null);
      }
      setErrorMessage(null);
      try {
        const [clubsResponse, membersResponse, licensesResponse, transfersResponse, me] = await Promise.all([
          getClubs(),
          getMembers(),
          getLicenses(),
          getMemberTransfers().catch(() => []),
          apiRequest<MeResponse>("/api/auth/me/"),
        ]);
        setClubs(clubsResponse);
        setMembers(membersResponse);
        setLicenses(licensesResponse);
        setFirstName(me.first_name?.trim() || me.username);
        const effectiveClubId = resolveAssignedClubId(clubsResponse, selectedClubId);
        if (effectiveClubId !== selectedClubId) {
          setSelectedClubId(effectiveClubId);
        }
        const administeredIds = new Set(clubsResponse.map((club) => club.id));
        setIncomingTransferCount(
          transfersResponse.filter((item) => {
            if (item.status !== "pending") {
              return false;
            }
            if (effectiveClubId) {
              return item.to_club.id === effectiveClubId;
            }
            return administeredIds.has(item.to_club.id);
          }).length
        );
        if (effectiveClubId) {
          const [ordersResponse, invoicesResponse] = await Promise.all([
            getClubOrders(effectiveClubId),
            getClubInvoices(effectiveClubId),
          ]);
          setOrders(ordersResponse);
          setInvoices(invoicesResponse);
          setIssuedInvoicesOverdue7d(countIssuedOverdue(invoicesResponse, Date.now()));
        } else {
          setOrders([]);
          setInvoices([]);
          setIssuedInvoicesOverdue7d(0);
        }
        setLastRefreshAt(new Date().toISOString());
        if (silent) {
          setIsRefreshing(false);
        } else {
          setIsLoading(false);
        }

        if (!effectiveClubId) {
          setTeamCount(null);
          return;
        }
        try {
          const modules = await getModuleStatus();
          if (!isClubModuleAssigned(modules, COMPETITION_MODULE_ID, effectiveClubId)) {
            setTeamCount(null);
            return;
          }
          const teams = await getClubTeams(effectiveClubId);
          setTeamCount(teams.length);
        } catch {
          setTeamCount(null);
        }
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : t("overviewLoadError"));
        if (silent) {
          setIsRefreshing(false);
        } else {
          setIsLoading(false);
        }
      }
    },
    [selectedClubId, setSelectedClubId, t]
  );

  useEffect(() => {
    const handle = window.setTimeout(() => {
      void loadOverview();
    }, 0);
    return () => window.clearTimeout(handle);
  }, [loadOverview]);

  const activeClubId = resolveAssignedClubId(clubs, selectedClubId);
  const clubName = clubs.find((club) => club.id === activeClubId)?.name ?? "";

  const filteredMembers = useMemo(() => {
    if (!activeClubId) {
      return members;
    }
    return members.filter((member) => member.club === activeClubId);
  }, [members, activeClubId]);

  const filteredLicenses = useMemo(() => {
    if (!activeClubId) {
      return licenses;
    }
    return licenses.filter((license) => license.club === activeClubId);
  }, [licenses, activeClubId]);

  const activeMembers = useMemo(
    () => filteredMembers.filter((member) => member.is_active),
    [filteredMembers]
  );
  const activeLicenses = useMemo(
    () => filteredLicenses.filter((license) => license.status === "active"),
    [filteredLicenses]
  );
  const pendingLicenses = useMemo(
    () => filteredLicenses.filter((license) => license.status === "pending"),
    [filteredLicenses]
  );
  const expiredLicenses = useMemo(
    () => filteredLicenses.filter((license) => license.status === "expired"),
    [filteredLicenses]
  );
  const revokedLicenses = useMemo(
    () => filteredLicenses.filter((license) => license.status === "revoked"),
    [filteredLicenses]
  );

  const memberById = useMemo(() => {
    const map = new Map<number, Member>();
    filteredMembers.forEach((member) => map.set(member.id, member));
    return map;
  }, [filteredMembers]);

  const expiring = useMemo(() => {
    const today = startOfToday();
    const limit = new Date(today);
    limit.setDate(limit.getDate() + 30);
    return filteredLicenses
      .filter((license) => {
        if (license.status !== "active") {
          return false;
        }
        const end = parseIsoDate(license.end_date);
        return Boolean(end && end >= today && end <= limit);
      })
      .sort((left, right) => left.end_date.localeCompare(right.end_date));
  }, [filteredLicenses]);

  const coveredMemberIds = useMemo(() => {
    const ids = new Set<number>();
    filteredLicenses.forEach((license) => {
      if (license.status === "active" || license.status === "pending") {
        ids.add(license.member);
      }
    });
    return ids;
  }, [filteredLicenses]);

  const missingId = activeMembers.filter((member) => !member.ltf_licenseid?.trim());
  const missingDob = activeMembers.filter((member) => !member.date_of_birth);
  const noLicence = activeMembers.filter((member) => !coveredMemberIds.has(member.id));

  const invoicesByStatus = useMemo(
    () => ({
      draft: invoices.filter((invoice) => invoice.status === "draft").length,
      issued: invoices.filter((invoice) => invoice.status === "issued").length,
      paid: invoices.filter((invoice) => invoice.status === "paid").length,
      void: invoices.filter((invoice) => invoice.status === "void").length,
    }),
    [invoices]
  );

  const outstandingAmount = useMemo(
    () =>
      invoices
        .filter((invoice) => invoice.status === "issued")
        .reduce((total, invoice) => {
          const amount = Number.parseFloat(invoice.total || "0");
          return total + (Number.isFinite(amount) ? amount : 0);
        }, 0),
    [invoices]
  );
  const currency =
    invoices.find((invoice) => invoice.currency)?.currency ||
    orders.find((order) => order.currency)?.currency ||
    "EUR";

  const recentActivityRows = useMemo<ActivityRow[]>(() => {
    const orderRows = orders.map((order) => {
      let statusLabel = order.status;
      if (order.status === "draft" || order.status === "pending") {
        statusLabel = t("orderStatusPlaced");
      } else if (order.status === "paid") {
        statusLabel = t("orderStatusDelivered");
      } else if (order.status === "cancelled" || order.status === "refunded") {
        statusLabel = t("orderStatusCancelled");
      }
      return {
        id: `order-${order.id}`,
        typeLabel: t("recentActivityTypeOrder"),
        reference: order.order_number,
        statusLabel,
        totalLabel: `${order.total} ${order.currency}`,
        atLabel: formatDisplayDateTime(order.created_at),
        timestamp: toTimestamp(order.created_at),
        href: `/${locale}/dashboard/club/orders/${order.id}`,
      };
    });
    const invoiceRows = invoices.map((invoice) => {
      let statusLabel = invoice.status;
      if (invoice.status === "draft") {
        statusLabel = common("statusDraft");
      } else if (invoice.status === "issued") {
        statusLabel = t("invoiceStatusDue");
      } else if (invoice.status === "paid") {
        statusLabel = common("statusPaid");
      } else if (invoice.status === "void") {
        statusLabel = common("statusVoid");
      }
      const referenceDate = invoice.issued_at ?? invoice.created_at;
      return {
        id: `invoice-${invoice.id}`,
        typeLabel: t("recentActivityTypeInvoice"),
        reference: invoice.invoice_number,
        statusLabel,
        totalLabel: `${invoice.total} ${invoice.currency}`,
        atLabel: formatDisplayDateTime(referenceDate),
        timestamp: toTimestamp(referenceDate),
        href: `/${locale}/dashboard/club/invoices/${invoice.id}`,
      };
    });
    return [...orderRows, ...invoiceRows].sort((left, right) => right.timestamp - left.timestamp).slice(0, 10);
  }, [common, invoices, locale, orders, t]);

  const nextExpiring = expiring[0];
  const nextMember = nextExpiring ? memberById.get(nextExpiring.member) : undefined;
  const tiles: WelcomeTile[] = [
    {
      id: "members",
      label: home("tileActiveMembers"),
      value: String(activeMembers.length),
      unit: home("tileMemberUnit", { count: activeMembers.length }),
    },
    {
      id: "expiring",
      label: home("tileExpiring"),
      value: String(expiring.length),
      unit: home("tileLicenceUnit", { count: expiring.length }),
      hint:
        nextExpiring && nextMember
          ? home("welcomeNext", {
              name: formatFullName(nextMember),
              date: formatWelcomeShortDate(locale, nextExpiring.end_date),
            })
          : undefined,
    },
  ];
  if (teamCount !== null) {
    tiles.push({
      id: "teams",
      label: home("tileTeams"),
      value: String(teamCount),
      unit: home("tileTeamUnit", { count: teamCount }),
    });
  }

  const attention: WelcomeAttention[] = [];
  if (expiring.length > 0) {
    attention.push({
      id: "expiring",
      label: home("welcomeExpiring", { count: expiring.length }),
      detail: nameList(expiring.map((license) => memberById.get(license.member)).filter(isMember)),
      href: `/${locale}/dashboard/club/licenses`,
    });
  }
  if (missingId.length > 0) {
    attention.push({
      id: "missing-id",
      label: home("welcomeMissingId", { count: missingId.length }),
      detail: nameList(missingId),
      href: `/${locale}/dashboard/club/members?issue=missing_ltf_licenseid`,
    });
  }
  if (missingDob.length > 0) {
    attention.push({
      id: "missing-dob",
      label: home("welcomeMissingDob", { count: missingDob.length }),
      detail: nameList(missingDob),
      href: `/${locale}/dashboard/club/members`,
    });
  }
  if (noLicence.length > 0) {
    attention.push({
      id: "no-licence",
      label: home("welcomeNoLicence", { count: noLicence.length }),
      detail: nameList(noLicence),
      href: `/${locale}/dashboard/club/members?issue=no_valid_license`,
    });
  }
  if (incomingTransferCount > 0) {
    attention.push({
      id: "transfers",
      label: home("welcomeTransfers", { count: incomingTransferCount }),
      href: `/${locale}/dashboard/club/transfers?focus=requests#requests`,
    });
  }

  const overdueItems =
    issuedInvoicesOverdue7d > 0
      ? [
          {
            id: "issued_invoices_overdue_7d",
            label: t("overviewActionIssuedInvoicesOverdue7d"),
            count: issuedInvoicesOverdue7d,
            severity: "warning" as const,
            href: `/${locale}/dashboard/club/invoices?issue=overdue_7d`,
          },
        ]
      : [];

  return (
    <ClubAdminLayout
      title={firstName ? `${home("welcomeLead")} ${firstName}.` : home("welcomeLead")}
      subtitle={clubName}
    >
      <div className="space-y-4">
        <WelcomeOverview
          eyebrow={clubName}
          firstName={firstName}
          dateLabel={isLoading ? "" : formatWelcomeDate(locale)}
          tiles={isLoading ? [] : tiles}
          attention={isLoading ? [] : attention}
          isLoading={isLoading}
          errorMessage={errorMessage}
          onDismissError={() => setErrorMessage(null)}
        />

        {isLoading ? null : (
          <>
            <section className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-meta">
                {lastRefreshAt
                  ? t("lastRefreshLabel", { time: formatDisplayDateTime(lastRefreshAt) })
                  : t("lastRefreshNever")}
              </p>
              <Button variant="outline" onClick={() => void loadOverview({ silent: true })} disabled={isRefreshing}>
                {isRefreshing ? t("refreshingAction") : t("refreshAction")}
              </Button>
            </section>

            <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <SummaryCard title={t("totalMembers")} value={String(filteredMembers.length)} icon={Users} tone="accent" />
              <SummaryCard title={t("totalLicenses")} value={String(filteredLicenses.length)} icon={IdCard} tone="accent" />
              <SummaryCard title={t("activeLicenses")} value={String(activeLicenses.length)} icon={IdCard} tone="success" />
              <SummaryCard title={t("pendingLicenses")} value={String(pendingLicenses.length)} icon={Clock3} tone="warning" />
              <SummaryCard
                title={t("issuedInvoicesOpen")}
                value={String(invoicesByStatus.issued)}
                icon={BadgeEuro}
                tone="warning"
              />
              <SummaryCard
                title={t("outstandingAmountLabel")}
                value={`${outstandingAmount.toFixed(2)} ${currency}`}
                icon={BadgeEuro}
                tone="danger"
              />
            </section>

            <ActionQueue
              title={t("actionQueueTitle")}
              emptyLabel={t("actionQueueAllClear")}
              countLabel={(count) => t("actionQueueCountLabel", { count })}
              openLabel={t("openAction")}
              items={overdueItems}
            />

            <section className="grid gap-3 xl:grid-cols-2">
              <StatBreakdown
                title={t("licensesDistributionTitle")}
                items={[
                  { label: t("activeLicenses"), value: activeLicenses.length, tone: "success" },
                  { label: t("pendingLicenses"), value: pendingLicenses.length, tone: "warning" },
                  { label: t("expiredLicenses"), value: expiredLicenses.length, tone: "neutral" },
                  { label: t("revokedLicenses"), value: revokedLicenses.length, tone: "danger" },
                ]}
              />
              <StatBreakdown
                title={t("invoicesDistributionTitle")}
                items={[
                  { label: t("invoiceStatusDraft"), value: invoicesByStatus.draft, tone: "neutral" },
                  { label: t("invoiceStatusDue"), value: invoicesByStatus.issued, tone: "warning" },
                  { label: t("invoiceStatusPaid"), value: invoicesByStatus.paid, tone: "success" },
                  { label: t("invoiceStatusVoid"), value: invoicesByStatus.void, tone: "danger" },
                ]}
              />
            </section>

            <section className="space-y-3">
              <h2 className="text-section text-foreground">{t("recentActivityTitle")}</h2>
              {recentActivityRows.length === 0 ? (
                <EmptyState title={t("recentActivityTitle")} description={t("recentActivityEmpty")} />
              ) : (
                <EntityTable
                  columns={[
                    { key: "typeLabel", header: t("recentActivityTypeLabel"), sortable: true, sortValue: (row) => row.typeLabel },
                    { key: "reference", header: t("recentActivityReferenceLabel"), sortable: true, sortValue: (row) => row.reference },
                    { key: "statusLabel", header: t("recentActivityStatusLabel"), sortable: true, sortValue: (row) => row.statusLabel },
                    { key: "totalLabel", header: t("recentActivityTotalLabel"), sortable: true, sortValue: (row) => row.totalLabel },
                    { key: "atLabel", header: t("recentActivityAtLabel"), sortable: true, sortValue: (row) => row.timestamp },
                  ]}
                  rows={recentActivityRows}
                  sort={activitySort}
                  onSortChange={setActivitySort}
                  clientSort
                  onRowClick={(row) => router.push(row.href)}
                />
              )}
            </section>
          </>
        )}
      </div>
    </ClubAdminLayout>
  );
}

function startOfToday() {
  const today = new Date();
  return new Date(today.getFullYear(), today.getMonth(), today.getDate());
}

function isMember(value: Member | undefined): value is Member {
  return Boolean(value);
}

function nameList(members: Member[]) {
  const names = members.slice(0, 3).map((member) => formatFullName(member));
  return names.join(", ");
}

function countIssuedOverdue(rows: FinanceInvoice[], now: number) {
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  return rows.filter((invoice) => {
    if (invoice.status !== "issued") {
      return false;
    }
    const referenceTimestamp = toTimestamp(invoice.issued_at ?? invoice.created_at);
    if (referenceTimestamp === 0) {
      return false;
    }
    return now - referenceTimestamp > sevenDaysMs;
  }).length;
}

function toTimestamp(value: string | null | undefined) {
  if (!value) {
    return 0;
  }
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}
