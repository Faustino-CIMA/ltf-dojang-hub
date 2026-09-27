"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";

import { ClubAdminLayout } from "@/components/club-admin/club-admin-layout";
import { EmptyState } from "@/components/club-admin/empty-state";
import { ClubShopTabs } from "@/components/clubmgmt/shop-tabs";
import { useClubSelection } from "@/components/club-selection-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ActionNotices } from "@/components/ui/list-page-chrome";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  asShopList,
  downloadShopCatalogue,
  listShopItems,
  shopPriceRange,
  type ShopItem,
} from "@/lib/clubmgmt-api";

const CATEGORIES: Record<string, string> = {
  dobok: "shopCatDobok",
  belt: "shopCatBelt",
  protector: "shopCatProtector",
  sparring: "shopCatSparring",
  footwear: "shopCatFootwear",
  tshirt: "shopCatTshirt",
  merchandise: "shopCatMerch",
  other: "shopCatOther",
};

export default function ClubShopItemsPage() {
  const t = useTranslations("ClubMgmt");
  const locale = useLocale();
  const { selectedClubId } = useClubSelection();
  const [items, setItems] = useState<ShopItem[]>([]);
  const [query, setQuery] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    if (!selectedClubId) return;
    setIsLoading(true);
    try {
      setItems(asShopList(await listShopItems(selectedClubId)));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("loadError"));
    } finally {
      setIsLoading(false);
    }
  }, [selectedClubId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => `${item.sku} ${item.name}`.toLowerCase().includes(q));
  }, [items, query]);

  return (
    <ClubAdminLayout title={t("shopItemsTitle")} subtitle={t("shopItemsSubtitle")}>
      <div className="space-y-6">
        <ClubShopTabs />
        <ActionNotices error={errorMessage} onDismiss={() => setErrorMessage(null)} />
        <div className="flex flex-wrap items-center gap-3">
          <Input
            className="max-w-xs"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("shopSearchItems")}
          />
          <Button asChild variant="primary">
            <Link href={`/${locale}/dashboard/club/shop/items/new`}>{t("shopAddItem")}</Link>
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => selectedClubId && downloadShopCatalogue(selectedClubId).catch((error) => setErrorMessage(error.message))}
          >
            {t("shopPrintCatalogue")}
          </Button>
          <Button asChild variant="outline">
            <Link href={`/${locale}/dashboard/club/shop/snapshots`}>{t("shopPrintCountSheet")}</Link>
          </Button>
        </div>
        {isLoading ? (
          <EmptyState title={t("shopLoadingTitle")} description={t("shopLoadingStock")} loading />
        ) : visible.length === 0 ? (
          <EmptyState title={t("shopEmptyTitle")} description={t("shopEmptySubtitle")} />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((item) => {
              const range = shopPriceRange(item);
              const active = item.variants.filter((row) => row.is_active);
              return (
                <Link
                  key={item.id}
                  href={`/${locale}/dashboard/club/shop/items/${item.id}`}
                  className="app-panel overflow-hidden transition-shadow hover:shadow-[var(--shadow-card)]"
                >
                  <div className="aspect-[4/3] bg-secondary">
                    {item.photo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.photo_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-sm text-muted">{t("shopNoPhoto")}</div>
                    )}
                  </div>
                  <div className="space-y-2 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold tracking-wide text-muted">{item.sku}</p>
                        <h2 className="text-sm font-semibold text-foreground">{item.name}</h2>
                      </div>
                      <p className="text-sm font-semibold tabular-nums">
                        {range.min === range.max ? `${range.min} €` : t("shopPriceFrom", { price: range.min })}
                      </p>
                    </div>
                    <StatusBadge label={t(CATEGORIES[item.category] || "shopCatOther")} tone="neutral" />
                    <ul className="space-y-1 text-xs text-muted">
                      {active.map((row) => (
                        <li key={row.id} className="flex justify-between gap-2">
                          <span>{row.label === "Standard" ? t("shopOnShelf") : row.label}</span>
                          <span className={row.low_stock ? "font-semibold text-[var(--warning)]" : "tabular-nums text-foreground"}>
                            {row.quantity}
                            {row.low_stock ? ` · ${t("shopLow")}` : ""}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </ClubAdminLayout>
  );
}
