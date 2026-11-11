"use client";

import { useTranslations } from "next-intl";

import { visibleMaximumAmount, visibleMinimumAmount } from "@/lib/module-fee-display";

export function ModulePriceBounds({
  pricingType,
  amount,
  currency,
  minimumAmount,
  maximumAmount,
}: {
  pricingType?: string | null;
  amount?: string | null;
  currency?: string | null;
  minimumAmount?: string | null;
  maximumAmount?: string | null;
}) {
  const t = useTranslations("LtfFinance");
  const money = currency || "EUR";
  const minimum = visibleMinimumAmount(pricingType, amount, minimumAmount);
  const maximum = visibleMaximumAmount(pricingType, amount, maximumAmount);
  if (!minimum && !maximum) {
    return null;
  }
  return (
    <span className="mt-1 block text-xs font-normal text-muted">
      {minimum ? <span className="block">{t("moduleFeeMinimumShown", { amount: minimum, currency: money })}</span> : null}
      {maximum ? <span className="block">{t("moduleFeeMaximumShown", { amount: maximum, currency: money })}</span> : null}
    </span>
  );
}
