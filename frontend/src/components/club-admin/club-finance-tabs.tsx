"use client";

import { useEffect, useId, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { BadgeEuro, Banknote, FileText, HandCoins, Landmark, Percent, Receipt, Scale, Send, ShoppingCart } from "lucide-react";

import { useClubSelection } from "@/components/club-selection-provider";
import { UnderlineTabs } from "@/components/ui/underline-tabs";
import { cn } from "@/lib/utils";
import {
  CLUB_MANAGEMENT_MODULE_ID,
  getModuleStatus,
  isClubModuleAssigned,
} from "@/lib/modules-api";

type FinanceTab = "orders" | "invoices" | "payments" | "billing" | "fees" | "income" | "expenses" | "bank" | "reports" | "subsidies";

export type ClubLedgerFilterValue = "all" | "federation" | "club";

export function ClubLedgerFilter({
  value,
  onChange,
}: {
  value: ClubLedgerFilterValue;
  onChange: (value: ClubLedgerFilterValue) => void;
}) {
  const t = useTranslations("ClubAdmin");
  const labelId = useId();
  const options = [
    { value: "all" as const, label: t("financeLedgerAll") },
    { value: "federation" as const, label: t("financeLedgerLtf") },
    { value: "club" as const, label: t("financeLedgerClub") },
  ];

  return (
    <div className="flex h-[var(--control-height)] items-center gap-2">
      <span id={labelId} className="shrink-0 text-sm text-muted">
        {t("financeLedgerLabel")}
      </span>
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        aria-label={t("financeLedgerFilterAriaLabel")}
        className="inline-flex h-full items-stretch rounded-[var(--radius-form)] border border-border bg-secondary p-0.5"
      >
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(option.value)}
              className={cn(
                "inline-flex min-w-[3.5rem] items-center justify-center rounded-[calc(var(--radius-form)-2px)] px-3 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-secondary",
                selected
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted hover:text-foreground"
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function tabFromPath(pathname: string | null): FinanceTab {
  if (pathname?.includes("/payments")) {
    return "payments";
  }
  if (pathname?.includes("/billing")) {
    return "billing";
  }
  if (pathname?.includes("/fees")) {
    return "fees";
  }
  if (pathname?.includes("/orders")) {
    return "orders";
  }
  if (pathname?.includes("/income")) {
    return "income";
  }
  if (pathname?.includes("/expenses")) {
    return "expenses";
  }
  if (pathname?.includes("/reports")) {
    return "reports";
  }
  if (pathname?.includes("/bank")) {
    return "bank";
  }
  if (pathname?.includes("/subsidies")) {
    return "subsidies";
  }
  return "invoices";
}

export function ClubFinanceTabs() {
  const t = useTranslations("ClubAdmin");
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const { selectedClubId } = useClubSelection();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getModuleStatus()
      .then((status) => {
        if (!cancelled) {
          setVisible(isClubModuleAssigned(status, CLUB_MANAGEMENT_MODULE_ID, selectedClubId));
        }
      })
      .catch(() => {
        if (!cancelled) setVisible(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedClubId]);

  if (!visible) {
    return null;
  }

  return (
    <UnderlineTabs
      idPrefix="club-finance"
      ariaLabel={t("financeTabsAriaLabel")}
      value={tabFromPath(pathname)}
      onChange={(tab) => router.push(`/${locale}/dashboard/club/${tab}`)}
      options={[
        { value: "orders", label: t("navOrders"), icon: ShoppingCart },
        { value: "invoices", label: t("navInvoices"), icon: FileText },
        { value: "payments", label: t("navPayments"), icon: Receipt },
        { value: "billing", label: t("navBilling"), icon: Send },
        { value: "fees", label: t("navMembershipFees"), icon: Percent },
        { value: "income", label: t("navIncome"), icon: HandCoins },
        { value: "expenses", label: t("navExpenses"), icon: Banknote },
        { value: "bank", label: t("navBank"), icon: Landmark },
        { value: "reports", label: t("navReports"), icon: Scale },
        { value: "subsidies", label: t("navSubsidies"), icon: BadgeEuro },
      ]}
    />
  );
}
