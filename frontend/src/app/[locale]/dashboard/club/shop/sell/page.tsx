"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Camera, Minus, Plus, Trash2 } from "lucide-react";

import { ClubAdminLayout } from "@/components/club-admin/club-admin-layout";
import { EmptyState } from "@/components/club-admin/empty-state";
import { ShopCameraScan } from "@/components/clubmgmt/shop-camera-scan";
import { ClubShopTabs } from "@/components/clubmgmt/shop-tabs";
import { useClubSelection } from "@/components/club-selection-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ActionNotices, FormPanel } from "@/components/ui/list-page-chrome";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getMembersList } from "@/lib/club-admin-api";
import {
  asShopList,
  createShopSale,
  getShopOverview,
  listShopItems,
  scanShopCode,
  shopPriceRange,
  type ShopItem,
  type ShopOverview,
} from "@/lib/clubmgmt-api";

type BasketLine = {
  variantId: number;
  itemId: number;
  name: string;
  sku: string;
  label: string;
  price: string;
  quantity: number;
  photo_url: string;
  onHand: number;
  trackStock: boolean;
};

export default function ClubShopSellPage() {
  const t = useTranslations("ClubMgmt");
  const locale = useLocale();
  const { selectedClubId } = useClubSelection();
  const [items, setItems] = useState<ShopItem[]>([]);
  const [overview, setOverview] = useState<ShopOverview | null>(null);
  const [members, setMembers] = useState<Array<{ id: number; first_name: string; last_name: string }>>([]);
  const [query, setQuery] = useState("");
  const [memberQuery, setMemberQuery] = useState("");
  const [basket, setBasket] = useState<BasketLine[]>([]);
  const [memberId, setMemberId] = useState<string>("walkin");
  const [walkIn, setWalkIn] = useState("");
  const [payMethod, setPayMethod] = useState("cash");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [sizePickId, setSizePickId] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!selectedClubId) return;
    setIsLoading(true);
    try {
      const [shopItems, memberRows, shopOverview] = await Promise.all([
        listShopItems(selectedClubId),
        getMembersList({ clubId: selectedClubId, isActive: true }),
        getShopOverview(selectedClubId),
      ]);
      setItems(asShopList(shopItems));
      setMembers(
        memberRows
          .filter((row) => row.club === selectedClubId && row.is_active)
          .map((row) => ({ id: row.id, first_name: row.first_name, last_name: row.last_name })),
      );
      setOverview(shopOverview);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("loadError"));
    } finally {
      setIsLoading(false);
    }
  }, [selectedClubId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const addVariant = (item: ShopItem, variantId: number) => {
    const variant = item.variants.find((row) => row.id === variantId);
    if (!variant) return;
    if (item.track_stock && variant.quantity <= 0) return;
    setBasket((current) => {
      const existing = current.find((row) => row.variantId === variantId);
      if (existing) {
        const nextQty = existing.quantity + 1;
        if (item.track_stock && nextQty > variant.quantity) return current;
        return current.map((row) => (row.variantId === variantId ? { ...row, quantity: nextQty } : row));
      }
      return [
        ...current,
        {
          variantId,
          itemId: item.id,
          name: item.name,
          sku: item.sku,
          label: variant.label,
          price: variant.sale_price || item.sale_price,
          quantity: 1,
          photo_url: item.photo_url,
          onHand: variant.quantity,
          trackStock: item.track_stock,
        },
      ];
    });
    setSizePickId(null);
  };

  const setLineQty = (variantId: number, quantity: number) => {
    setBasket((current) =>
      current
        .map((row) => {
          if (row.variantId !== variantId) return row;
          const max = row.trackStock ? row.onHand : 99;
          const next = Math.min(max, Math.max(0, quantity));
          return { ...row, quantity: next };
        })
        .filter((row) => row.quantity > 0),
    );
  };

  const addFromScan = useCallback(
    async (code: string) => {
      if (!selectedClubId || !code.trim()) return;
      try {
        const hit = await scanShopCode(selectedClubId, code.trim());
        const item = items.find((row) => row.id === hit.item_id);
        if (item) addVariant(item, hit.variant_id);
        else {
          setBasket((current) => {
            const existing = current.find((row) => row.variantId === hit.variant_id);
            if (existing) {
              return current.map((row) =>
                row.variantId === hit.variant_id ? { ...row, quantity: row.quantity + 1 } : row,
              );
            }
            return [
              ...current,
              {
                variantId: hit.variant_id,
                itemId: hit.item_id,
                name: hit.name,
                sku: hit.sku,
                label: hit.label,
                price: hit.sale_price,
                quantity: 1,
                photo_url: hit.photo_url,
                onHand: hit.quantity,
                trackStock: true,
              },
            ];
          });
        }
        setErrorMessage(null);
        setSuccessMessage(
          t("shopScanAdded", {
            item: hit.label && hit.label !== "Standard" ? `${hit.name} · ${hit.label}` : hit.name,
          }),
        );
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : t("shopScanMiss"));
      }
    },
    [items, selectedClubId, t],
  );

  const visibleItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? items.filter((item) => `${item.sku} ${item.name}`.toLowerCase().includes(q)) : items;
    return list.slice(0, 24);
  }, [items, query]);

  const visibleMembers = useMemo(() => {
    const q = memberQuery.trim().toLowerCase();
    if (!q) return [];
    return members
      .filter((member) =>
        `${member.first_name} ${member.last_name} ${member.last_name} ${member.first_name}`.toLowerCase().includes(q),
      )
      .slice(0, 12);
  }, [memberQuery, members]);
  const soldToMember = members.find((member) => String(member.id) === memberId) ?? null;

  const total = basket.reduce((sum, row) => sum + Number(row.price) * row.quantity, 0);

  const checkout = async () => {
    if (!selectedClubId || basket.length === 0) return;
    setIsSaving(true);
    setErrorMessage(null);
    try {
      const sale = await createShopSale(selectedClubId, {
        member: memberId === "walkin" ? null : Number(memberId),
        walk_in_name: memberId === "walkin" ? walkIn : "",
        payment_method: payMethod,
        lines: basket.map((row) => ({ variant: row.variantId, quantity: row.quantity, unit_price: row.price })),
      });
      setBasket([]);
      setSuccessMessage(t("shopSaleDone", { number: sale.sale_number, total: sale.total }));
      await load();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("saveError"));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ClubAdminLayout title={t("shopSellTitle")} subtitle={t("shopSellSubtitle")}>
      <div className="space-y-6">
        <ClubShopTabs />
        <ActionNotices
          error={errorMessage}
          success={successMessage}
          onDismiss={() => {
            setErrorMessage(null);
            setSuccessMessage(null);
          }}
        />
        {cameraOpen ? (
          <ShopCameraScan onCode={(code) => void addFromScan(code)} onClose={() => setCameraOpen(false)} />
        ) : null}
        {isLoading ? (
          <EmptyState title={t("shopLoadingTitle")} description={t("shopLoadingSell")} loading />
        ) : items.length === 0 ? (
          <EmptyState
            title={t("shopEmptyTitle")}
            description={t("shopEmptySubtitle")}
            action={
              <Button asChild variant="primary">
                <Link href={`/${locale}/dashboard/club/shop/items/new`}>{t("shopAddItem")}</Link>
              </Button>
            }
          />
        ) : (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="space-y-4">
              {(overview?.low_stock.length ?? 0) > 0 ? (
                <p className="text-sm text-muted">
                  {t("shopLowStockCount", { count: overview?.low_stock_count ?? 0 })}
                  {overview?.low_stock.slice(0, 3).map((row) => (
                    <span key={row.id}>
                      {" · "}
                      {row.name}
                      {row.label !== "Standard" ? ` ${row.label}` : ""} ({row.quantity})
                    </span>
                  ))}
                </p>
              ) : null}
              <FormPanel>
                <Label>{t("shopScan")}</Label>
                <div className="mt-2">
                  <Button type="button" variant="primary" className="w-full sm:w-auto" onClick={() => setCameraOpen(true)}>
                    <Camera className="size-4" aria-hidden />
                    {t("shopScanCamera")}
                  </Button>
                </div>
                <p className="mt-2 text-xs text-muted">{t("shopScanHint")}</p>
              </FormPanel>
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("shopSearchItems")} />
              <div className="grid gap-3 sm:grid-cols-2">
                {visibleItems.map((item) => {
                  const active = item.variants.filter((row) => row.is_active);
                  const range = shopPriceRange(item);
                  const open = sizePickId === item.id;
                  return (
                    <div key={item.id} className="app-panel p-3">
                      <button
                        type="button"
                        className="flex w-full gap-3 text-left"
                        onClick={() => {
                          if (active.length <= 1) {
                            addVariant(item, active[0]?.id);
                            return;
                          }
                          setSizePickId(open ? null : item.id);
                        }}
                      >
                        <div className="size-16 shrink-0 overflow-hidden rounded-[var(--radius-form)] bg-secondary">
                          {item.photo_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={item.photo_url} alt="" className="h-full w-full object-cover" />
                          ) : null}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{item.name}</p>
                          <p className="text-sm tabular-nums">
                            {range.min === range.max ? `${range.min} €` : t("shopPriceFrom", { price: range.min })}
                          </p>
                          {active.length > 1 ? (
                            <p className="text-xs text-muted">{t("shopChooseSize")}</p>
                          ) : (
                            <p className="text-xs text-muted">{t("shopQty", { count: active[0]?.quantity ?? 0 })}</p>
                          )}
                        </div>
                      </button>
                      {open ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {active.map((row) => {
                            const empty = item.track_stock && row.quantity <= 0;
                            return (
                              <Button
                                key={row.id}
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={empty}
                                onClick={() => addVariant(item, row.id)}
                              >
                                {row.label} · {row.sale_price} € · {row.quantity}
                              </Button>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
            <FormPanel>
              <h2 className="text-section text-foreground">{t("shopBasket")}</h2>
              {basket.length === 0 ? (
                <p className="mt-3 text-sm text-muted">{t("shopBasketEmpty")}</p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {basket.map((row) => (
                    <li key={row.variantId} className="text-sm">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium">{row.name}</p>
                          <p className="text-muted">
                            {row.label !== "Standard" ? `${row.label} · ` : ""}
                            {row.price} €
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => setBasket((current) => current.filter((line) => line.variantId !== row.variantId))}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <Button type="button" variant="outline" size="icon-xs" onClick={() => setLineQty(row.variantId, row.quantity - 1)}>
                          <Minus className="size-3" />
                        </Button>
                        <span className="tabular-nums">{row.quantity}</span>
                        <Button type="button" variant="outline" size="icon-xs" onClick={() => setLineQty(row.variantId, row.quantity + 1)}>
                          <Plus className="size-3" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-4 text-lg font-semibold tabular-nums">{total.toFixed(2)} €</p>
              <div className="mt-4 space-y-3">
                <div>
                  <Label htmlFor="shop-sold-to">{t("shopSoldTo")}</Label>
                  <Input
                    id="shop-sold-to"
                    className="mt-1"
                    value={soldToMember ? `${soldToMember.first_name} ${soldToMember.last_name}` : memberQuery}
                    onChange={(event) => {
                      setMemberId("walkin");
                      setMemberQuery(event.target.value);
                    }}
                    placeholder={t("shopSearchMember")}
                  />
                  {memberQuery.trim() && !soldToMember ? (
                    <ul className="mt-1 max-h-48 overflow-auto rounded-[var(--radius-form)] border border-border">
                      {visibleMembers.length === 0 ? (
                        <li className="px-3 py-2 text-sm text-muted">{t("shopNoMember")}</li>
                      ) : (
                        visibleMembers.map((member) => (
                          <li key={member.id} className="border-b border-border last:border-0">
                            <button
                              type="button"
                              className="w-full px-3 py-2 text-left text-sm hover:bg-accent"
                              onClick={() => {
                                setMemberId(String(member.id));
                                setMemberQuery("");
                              }}
                            >
                              {member.first_name} {member.last_name}
                            </button>
                          </li>
                        ))
                      )}
                    </ul>
                  ) : null}
                  {soldToMember ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="mt-1"
                      onClick={() => {
                        setMemberId("walkin");
                        setMemberQuery("");
                      }}
                    >
                      {t("shopWalkIn")}
                    </Button>
                  ) : null}
                </div>
                {memberId === "walkin" ? (
                  <Input value={walkIn} onChange={(event) => setWalkIn(event.target.value)} placeholder={t("shopWalkInName")} />
                ) : null}
                <div>
                  <Label>{t("shopPayHow")}</Label>
                  <div className="mt-1">
                    <Select value={payMethod} onValueChange={setPayMethod}>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cash">{t("shopPayCash")}</SelectItem>
                        <SelectItem value="card">{t("shopPayCard")}</SelectItem>
                        <SelectItem value="other">{t("shopPayOther")}</SelectItem>
                        <SelectItem value="unpaid">{t("shopPayLater")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button type="button" variant="primary" disabled={isSaving || basket.length === 0} onClick={() => void checkout()}>
                  {isSaving ? t("saving") : t("shopCompleteSale")}
                </Button>
              </div>
            </FormPanel>
          </div>
        )}
      </div>
    </ClubAdminLayout>
  );
}
