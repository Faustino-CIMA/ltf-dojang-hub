"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { ClubAdminLayout } from "@/components/club-admin/club-admin-layout";
import { EmptyState } from "@/components/club-admin/empty-state";
import { EntityTable } from "@/components/club-admin/entity-table";
import { ClubShopTabs } from "@/components/clubmgmt/shop-tabs";
import { useClubSelection } from "@/components/club-selection-provider";
import { Button } from "@/components/ui/button";
import { ActionNotices } from "@/components/ui/list-page-chrome";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDisplayDateTime } from "@/lib/date-display";
import { asShopList, listShopSales, markShopSalePaid, type ShopSale } from "@/lib/clubmgmt-api";

export default function ClubShopSalesPage() {
  const t = useTranslations("ClubMgmt");
  const { selectedClubId } = useClubSelection();
  const [sales, setSales] = useState<ShopSale[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    if (!selectedClubId) return;
    setIsLoading(true);
    try {
      setSales(asShopList(await listShopSales(selectedClubId)));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("loadError"));
    } finally {
      setIsLoading(false);
    }
  }, [selectedClubId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const tone = (status: string) => {
    if (status === "completed") return "success" as const;
    if (status === "unpaid") return "warning" as const;
    return "neutral" as const;
  };

  return (
    <ClubAdminLayout title={t("shopSalesTitle")} subtitle={t("shopSalesSubtitle")}>
      <div className="space-y-6">
        <ClubShopTabs />
        <ActionNotices error={errorMessage} onDismiss={() => setErrorMessage(null)} />
        {isLoading ? (
          <EmptyState title={t("shopLoadingTitle")} description={t("shopLoadingSales")} loading />
        ) : sales.length === 0 ? (
          <EmptyState title={t("shopSalesEmptyTitle")} description={t("shopSalesEmptySubtitle")} />
        ) : (
          <EntityTable
            columns={[
              { key: "sale_number", header: t("shopSaleNumber") },
              { key: "member_name", header: t("shopSoldTo"), render: (row) => row.member_name || "—" },
              {
                key: "status",
                header: t("shopStatus"),
                render: (row) => <StatusBadge label={t(`shopStatus_${row.status}`)} tone={tone(row.status)} />,
              },
              { key: "total", header: t("shopPrice"), render: (row) => `${row.total} €` },
              {
                key: "created_at",
                header: t("shopSoldAt"),
                render: (row) => formatDisplayDateTime(row.created_at),
              },
              {
                key: "actions",
                header: t("shopActions"),
                render: (row) =>
                  row.status === "unpaid" && selectedClubId ? (
                    <div className="flex flex-wrap gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          markShopSalePaid(selectedClubId, row.id, "cash")
                            .then(() => load())
                            .catch((error) => setErrorMessage(error instanceof Error ? error.message : t("saveError")))
                        }
                      >
                        {t("shopMarkPaidCash")}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          markShopSalePaid(selectedClubId, row.id, "card")
                            .then(() => load())
                            .catch((error) => setErrorMessage(error instanceof Error ? error.message : t("saveError")))
                        }
                      >
                        {t("shopMarkPaidCard")}
                      </Button>
                    </div>
                  ) : null,
              },
            ]}
            rows={sales}
          />
        )}
      </div>
    </ClubAdminLayout>
  );
}
