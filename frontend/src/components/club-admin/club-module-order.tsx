"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormPanel } from "@/components/ui/list-page-chrome";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PopoverSelect } from "@/components/ui/popover-select";
import { SidePanel } from "@/components/ui/side-panel";
import { formatDisplayDate } from "@/lib/date-display";
import {
  createModuleOrder,
  getModuleOrderCatalog,
  type ModuleOrderCatalog,
  type ModuleOrderOffer,
  type ModuleOrderResult,
} from "@/lib/ltf-finance-api";

function selectable(offer: ModuleOrderOffer, allowUnentitled: boolean) {
  if (offer.state === "available") return true;
  return allowUnentitled && offer.state === "not_entitled";
}

function resolveSelection(catalog: ModuleOrderCatalog, selectedKeys: string[]) {
  const selected = catalog.offers.filter((offer) => selectedKeys.includes(offer.key));
  const bundles = selected.filter((offer) => offer.kind === "bundle");
  const modules = selected.filter((offer) => offer.kind === "module");
  const claimed = new Map<string, string>();
  let shared = false;
  for (const bundle of bundles) {
    for (const moduleId of bundle.module_ids) {
      if (claimed.has(moduleId)) shared = true;
      else claimed.set(moduleId, bundle.name);
    }
  }
  const dropped = modules
    .filter((offer) => offer.module_id && claimed.has(offer.module_id))
    .map((offer) => ({ module: offer.name, bundle: claimed.get(offer.module_id ?? "") ?? "" }));
  const charge = [
    ...bundles,
    ...modules.filter((offer) => !(offer.module_id && claimed.has(offer.module_id))),
  ];
  const total = charge.reduce((sum, offer) => sum + Number(offer.estimated_amount ?? 0), 0);
  return { shared, dropped, charge, total };
}

