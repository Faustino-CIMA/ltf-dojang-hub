"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsUpDown, Trash2 } from "lucide-react";

import { ClubAdminLayout } from "@/components/club-admin/club-admin-layout";
import { EmptyState } from "@/components/club-admin/empty-state";
import { ClubShopTabs } from "@/components/clubmgmt/shop-tabs";
import { useClubSelection } from "@/components/club-selection-provider";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  asShopList,
  downloadShopStickers,
  getShopItem,
  listShopItems,
  prepareShopPhoto,
  receiveShopStock,
  saveShopItem,
  type ShopItem,
} from "@/lib/clubmgmt-api";
import { getPrinterProfiles, type PrinterProfile } from "@/lib/license-card-api";
import { formatMoneyInput } from "@/lib/money-input";

const NO_PRINTER_PROFILE = "none";

const CATEGORIES = [
  ["dobok", "shopCatDobok"],
  ["belt", "shopCatBelt"],
  ["protector", "shopCatProtector"],
  ["sparring", "shopCatSparring"],
  ["footwear", "shopCatFootwear"],
  ["tshirt", "shopCatTshirt"],
  ["merchandise", "shopCatMerch"],
  ["other", "shopCatOther"],
] as const;

const DOBOK_SIZES = Array.from({ length: 10 }, (_, index) => String(110 + index * 10));
const FOOTWEAR_SIZES = Array.from({ length: 15 }, (_, index) => String(30 + index));
const PROTECTOR_SIZES = ["XXS", "XS", "S", "M", "L", "XL", "XXL"];
const TSHIRT_YOUTH_SIZES = ["YL", "YXL", "Y2XL"];
const TSHIRT_ADULT_SIZES = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "3XL", "4XL", "5XL", "6XL"];

type SizeGroup = { key: string; labelKey?: string; sizes: string[] };

function sizeGroupsFor(category: string): SizeGroup[] {
  if (category === "dobok") return [{ key: "dobok", sizes: DOBOK_SIZES }];
  if (category === "footwear") return [{ key: "footwear", labelKey: "shopFootwearEuSizes", sizes: FOOTWEAR_SIZES }];
  if (category === "protector") return [{ key: "protector", sizes: PROTECTOR_SIZES }];
  if (category === "tshirt") {
    return [
      { key: "youth", labelKey: "shopYouthSizes", sizes: TSHIRT_YOUTH_SIZES },
      { key: "adult", labelKey: "shopAdultSizes", sizes: TSHIRT_ADULT_SIZES },
    ];
  }
  return [];
}

type SizeRow = {
  key: string;
  label: string;
  sale_price: string;
  cost_price: string;
  quantity: string;
  reorder_level: string;
  onHand: number;
  variantId?: number;
};

type SizeSortKey = "label" | "cost_price" | "sale_price";
type SizeSortDir = "asc" | "desc";

const CLOTHING_SIZE_ORDER = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "2XL", "3XL", "4XL", "5XL", "6XL"];
const YOUTH_SIZE_ORDER = ["YS", "YM", "YL", "YXL", "YXXL", "Y2XL"];

function newRow(label: string, sale = "", cost = ""): SizeRow {
  return {
    key: `${label}-${Math.random().toString(36).slice(2, 8)}`,
    label,
    sale_price: sale,
    cost_price: cost,
    quantity: "",
    reorder_level: "2",
    onHand: 0,
  };
}

function moneySortValue(value: string): number {
  const amount = Number(value.trim().replace(",", "."));
  return Number.isFinite(amount) ? amount : 0;
}

function sizeSortValue(label: string): [number, number | string] {
  const normalized = label.trim().toUpperCase();
  const clothing = CLOTHING_SIZE_ORDER.indexOf(normalized);
  if (clothing >= 0) return [0, clothing];
  const youth = YOUTH_SIZE_ORDER.indexOf(normalized);
  if (youth >= 0) return [1, youth];
  const numeric = Number(normalized.replace(",", "."));
  if (normalized !== "" && Number.isFinite(numeric)) return [2, numeric];
  return [3, normalized.toLowerCase()];
}

