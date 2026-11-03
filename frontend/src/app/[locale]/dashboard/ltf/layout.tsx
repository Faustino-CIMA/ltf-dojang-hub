import type { ReactNode } from "react";

import { LtfAdminLayout } from "@/components/ltf-admin/ltf-admin-layout";

export default function LtfDashboardLayout({ children }: { children: ReactNode }) {
  return <LtfAdminLayout persistent>{children}</LtfAdminLayout>;
}
