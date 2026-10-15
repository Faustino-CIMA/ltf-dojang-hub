import type { ReactNode } from "react";

import { LtfFinanceLayout } from "@/components/ltf-finance/ltf-finance-layout";

export default function LtfFinanceDashboardLayout({ children }: { children: ReactNode }) {
  return <LtfFinanceLayout persistent>{children}</LtfFinanceLayout>;
}
