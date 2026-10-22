"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { LtfAdminLayout } from "@/components/ltf-admin/ltf-admin-layout";
import {
  formatWelcomeDate,
  formatWelcomeShortDate,
  WelcomeOverview,
  type WelcomeAttention,
  type WelcomeTile,
} from "@/components/welcome-overview";
import { apiRequest } from "@/lib/api";
import { formatFullName } from "@/lib/person-name";
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

  const loadOverview = useCallback(async () => {
    setIsLoading(true);
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
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("overviewLoadError"));
    } finally {
      setIsLoading(false);
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

  return (
    <LtfAdminLayout
      title={firstName ? `${home("welcomeLead")} ${firstName}.` : home("welcomeLead")}
      subtitle={eyebrow || home("kicker")}
    >
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
