"use client";

import { useTranslations } from "next-intl";

import type { AccountSetupAssignment } from "@/lib/setup-api";

const ROLE_LABELS = {
  ltf_admin: "role_ltf_admin",
  ltf_finance: "role_ltf_finance",
  club_admin: "role_club_admin",
  coach: "role_coach",
  member: "role_member",
} as const;

export function AccountSetupGrant({ assignments }: { assignments: AccountSetupAssignment[] }) {
  const t = useTranslations("AccountSetup");
  if (!assignments.length) return null;
  return (
    <div className="space-y-2 rounded-[var(--radius-card)] border border-border bg-card px-4 py-3 text-center">
      {assignments.map((assignment) => {
        const labelKey = ROLE_LABELS[assignment.role as keyof typeof ROLE_LABELS];
        const role = labelKey ? t(labelKey) : assignment.role;
        const text = assignment.organisation
          ? t("roleGrant", { role, organisation: assignment.organisation })
          : t("roleOnly", { role });
        return (
          <p key={`${assignment.role}-${assignment.organisation}`} className="text-base font-semibold text-foreground">
            {text}
          </p>
        );
      })}
    </div>
  );
}