export function ClubModuleOrderPanel({
  catalog,
  invoicePath,
  allowUnentitled = false,
  title,
  subtitle,
  onOrder,
}: {
  catalog: ModuleOrderCatalog;
  invoicePath: (invoiceId: number) => string;
  allowUnentitled?: boolean;
  title?: string;
  subtitle?: string;
  onOrder: (input: { modules: string[]; bundles: number[] }) => Promise<ModuleOrderResult>;
}) {
  const t = useTranslations("ClubAdmin");
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [created, setCreated] = useState<ModuleOrderResult | null>(null);

  const held = catalog.offers.filter((offer) => ["on", "blocked", "open_invoice"].includes(offer.state));
  const unpriced = catalog.offers.filter((offer) => offer.state === "no_price");
  const choices = catalog.offers.filter((offer) => selectable(offer, allowUnentitled));
  const visibleChoices = choices.filter((offer) => offer.name.toLowerCase().includes(query.trim().toLowerCase()));
  const { shared, dropped, charge, total } = resolveSelection(catalog, selectedKeys);

  const toggle = (key: string) => {
    setSelectedKeys((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key]));
  };

  const confirm = async () => {
    if (charge.length === 0 || shared) {
      setNotice({ kind: "error", text: shared ? t("moduleOrderShared") : t("moduleOrderNeedChoice") });
      return;
    }
    setBusy(true);
    try {
      const result = await onOrder({
        modules: charge.filter((offer) => offer.kind === "module" && offer.module_id).map((offer) => offer.module_id ?? ""),
        bundles: charge.filter((offer) => offer.kind === "bundle" && offer.bundle_id).map((offer) => offer.bundle_id ?? 0),
      });
      setCreated(result);
      setSelectedKeys([]);
      setReviewOpen(false);
      setNotice({ kind: "success", text: t("moduleOrderCreated", { number: result.invoice_number }) });
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : t("moduleOrderError") });
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormPanel>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-section text-foreground">{title ?? t("moduleOrderTitle")}</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted">{subtitle ?? t("moduleOrderSubtitle")}</p>
        </div>
        <Button type="button" variant="primary" onClick={() => setReviewOpen(true)} disabled={charge.length === 0 || shared}>
          {t("moduleOrderReview")}
        </Button>
      </div>

      {notice ? (
        <p className={notice.kind === "error" ? "mt-3 text-sm text-destructive" : "mt-3 text-sm text-foreground"}>
          {notice.text}
          {created && notice.kind === "success" ? (
            <>
              {" "}
              <a className="text-link underline-offset-4 hover:underline" href={invoicePath(created.invoice_id)}>
                {created.invoice_number}
              </a>
            </>
          ) : null}
        </p>
      ) : null}

      <div className="mt-6 space-y-2">
        <h3 className="text-sm font-medium text-foreground">{t("moduleOrderOnTitle")}</h3>
        {held.length === 0 ? (
          <p className="text-sm text-muted">{t("moduleOrderOnEmpty")}</p>
        ) : (
          <ul className="space-y-2">
            {held.map((offer) => (
              <li key={offer.key} className="flex flex-wrap items-center justify-between gap-2 text-sm text-foreground">
                <span>{offer.name}</span>
                {offer.state === "open_invoice" && offer.invoice_id ? (
                  <a className="text-link underline-offset-4 hover:underline" href={invoicePath(offer.invoice_id)}>
                    {t("moduleOrderOpenInvoice", { number: offer.invoice_number ?? "" })}
                  </a>
                ) : (
                  <span className="text-muted">
                    {offer.ends_at
                      ? t("moduleOrderUntil", { date: formatDisplayDate(offer.ends_at) })
                      : offer.state === "blocked"
                        ? t("moduleOrderBlocked")
                        : t("moduleOrderNoEnd")}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-6 space-y-2">
        <Label required>{t("moduleOrderChoose")}</Label>
        {choices.length === 0 ? (
          <p className="text-sm text-muted">{t("moduleOrderEmpty")}</p>
        ) : (
          <Popover>
            <PopoverTrigger
              className="inline-flex h-[var(--control-height)] min-h-[var(--control-height)] w-full items-center justify-between rounded-[var(--radius-form)] border border-[var(--border)] bg-[var(--field-background)] px-3 text-sm text-[var(--field-foreground)]"
              aria-label={t("moduleOrderChoose")}
            >
              {selectedKeys.length === 0
                ? t("moduleOrderChoose")
                : catalog.offers
                    .filter((offer) => selectedKeys.includes(offer.key))
                    .map((offer) => offer.name)
                    .join(", ")}
            </PopoverTrigger>
            <PopoverContent className="w-80 p-2">
              {choices.length > 8 ? (
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t("moduleOrderSearch")}
                  aria-label={t("moduleOrderSearch")}
                  className="mb-2"
                />
              ) : null}
              <div className="space-y-1">
                {visibleChoices.map((offer) => {
                  const selected = selectedKeys.includes(offer.key);
                  return (
                    <div
                      key={offer.key}
                      role="checkbox"
                      aria-checked={selected}
                      aria-label={offer.name}
                      tabIndex={0}
                      className="flex cursor-pointer items-center gap-2 rounded-[var(--radius-form)] px-2 py-1.5 text-sm text-foreground hover:bg-secondary"
                      onClick={() => toggle(offer.key)}
                      onKeyDown={(event) => {
                        if (event.key === " " || event.key === "Enter") {
                          event.preventDefault();
                          toggle(offer.key);
                        }
                      }}
                    >
                      <span
                        aria-hidden
                        className={
                          selected
                            ? "h-4 w-4 rounded-[var(--radius-form)] border border-primary bg-primary"
                            : "h-4 w-4 rounded-[var(--radius-form)] border border-[var(--checkbox-border)] bg-[var(--surface)]"
                        }
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block">{offer.name}</span>
                        <span className="block text-xs text-muted">
                          {offer.state === "not_entitled"
                            ? t("moduleOrderNotEntitled")
                            : offer.estimated_amount
                              ? `${offer.estimated_amount} ${offer.currency}`
                              : t("moduleOrderNoPrice")}
                        </span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>
        )}
        {selectedKeys.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {catalog.offers
              .filter((offer) => selectedKeys.includes(offer.key))
              .map((offer) => (
                <button
                  key={offer.key}
                  type="button"
                  className="rounded-[var(--radius-chip)] border border-border bg-secondary px-2 py-0.5 text-xs text-foreground"
                  onClick={() => toggle(offer.key)}
                >
                  {offer.name}
                </button>
              ))}
          </div>
        ) : null}
        {unpriced.map((offer) => (
          <p key={offer.key} className="text-sm text-muted">
            {offer.name}: {t("moduleOrderNoPrice")}
          </p>
        ))}
        {shared ? <p className="text-sm text-destructive">{t("moduleOrderShared")}</p> : null}
        {dropped.map((item) => (
          <p key={`${item.module}-${item.bundle}`} className="text-sm text-muted">
            {t("moduleOrderDropped", item)}
          </p>
        ))}
      </div>

      <SidePanel
        open={reviewOpen}
        title={t("moduleOrderReviewTitle")}
        description={t("moduleOrderMonths", { months: String(catalog.subscription_months) })}
        closeLabel={t("moduleOrderClose")}
        onClose={() => setReviewOpen(false)}
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setReviewOpen(false)} disabled={busy}>
              {t("moduleOrderClose")}
            </Button>
            <Button type="button" onClick={() => void confirm()} disabled={busy || charge.length === 0 || shared}>
              {busy ? t("moduleOrderSaving") : t("moduleOrderConfirm")}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {charge.map((offer) => (
            <div key={offer.key} className="space-y-2 rounded-[var(--radius-card)] border border-border bg-secondary p-3">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-medium text-foreground">{offer.name}</p>
                <p className="text-sm text-foreground">
                  {offer.estimated_amount} {offer.currency}
                </p>
              </div>
              {offer.kind === "bundle" && offer.comparison ? (
                <div className="space-y-1 text-sm text-muted">
                  <p className="font-medium text-foreground">{t("moduleOrderComparisonTitle")}</p>
                  {offer.comparison.lines.map((line) => (
                    <p key={line.module_id}>
                      {line.name}
                      {": "}
                      {line.kind === "missing"
                        ? t("moduleOrderNoPrice")
                        : line.kind === "per_member"
                          ? `${line.amount} EUR · ${t("moduleOrderPerMember", { count: String(catalog.active_member_count) })}`
                          : `${line.amount} EUR`}
                    </p>
                  ))}
                  {offer.comparison.difference !== null ? (
                    <p className="text-foreground">
                      {Number(offer.comparison.difference) === 0
                        ? t("moduleOrderComparisonSame")
                        : Number(offer.comparison.difference) > 0
                          ? t("moduleOrderComparisonHigher", { amount: offer.comparison.difference })
                          : t("moduleOrderComparisonLower", {
                              amount: Math.abs(Number(offer.comparison.difference)).toFixed(2),
                            })}
                    </p>
                  ) : null}
                </div>
              ) : null}
              {offer.pricing_type === "per_active_member" ? (
                <p className="text-xs text-muted">
                  {t("moduleOrderPerMember", { count: String(offer.active_member_count ?? catalog.active_member_count) })}
                </p>
              ) : null}
            </div>
          ))}
          <p className="text-sm font-medium text-foreground">
            {t("moduleOrderTotal")}: {total.toFixed(2)} EUR
          </p>
        </div>
      </SidePanel>
    </FormPanel>
  );
}

export function ClubModuleOrder({
  clubId,
  clubs,
  invoicePath,
  allowUnentitled = false,
  title,
  subtitle,
}: {
  clubId?: number;
  clubs?: { id: number; name: string }[];
  invoicePath: (invoiceId: number) => string;
  allowUnentitled?: boolean;
  title?: string;
  subtitle?: string;
}) {
  const t = useTranslations("ClubAdmin");
  const [pickedClubId, setPickedClubId] = useState<string>(clubId ? String(clubId) : "");
  const [catalog, setCatalog] = useState<ModuleOrderCatalog | null>(null);
  const activeClubId = clubId ?? (pickedClubId ? Number(pickedClubId) : null);

  useEffect(() => {
    if (!activeClubId) return;
    let cancelled = false;
    getModuleOrderCatalog(activeClubId)
      .then((next) => {
        if (!cancelled) setCatalog(next);
      })
      .catch(() => {
        if (!cancelled) setCatalog(null);
      });
    return () => {
      cancelled = true;
    };
  }, [activeClubId]);

  const shownCatalog = catalog && catalog.club_id === activeClubId ? catalog : null;

  return (
    <div className="space-y-3">
      {clubs ? (
        <FormPanel>
          <div className="space-y-2">
            <Label htmlFor="module-order-club" required>
              {t("moduleOrderClubLabel")}
            </Label>
            <PopoverSelect
              ariaLabel={t("moduleOrderClubLabel")}
              placeholder={t("moduleOrderClubLabel")}
              value={pickedClubId}
              onValueChange={setPickedClubId}
              options={clubs.map((club) => ({ value: String(club.id), label: club.name }))}
            />
          </div>
        </FormPanel>
      ) : null}
      {shownCatalog && activeClubId ? (
        <ClubModuleOrderPanel
          catalog={shownCatalog}
          invoicePath={invoicePath}
          allowUnentitled={allowUnentitled}
          title={title ?? (clubs ? t("moduleOrderFinanceTitle") : undefined)}
          subtitle={subtitle ?? (clubs ? t("moduleOrderFinanceHint") : undefined)}
          onOrder={async (input) => {
            const result = await createModuleOrder(activeClubId, input);
            setCatalog(await getModuleOrderCatalog(activeClubId));
            return result;
          }}
        />
      ) : null}
    </div>
  );
}
