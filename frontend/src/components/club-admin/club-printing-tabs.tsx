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

export function ClubPrintingTabs() {
  const t = useTranslations("ClubAdmin");
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();

  return (
    <UnderlineTabs
      idPrefix="club-printing"
      ariaLabel={t("printingTabsAriaLabel")}
      value={tabFromPath(pathname)}
      onChange={(tab) => router.push(`/${locale}/dashboard/club/${tab}`)}
      options={[
        { value: "print-jobs", label: t("navPrintJobs"), icon: Printer },
        { value: "printer-profiles", label: t("navPrinterProfiles"), icon: CreditCard },
      ]}
    />
  );
}
