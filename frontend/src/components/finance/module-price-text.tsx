"use client";

import { useTranslations } from "next-intl";

import { InfoHint } from "@/components/ui/info-hint";
import { visibleMinimumAmount } from "@/lib/module-fee-display";

export function ModulePriceText({
  amount,
  currency,
  pricingType,
  minimumAmount,
  showMinimum = false,
  hint = false,
}: {
  amount: string;
  currency?: string | null;
  pricingType?: string | null;
  minimumAmount?: string | null;
  showMinimum?: boolean;
  hint?: boolean;
}) {
  const t = useTranslations("LtfFinance");
  const common = useTranslations("Common");
  const money = currency || "EUR";
  const perMember = pricingType === "per_active_member";
  const minimum = showMinimum ? visibleMinimumAmount(pricingType, amount, minimumAmount) : null;
  const price = perMember
    ? t("moduleFeePricePerMemberYear", { amount, currency: money })
    : `${amount} ${money}`;

  return (
    <span>
      <span className="inline-flex items-center gap-1">
        <span>{price}</span>
        {hint && perMember ? (
          <InfoHint size="compact" ariaLabel={common("aboutTitle", { title: t("moduleFeePricingPerMember") })}>
            {t("moduleFeePerMemberHint")}
          </InfoHint>
        ) : null}
      </span>
      {minimum ? (
        <span className="mt-1 block text-xs font-normal text-muted">
          {t("moduleFeeMinimumShown", { amount: minimum, currency: money })}
        </span>
      ) : null}
    </span>
  );
}
