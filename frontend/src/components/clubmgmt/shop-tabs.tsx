"use client";

import { usePathname, useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { ClipboardList, Package, ShoppingBag } from "lucide-react";

import { UnderlineTabs } from "@/components/ui/underline-tabs";

type ShopTab = "sell" | "items" | "sales";

function tabFromPath(pathname: string | null): ShopTab {
  if (pathname?.includes("/shop/items")) return "items";
  if (pathname?.includes("/shop/sales")) return "sales";
  return "sell";
}

export function ClubShopTabs() {
  const t = useTranslations("ClubMgmt");
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const tab = tabFromPath(pathname);

  return (
    <UnderlineTabs
      ariaLabel={t("shopTabsAria")}
      idPrefix="club-shop"
      value={tab}
      onChange={(value) => {
        const href =
          value === "items"
            ? `/${locale}/dashboard/club/shop/items`
            : value === "sales"
              ? `/${locale}/dashboard/club/shop/sales`
              : `/${locale}/dashboard/club/shop/sell`;
        router.push(href);
      }}
      options={[
        { value: "sell", label: t("shopTabSell"), icon: ShoppingBag },
        { value: "items", label: t("shopTabItems"), icon: Package },
        { value: "sales", label: t("shopTabSales"), icon: ClipboardList },
      ]}
    />
  );
}
