import type { ReactNode } from "react";

import { ClubAdminLayout } from "@/components/club-admin/club-admin-layout";

export default function ClubDashboardLayout({ children }: { children: ReactNode }) {
  return <ClubAdminLayout persistent>{children}</ClubAdminLayout>;
}
