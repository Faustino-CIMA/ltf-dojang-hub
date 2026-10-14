"use client";

import { usePathname, useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { CreditCard, Printer } from "lucide-react";

import { UnderlineTabs } from "@/components/ui/underline-tabs";

type PrintingTab = "print-jobs" | "printer-profiles";

function tabFromPath(pathname: string | null): PrintingTab {
  if (pathname?.includes("/printer-profiles")) {
    return "printer-profiles";
  }
  return "print-jobs";
}

export function LtfPrintingTabs() {
  const t = useTranslations("LtfAdmin");
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();

  return (
    <UnderlineTabs
      idPrefix="ltf-printing"
      ariaLabel={t("printingTabsAriaLabel")}
      value={tabFromPath(pathname)}
      onChange={(tab) => {
        const href =
          tab === "printer-profiles"
            ? `/${locale}/dashboard/ltf/printer-profiles`
            : `/${locale}/dashboard/ltf/license-cards/print-jobs`;
        router.push(href);
      }}
      options={[
        { value: "print-jobs", label: t("navLicenseCardPrintJobs"), icon: Printer },
        { value: "printer-profiles", label: t("navPrinterProfiles"), icon: CreditCard },
      ]}
    />
  );
}
