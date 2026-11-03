"use client";

import { useCallback, useState, useEffect } from "react";
import { useLocale, useTranslations } from "next-intl";
import { AlertTriangle, IdCard, Users } from "lucide-react";

import { EmptyState } from "@/components/club-admin/empty-state";
import { EntityTable } from "@/components/club-admin/entity-table";
import { SummaryCard } from "@/components/club-admin/summary-card";
import { LtfAdminLayout } from "@/components/ltf-admin/ltf-admin-layout";
import { Button } from "@/components/ui/button";
import {
  formatWelcomeDate,
  formatWelcomeShortDate,
  WelcomeOverview,
  type WelcomeAttention,
  type WelcomeTile,
} from "@/components/welcome-overview";
import { apiRequest } from "@/lib/api";
import { formatDisplayDateTime } from "@/lib/date-display";
import { formatFullName } from "@/lib/person-name";
import type { TableSort } from "@/lib/table-sort";
import {
  getFederationProfile,
  getLtfAdminOverview,
  type LtfAdminOverviewResponse,
} from "@/lib/ltf-admin-api";

type MeResponse = {
  first_name: string;
  username: string;
};

export default function LtfAdminOverviewPage() {
  const t = useTranslations("LtfAdmin");
  const home = useTranslations("Home");
  const locale = useLocale();
  const [overview, setOverview] = useState<LtfAdminOverviewResponse | null>(null);
  const [eyebrow, setEyebrow] = useState("");
  const [firstName, setFirstName] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshAt, setLastRefreshAt] = useState<string | null>(null);
  const [clubSort, setClubSort] = useState<TableSort | null>(null);

  const loadOverview = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    if (silent) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setErrorMessage(null);
    try {
      const [response, me, federation] = await Promise.all([
        getLtfAdminOverview(),
        apiRequest<MeResponse>("/api/auth/me/"),
        getFederationProfile().catch(() => null),
      ]);
      setOverview(response);
      setFirstName(me.first_name?.trim() || me.username);
      setEyebrow(federation?.name?.trim() || "");
      setLastRefreshAt(response.meta.generated_at || new Date().toISOString());
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("overviewLoadError"));
    } finally {
      if (silent) {
        setIsRefreshing(false);
      } else {
        setIsLoading(false);
      }
    }
  }, [t]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const cards = overview?.cards;
  const next = overview?.next_expiring;
  const tiles: WelcomeTile[] = cards
    ? [
        {
          id: "clubs",
          label: home("tileClubs"),
          value: String(cards.total_clubs),
          unit: home("tileClubUnit", { count: cards.total_clubs }),
        },
        {
          id: "pending",
          label: home("tilePending"),
          value: String(cards.pending_licenses),
          unit: home("tileLicenceUnit", { count: cards.pending_licenses }),
        },
        {
          id: "expiring",
          label: home("tileExpiring"),
          value: String(cards.expiring_in_30_days),
          unit: home("tileLicenceUnit", { count: cards.expiring_in_30_days }),
          hint: next
            ? home("welcomeNext", {
                name: formatFullName(next),
                date: formatWelcomeShortDate(locale, next.end_date),
              })
            : undefined,
        },
      ]
    : [];

  const attention: WelcomeAttention[] = [];
  if (cards && cards.expiring_in_30_days > 0) {
    attention.push({
      id: "expiring",
      label: home("welcomeExpiring", { count: cards.expiring_in_30_days }),
      detail: next ? formatFullName(next) : undefined,
      href: `/${locale}/dashboard/ltf/licenses`,
    });
  }
  overview?.action_queue.forEach((item) => {
    if (item.count <= 0) {
      return;
    }
    attention.push({
      id: item.key,
      label: attentionLabel(home, item.key, item.count),
      href: `/${locale}${item.link.path}`,
    });
  });

  const topClubs = (overview?.top_clubs ?? []).map((row) => ({
    id: row.club_id,
    ...row,
  }));

  return (
    <LtfAdminLayout
      title={firstName ? `${home("welcomeLead")} ${firstName}.` : home("welcomeLead")}
      subtitle={eyebrow || home("kicker")}
    >
      <div className="space-y-4">
        <WelcomeOverview
          eyebrow={eyebrow || home("kicker")}
          firstName={firstName}
          dateLabel={isLoading ? "" : formatWelcomeDate(locale)}
          tiles={tiles}
          attention={attention}
          isLoading={isLoading}
          errorMessage={errorMessage}
          onDismissError={() => setErrorMessage(null)}
        />

        {isLoading || !cards ? null : (
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
              <SummaryCard title={t("activeMembers")} value={String(cards.active_members)} icon={Users} tone="success" />
              <SummaryCard title={t("ltfStaffCount")} value={String(cards.ltf_staff)} icon={Users} tone="accent" />
              <SummaryCard title={t("activeLicenses")} value={String(cards.active_licenses)} icon={IdCard} tone="success" />
              <SummaryCard title={t("expiredLicenses")} value={String(cards.expired_licenses)} icon={IdCard} tone="neutral" />
              <SummaryCard title={t("revokedLicenses")} value={String(cards.revoked_licenses)} icon={AlertTriangle} tone="danger" />
            </section>

            <section className="space-y-3">
              <h2 className="text-section text-foreground">{t("topClubsTitle")}</h2>
              {topClubs.length === 0 ? (
                <EmptyState title={t("topClubsTitle")} description={t("topClubsEmpty")} />
              ) : (
                <EntityTable
                  columns={[
                    { key: "club_name", header: t("clubLabel"), sortable: true, sortValue: (row) => row.club_name },
                    { key: "active_members", header: t("activeMembers"), sortable: true, sortValue: (row) => row.active_members },
                    { key: "active_licenses", header: t("activeLicenses"), sortable: true, sortValue: (row) => row.active_licenses },
                    { key: "pending_licenses", header: t("pendingLicenses"), sortable: true, sortValue: (row) => row.pending_licenses },
                  ]}
                  rows={topClubs}
                  sort={clubSort}
                  onSortChange={setClubSort}
                  clientSort
                />
              )}
            </section>
          </>
        )}
      </div>
    </LtfAdminLayout>
  );
}

function attentionLabel(
  home: ReturnType<typeof useTranslations<"Home">>,
  key: LtfAdminOverviewResponse["action_queue"][number]["key"],
  count: number
) {
  switch (key) {
    case "clubs_without_admin":
      return home("welcomeClubsWithoutAdmin", { count });
    case "paid_pending_transfers":
      return home("welcomeTransfers", { count });
    case "members_missing_ltf_licenseid":
      return home("welcomeMissingId", { count });
    case "members_without_active_or_pending_license":
      return home("welcomeNoLicence", { count });
    default:
      return home("welcomeOpen");
  }
}
