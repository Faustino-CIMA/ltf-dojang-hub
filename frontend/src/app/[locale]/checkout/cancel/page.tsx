"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { checkoutReturnLabelKey } from "@/lib/checkout-return";
import { useCheckoutDashboardHref } from "@/lib/use-checkout-dashboard-href";

export default function CheckoutCancelPage() {
  const t = useTranslations("Checkout");
  const locale = useLocale();
  const dashboardHref = useCheckoutDashboardHref(locale);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="w-full max-w-xl rounded-[var(--radius-card)] bg-card p-3 text-center border border-border">
        <h1 className="text-2xl font-semibold text-foreground">{t("cancelTitle")}</h1>
        <p className="mt-3 text-sm text-muted">{t("cancelSubtitle")}</p>
        <div className="mt-6 flex justify-center">
          <Button variant="outline" asChild>
            <Link href={dashboardHref}>{t(checkoutReturnLabelKey(dashboardHref, locale))}</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
