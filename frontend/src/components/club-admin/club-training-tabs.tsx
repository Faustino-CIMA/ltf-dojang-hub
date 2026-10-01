"use client";

import { usePathname, useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Calendar, CalendarDays, CalendarRange, Clock, Palmtree, Timer } from "lucide-react";

import { UnderlineTabs } from "@/components/ui/underline-tabs";

type TrainingTab = "week" | "month" | "year" | "timetable" | "holidays" | "hours";

function tabFromPath(pathname: string | null): TrainingTab {
  if (pathname?.includes("/training/month")) return "month";
  if (pathname?.includes("/training/year")) return "year";
  if (pathname?.includes("/training/timetable")) return "timetable";
  if (pathname?.includes("/training/holidays")) return "holidays";
  if (pathname?.includes("/training/hours")) return "hours";
  return "week";
}

const PATHS: Record<TrainingTab, string> = {
  week: "training",
  month: "training/month",
  year: "training/year",
  timetable: "training/timetable",
  holidays: "training/holidays",
  hours: "training/hours",
};

export function ClubTrainingTabs() {
  const t = useTranslations("ClubAdmin");
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  if (pathname?.includes("/training/sessions/")) return null;
  return (
    <UnderlineTabs
      idPrefix="club-training"
      ariaLabel={t("trainingTabsAriaLabel")}
      value={tabFromPath(pathname)}
      onChange={(tab) => router.push(`/${locale}/dashboard/club/${PATHS[tab]}`)}
      options={[
        { value: "week", label: t("trainingThisWeek"), icon: CalendarDays },
        { value: "month", label: t("trainingMonth"), icon: Calendar },
        { value: "year", label: t("trainingYear"), icon: CalendarRange },
        { value: "timetable", label: t("trainingTimetable"), icon: Clock },
        { value: "holidays", label: t("trainingHolidays"), icon: Palmtree },
        { value: "hours", label: t("trainingCoachHours"), icon: Timer },
      ]}
    />
  );
}