function compareSizeRows(left: SizeRow, right: SizeRow, key: SizeSortKey, dir: SizeSortDir): number {
  let cmp = 0;
  if (key === "label") {
    const [leftGroup, leftValue] = sizeSortValue(left.label);
    const [rightGroup, rightValue] = sizeSortValue(right.label);
    cmp =
      leftGroup - rightGroup ||
      (typeof leftValue === "number" && typeof rightValue === "number"
        ? leftValue - rightValue
        : String(leftValue).localeCompare(String(rightValue), undefined, { numeric: true }));
  } else {
    cmp = moneySortValue(left[key]) - moneySortValue(right[key]);
  }
  return dir === "asc" ? cmp : -cmp;
}

export default function ClubShopItemDetailPage() {
  const t = useTranslations("ClubMgmt");
  const locale = useLocale();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const { selectedClubId } = useClubSelection();
  const isNew = params.id === "new";
  const [activeItemId, setActiveItemId] = useState(params.id);
  const loadSeq = useRef(0);
  const showingItem = useRef(false);
  const [item, setItem] = useState<ShopItem | null>(null);
  const [shelf, setShelf] = useState<ShopItem[]>([]);
  const shelfScroller = useRef<HTMLDivElement>(null);
  const ignoreShelfScroll = useRef(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<string>("other");
  const [usualSale, setUsualSale] = useState("");
  const [usualCost, setUsualCost] = useState("");
  const [sizes, setSizes] = useState<SizeRow[]>([]);
  const [sortKey, setSortKey] = useState<SizeSortKey>("label");
  const [sortDir, setSortDir] = useState<SizeSortDir>("asc");
  const [sizeDraft, setSizeDraft] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState("");
  const [trackStock, setTrackStock] = useState(true);
  const [deliveryQty, setDeliveryQty] = useState<Record<number, string>>({});
  const [stickerCopies, setStickerCopies] = useState("8");
  const [stickerTarget, setStickerTarget] = useState<string>("");
  const [stickerStart, setStickerStart] = useState(1);
  const [printerProfiles, setPrinterProfiles] = useState<PrinterProfile[]>([]);
  const [printerProfileValue, setPrinterProfileValue] = useState(NO_PRINTER_PROFILE);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(!isNew);

  const load = useCallback(async () => {
    if (!selectedClubId || isNew) return;
    const seq = ++loadSeq.current;
    if (!showingItem.current) setIsLoading(true);
    setPhoto(null);
    try {
      const next = await getShopItem(selectedClubId, Number(activeItemId));
      if (seq !== loadSeq.current) return;
      showingItem.current = true;
      setItem(next);
      setName(next.name);
      setDescription(next.description);
      setCategory(next.category);
      setUsualSale(next.sale_price);
      setUsualCost(next.cost_price || "");
      setTrackStock(next.track_stock);
      const active = next.variants.filter((row) => row.is_active);
      setSortKey("label");
      setSortDir("asc");
      setSizes(
        active
          .map((row) => ({
            key: String(row.id),
            label: row.label,
            sale_price: row.sale_price,
            cost_price: row.cost_price || "",
            quantity: "",
            reorder_level: String(row.reorder_level ?? 2),
            onHand: row.quantity,
            variantId: row.id,
          }))
          .sort((left, right) => compareSizeRows(left, right, "label", "asc")),
      );
      setPhotoPreview(next.photo_url);
      setDeliveryQty({});
      setStickerTarget(active[0] ? String(active[0].id) : "all");
    } catch (error) {
      if (seq !== loadSeq.current) return;
      setErrorMessage(error instanceof Error ? error.message : t("loadError"));
    } finally {
      if (seq === loadSeq.current) setIsLoading(false);
    }
  }, [activeItemId, isNew, selectedClubId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!selectedClubId || isNew) return;
    let cancelled = false;
    listShopItems(selectedClubId)
      .then((rows) => {
        if (!cancelled) setShelf(asShopList(rows));
      })
      .catch(() => {
        if (!cancelled) setShelf([]);
      });
    return () => {
      cancelled = true;
    };
  }, [isNew, selectedClubId]);

  const shelfIndex = shelf.findIndex((row) => row.id === Number(activeItemId));
  const previousItem = shelf.length > 1 ? shelf[(shelfIndex - 1 + shelf.length) % shelf.length] : null;
  const nextItem = shelf.length > 1 ? shelf[(shelfIndex + 1) % shelf.length] : null;

  const openItem = useCallback(
    (target: ShopItem) => {
      if (String(target.id) === activeItemId) return;
      setPhoto(null);
      setSuccessMessage(null);
      setErrorMessage(null);
      setActiveItemId(String(target.id));
      window.history.replaceState(window.history.state, "", `/${locale}/dashboard/club/shop/items/${target.id}`);
    },
    [activeItemId, locale],
  );

  useEffect(() => {
    const scroller = shelfScroller.current;
    if (!scroller || shelfIndex < 0) return;
    const current = scroller.querySelector<HTMLElement>(`[data-shelf-id="${activeItemId}"]`);
    ignoreShelfScroll.current = true;
    current?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
    const timer = window.setTimeout(() => {
      ignoreShelfScroll.current = false;
    }, 450);
    return () => window.clearTimeout(timer);
  }, [activeItemId, shelfIndex]);

  useEffect(() => {
    const scroller = shelfScroller.current;
    if (!scroller || isNew || shelf.length < 2) return;
    let timer: number | undefined;
    const settle = () => {
      if (ignoreShelfScroll.current) return;
      const cards = [...scroller.querySelectorAll<HTMLElement>("[data-shelf-id]")];
      const middle = scroller.getBoundingClientRect().left + scroller.clientWidth / 2;
      let closest: HTMLElement | null = null;
      let distance = Number.POSITIVE_INFINITY;
      for (const card of cards) {
        const box = card.getBoundingClientRect();
        const delta = Math.abs(box.left + box.width / 2 - middle);
        if (delta < distance) {
          distance = delta;
          closest = card;
        }
      }
      const nextId = Number(closest?.dataset.shelfId);
      if (!nextId || nextId === Number(activeItemId)) return;
      const target = shelf.find((row) => row.id === nextId);
      if (target) openItem(target);
    };
    const onScroll = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(settle, 140);
    };
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      window.clearTimeout(timer);
    };
  }, [activeItemId, isNew, openItem, shelf]);

  useEffect(() => {
    if (isNew || !previousItem || !nextItem) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable) return;
      if (event.altKey || event.metaKey || event.ctrlKey) return;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        openItem(previousItem);
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        openItem(nextItem);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isNew, nextItem, openItem, previousItem]);

  useEffect(() => {
    let cancelled = false;
    getPrinterProfiles()
      .then((rows) => {
        if (cancelled) return;
        const list = Array.isArray(rows) ? rows : [];
        setPrinterProfiles(list);
      })
      .catch(() => {
        if (!cancelled) setPrinterProfiles([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!photo) return;
    const url = URL.createObjectURL(photo);
    setPhotoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  const title = isNew ? t("shopAddItem") : item?.name || t("shopStockTitle");
  const activeVariants = useMemo(() => item?.variants.filter((row) => row.is_active) ?? [], [item]);
  const suggestedGroups = sizeGroupsFor(category);

  const addSize = (label: string) => {
    const next = label.trim();
    if (!next || sizes.some((row) => row.label === next)) return;
    setSizes((current) => [...current, newRow(next, usualSale, usualCost)].sort((left, right) => compareSizeRows(left, right, sortKey, sortDir)));
    setSizeDraft("");
  };

  const sortSizesBy = (key: SizeSortKey) => {
    const dir: SizeSortDir = sortKey === key && sortDir === "asc" ? "desc" : "asc";
    setSortKey(key);
    setSortDir(dir);
    setSizes((current) => [...current].sort((left, right) => compareSizeRows(left, right, key, dir)));
  };

  const updateSize = (key: string, patch: Partial<SizeRow>) => {
    setSizes((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  };

  const removeSize = (key: string) => {
    setSizes((current) => current.filter((row) => row.key !== key));
  };

  const onSave = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedClubId) return;
    const missingSale = sizes.length
      ? sizes.some((row) => !formatMoneyInput(row.sale_price || usualSale).trim())
      : !formatMoneyInput(usualSale).trim();
    if (missingSale) {
      setErrorMessage(t("shopNeedSalePrice"));
      return;
    }
    setIsSaving(true);
    setErrorMessage(null);
    try {
      const payload = new FormData();
      payload.set("name", name.trim());
      payload.set("description", description.trim());
      payload.set("category", category);
      if (formatMoneyInput(usualSale).trim()) payload.set("sale_price", formatMoneyInput(usualSale));
      if (formatMoneyInput(usualCost).trim()) payload.set("cost_price", formatMoneyInput(usualCost));
      payload.set("track_stock", trackStock ? "true" : "false");
      payload.set(
        "sizes",
        JSON.stringify(
          sizes
            .filter((row) => row.label.trim())
            .map((row) => ({
              label: row.label.trim(),
              sale_price: formatMoneyInput(row.sale_price || usualSale),
              cost_price: formatMoneyInput(row.cost_price || usualCost),
              quantity: row.quantity.trim() || "0",
              reorder_level: row.reorder_level.trim() || "2",
            })),
        ),
      );
      if (photo) payload.set("photo", await prepareShopPhoto(photo));
      const saved = await saveShopItem(selectedClubId, payload, isNew ? undefined : Number(activeItemId));
      setSuccessMessage(t("saved"));
      if (isNew) {
        router.replace(`/${locale}/dashboard/club/shop/items/${saved.id}`);
      } else {
        await load();
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("saveError"));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ClubAdminLayout title={title} subtitle={item ? item.sku : t("shopAddItemHint")}>
      <div className="space-y-6">
        <ClubShopTabs />
        {!isNew && shelf.length > 1 && shelfIndex >= 0 && previousItem && nextItem ? (
          <div className="space-y-2">
            <div className="relative">
              <Button
                type="button"
                variant="secondary"
                size="icon-sm"
                className="absolute top-1/2 left-1 z-10 -translate-y-1/2 shadow-sm"
                aria-label={previousItem.name}
                onClick={() => openItem(previousItem)}
              >
                <ChevronLeft className="size-4" aria-hidden />
              </Button>
              <div
                ref={shelfScroller}
                className="flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth px-[28%] py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                {shelf.map((row) => {
                  const active = row.id === Number(activeItemId);
                  return (
                    <button
                      key={row.id}
                      type="button"
                      data-shelf-id={row.id}
                      onClick={() => openItem(row)}
                      className={`w-36 shrink-0 snap-center overflow-hidden rounded-[var(--radius-card)] border text-left transition ${
                        active
                          ? "border-primary bg-[var(--surface)] shadow-[var(--shadow-card)]"
                          : "border-border bg-secondary/60 opacity-80 hover:opacity-100"
                      }`}
                    >
                      <div className="aspect-[4/3] bg-secondary">
                        {row.photo_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={row.photo_url} alt="" className="h-full w-full object-cover" />
                        ) : null}
                      </div>
                      <div className="space-y-0.5 px-2 py-2">
                        <p className="truncate text-sm font-semibold text-foreground">{row.name}</p>
                        <p className="truncate text-xs text-muted">
                          {row.sku} · {t("shopQty", { count: row.quantity })}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
              <Button
                type="button"
                variant="secondary"
                size="icon-sm"
                className="absolute top-1/2 right-1 z-10 -translate-y-1/2 shadow-sm"
                aria-label={nextItem.name}
                onClick={() => openItem(nextItem)}
              >
                <ChevronRight className="size-4" aria-hidden />
              </Button>
            </div>
            <p className="text-center text-xs text-muted">
              {t("shopCyclePosition", { current: shelfIndex + 1, total: shelf.length })}
              {" · "}
              {t("shopCycleSwipe")}
            </p>
          </div>
        ) : null}
        <ActionNotices
          error={errorMessage}
          success={successMessage}
          onDismiss={() => {
            setErrorMessage(null);
            setSuccessMessage(null);
          }}
        />
        {isLoading ? (
          <EmptyState title={t("shopLoadingTitle")} description={t("shopLoadingStock")} loading />
        ) : (
          <form className="space-y-6 pb-24 lg:pb-0" onSubmit={(event) => void onSave(event)}>
            <div className="grid gap-6 lg:grid-cols-[minmax(0,18rem)_1fr]">
            <FormPanel>
              <Label>{t("shopPhoto")}</Label>
              <label className="mt-2 flex aspect-[4/3] cursor-pointer items-center justify-center overflow-hidden rounded-[var(--radius-card)] border border-dashed border-border bg-secondary">
                {photoPreview ? (
                  // Preview of the file the user just chose or the stored shop photo.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photoPreview} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="px-4 text-center text-sm text-muted">{t("shopPhotoHint")}</span>
                )}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="sr-only"
                  onChange={(event) => setPhoto(event.target.files?.[0] ?? null)}
                />
              </label>
              <p className="mt-2 text-xs text-muted">{t("shopPhotoHelp")}</p>
            </FormPanel>
            <div className="space-y-6">
              <FormPanel className="grid gap-4 md:grid-cols-2">
                <div className="md:col-span-2">
                  <Label htmlFor="shop-name">{t("shopItemName")}</Label>
                  <Input id="shop-name" className="mt-1" value={name} onChange={(event) => setName(event.target.value)} required />
                </div>
                <div>
                  <Label>{t("shopCategory")}</Label>
                  <div className="mt-1">
                    <Select value={category} onValueChange={setCategory}>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.map(([value, key]) => (
                          <SelectItem key={value} value={value}>{t(key)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="md:col-span-2">
                  <Label htmlFor="shop-desc">{t("shopDescription")}</Label>
                  <textarea
                    id="shop-desc"
                    className="mt-1 min-h-24 w-full rounded-[var(--radius-form)] border border-[var(--border)] bg-[var(--field-background)] px-3 py-2 text-sm"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="shop-cost">{t("shopPurchasePrice")}</Label>
                  <Input
                    id="shop-cost"
                    className="mt-1"
                    inputMode="decimal"
                    value={usualCost}
                    onChange={(event) => setUsualCost(event.target.value)}
                    onBlur={() => setUsualCost(formatMoneyInput(usualCost))}
                  />
                  <p className="mt-1 text-xs text-muted">{t("shopPurchaseHelp")}</p>
                </div>
                <div>
                  <Label htmlFor="shop-price">{t("shopSalePrice")}</Label>
                  <Input
                    id="shop-price"
                    className="mt-1"
                    inputMode="decimal"
                    value={usualSale}
                    onChange={(event) => setUsualSale(event.target.value)}
                    onBlur={() => setUsualSale(formatMoneyInput(usualSale))}
                  />
                  <p className="mt-1 text-xs text-muted">{t("shopSaleHelp")}</p>
                </div>
                <label className="flex items-start gap-2 text-sm md:col-span-2">
                  <Checkbox checked={trackStock} onCheckedChange={(checked) => setTrackStock(Boolean(checked))} />
                  <span>
                    {t("shopTrackStock")}
                    <span className="mt-0.5 block text-xs text-muted">{t("shopTrackStockHelp")}</span>
                  </span>
                </label>
                <div className="hidden md:col-span-2 lg:block">
                  <Button type="submit" variant="primary" disabled={isSaving}>
                    {isSaving ? t("saving") : t("saveItem")}
                  </Button>
                </div>
              </FormPanel>
            </div>
            </div>
            <FormPanel>
                <div>
                  <Label>{t("shopSizes")}</Label>
                  <p className="mt-1 text-xs text-muted">{t("shopSizePriceHint")}</p>
                  {suggestedGroups.length > 0 ? (
                    <div className="mt-2 space-y-3">
                      {suggestedGroups.map((group) => (
                        <div key={group.key}>
                          {group.labelKey ? (
                            <p className="mb-2 text-xs text-muted">{t(group.labelKey)}</p>
                          ) : null}
                          <div className="flex flex-wrap gap-2">
                            {group.sizes.map((size) => (
                              <Button
                                key={`${group.key}-${size}`}
                                type="button"
                                variant={sizes.some((row) => row.label === size) ? "secondary" : "outline"}
                                size="sm"
                                onClick={() => addSize(size)}
                              >
                                {size}
                              </Button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <div className="mt-3 max-h-[min(24rem,50vh)] overflow-auto rounded-[var(--radius-form)] border border-border">
                    <table className="w-full min-w-[32rem] border-collapse text-sm">
                      <thead className="sticky top-0 z-10 border-b border-border bg-secondary text-xs uppercase tracking-wide text-muted">
                        <tr>
                          {(
                            [
                              ["label", t("shopSizeCol")],
                              ["cost_price", t("shopPurchasePrice")],
                              ["sale_price", t("shopSalePrice")],
                            ] as const
                          ).map(([key, header]) => {
                            const active = sortKey === key;
                            const SortIcon = !active ? ChevronsUpDown : sortDir === "asc" ? ArrowUp : ArrowDown;
                            return (
                              <th key={key} className="px-3 py-2 font-medium" aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : "none"}>
                                <button
                                  type="button"
                                  className="inline-flex items-center gap-1 text-left hover:text-foreground"
                                  onClick={() => sortSizesBy(key)}
                                >
                                  {header}
                                  <SortIcon className="size-3.5" aria-hidden />
                                </button>
                              </th>
                            );
                          })}
                          <th className="px-3 py-2 font-medium">{isNew ? t("shopOnShelfNow") : t("shopOnShelf")}</th>
                          <th className="px-3 py-2 font-medium">{t("shopWarnBelow")}</th>
                          <th className="px-3 py-2 font-medium">
                            <span className="sr-only">{t("shopRemoveSize")}</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/80">
                        {sizes.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="px-3 py-4 text-sm text-muted">
                              {t("shopSizesEmpty")}
                            </td>
                          </tr>
                        ) : (
                          sizes.map((row) => (
                            <tr key={row.key} className="hover:bg-secondary/50">
                              <td className="px-3 py-2">
                                <Input
                                  value={row.label}
                                  aria-label={t("shopSizeCol")}
                                  onChange={(event) => updateSize(row.key, { label: event.target.value })}
                                />
                              </td>
                              <td className="px-3 py-2">
                                <Input
                                  inputMode="decimal"
                                  value={row.cost_price}
                                  aria-label={t("shopPurchasePrice")}
                                  onChange={(event) => updateSize(row.key, { cost_price: event.target.value })}
                                  onBlur={(event) => updateSize(row.key, { cost_price: formatMoneyInput(event.target.value) })}
                                />
                              </td>
                              <td className="px-3 py-2">
                                <Input
                                  inputMode="decimal"
                                  value={row.sale_price}
                                  aria-label={t("shopSalePrice")}
                                  onChange={(event) => updateSize(row.key, { sale_price: event.target.value })}
                                  onBlur={(event) => updateSize(row.key, { sale_price: formatMoneyInput(event.target.value) })}
                                />
                              </td>
                              <td className="px-3 py-2">
                                {isNew ? (
                                  <Input
                                    inputMode="numeric"
                                    value={row.quantity}
                                    aria-label={t("shopOnShelfNow")}
                                    onChange={(event) => updateSize(row.key, { quantity: event.target.value })}
                                  />
                                ) : (
                                  <span className={`tabular-nums ${row.onHand <= Number(row.reorder_level || 0) ? "font-semibold text-[var(--warning)]" : ""}`}>
                                    {row.onHand}
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2">
                                <Input
                                  inputMode="numeric"
                                  className="w-20"
                                  value={row.reorder_level}
                                  aria-label={t("shopWarnBelow")}
                                  onChange={(event) => updateSize(row.key, { reorder_level: event.target.value })}
                                />
                              </td>
                              <td className="px-3 py-2 text-right">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-sm"
                                  aria-label={t("shopRemoveSize")}
                                  onClick={() => removeSize(row.key)}
                                >
                                  <Trash2 className="size-4" />
                                </Button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-2 flex gap-2">
                    <Input
                      value={sizeDraft}
                      onChange={(event) => setSizeDraft(event.target.value)}
                      placeholder={t("shopSizePlaceholder")}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          addSize(sizeDraft);
                        }
                      }}
                    />
                    <Button type="button" variant="outline" onClick={() => addSize(sizeDraft)}>
                      {t("shopAddSize")}
                    </Button>
                  </div>
                </div>
            </FormPanel>
              {item ? (
                <FormPanel>
                  <h2 className="text-section text-foreground">{t("shopGoodsArrived")}</h2>
                  <p className="mt-1 text-xs text-muted">{t("shopGoodsArrivedHelp")}</p>
                  <ul className="mt-3 space-y-2">
                    {activeVariants.map((row) => (
                      <li key={row.id} className="flex flex-wrap items-center gap-3 text-sm">
                        <span className="min-w-16 font-medium">{row.label}</span>
                        <span className="text-muted tabular-nums">
                          {t("shopOnShelf")}: {row.quantity}
                          {row.low_stock ? ` · ${t("shopLow")}` : ""}
                        </span>
                        <Input
                          className="w-24"
                          inputMode="numeric"
                          value={deliveryQty[row.id] ?? ""}
                          placeholder="0"
                          aria-label={`${t("shopJustArrived")} ${row.label}`}
                          onChange={(event) => setDeliveryQty((current) => ({ ...current, [row.id]: event.target.value }))}
                        />
                      </li>
                    ))}
                  </ul>
                  <div className="mt-3">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={async () => {
                        if (!selectedClubId) return;
                        const lines = activeVariants
                          .map((row) => ({ variant: row.id, quantity: Number(deliveryQty[row.id] || 0) }))
                          .filter((line) => line.quantity !== 0);
                        if (lines.length === 0) {
                          setErrorMessage(t("shopGoodsArrivedNeedQty"));
                          return;
                        }
                        try {
                          await receiveShopStock(selectedClubId, item.id, { lines });
                          setSuccessMessage(t("shopStockReceived"));
                          setDeliveryQty({});
                          await load();
                        } catch (error) {
                          setErrorMessage(error instanceof Error ? error.message : t("saveError"));
                        }
                      }}
                    >
                      {t("shopGoodsArrived")}
                    </Button>
                  </div>
                </FormPanel>
              ) : null}
              {item ? (
                <FormPanel>
                  <h2 className="text-section text-foreground">{t("shopPrintStickersNext")}</h2>
                  <div>
                    <Label>{t("shopStickers")}</Label>
                    <p className="mt-1 text-xs text-muted">{t("shopStickersHint")}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {activeVariants.length > 0 ? (
                        <Select value={stickerTarget} onValueChange={setStickerTarget}>
                          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">{t("shopPrintAllSizes")}</SelectItem>
                            {activeVariants.map((row) => (
                              <SelectItem key={row.id} value={String(row.id)}>{row.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : null}
                      <Input
                        value={stickerCopies}
                        onChange={(event) => setStickerCopies(event.target.value)}
                        className="w-24"
                        aria-label={t("shopStickerCopies")}
                      />
                    </div>
                    <div className="mt-3">
                      <Label>{t("shopStickerStart")}</Label>
                      <p className="mt-1 text-xs text-muted">{t("shopStickerSheetHint")}</p>
                      <div className="mt-2 grid w-max grid-cols-4 gap-1">
                        {Array.from({ length: 20 }, (_, index) => index + 1).map((slot) => (
                          <button
                            key={slot}
                            type="button"
                            className={`size-8 rounded-[var(--radius-form)] text-xs font-medium ${
                              stickerStart === slot
                                ? "bg-primary text-primary-foreground"
                                : "border border-border bg-[var(--surface)] text-foreground hover:bg-secondary"
                            }`}
                            onClick={() => setStickerStart(slot)}
                          >
                            {slot}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="mt-3">
                      <Label>{t("shopStickerPrinter")}</Label>
                      <div className="mt-1">
                        <Select value={printerProfileValue} onValueChange={setPrinterProfileValue}>
                          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NO_PRINTER_PROFILE}>{t("shopStickerPrinterNone")}</SelectItem>
                            {printerProfiles.map((profile) => (
                              <SelectItem key={profile.id} value={String(profile.id)}>
                                {profile.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="mt-3">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() =>
                          selectedClubId &&
                          downloadShopStickers(
                            selectedClubId,
                            item.id,
                            Number(stickerCopies) || 1,
                            stickerTarget === "all" ? "all" : stickerTarget ? Number(stickerTarget) : undefined,
                            {
                              start: stickerStart,
                              printerProfileId:
                                printerProfileValue === NO_PRINTER_PROFILE ? null : Number(printerProfileValue),
                            },
                          ).catch((error) => setErrorMessage(error.message))
                        }
                      >
                        {t("shopPrintStickers")}
                      </Button>
                    </div>
                  </div>
                </FormPanel>
              ) : null}
            <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-[var(--surface)]/95 p-3 backdrop-blur lg:hidden">
              <Button type="submit" variant="primary" className="w-full" disabled={isSaving}>
                {isSaving ? t("saving") : t("saveItem")}
              </Button>
            </div>
          </form>
        )}
      </div>
    </ClubAdminLayout>
  );
}
