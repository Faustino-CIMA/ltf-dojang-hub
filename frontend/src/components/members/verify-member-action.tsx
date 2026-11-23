import { LockOpen, Shield } from "lucide-react";

import type { MenuAction } from "@/components/ui/action-menu";

export function memberVerifyPath(locale: string, desk: "club" | "ltf", memberId: number): string {
  return `/${locale}/dashboard/${desk}/members/${memberId}/verify`;
}

/** Unverified members keep Verify. A verified member offers Unlock only to a club admin. */
export function verifyMemberMenuAction({
  verified,
  label,
  onSelect,
  canUnlock = false,
  unlockLabel = "",
  onUnlock,
}: {
  verified: boolean;
  label: string;
  onSelect: () => void;
  canUnlock?: boolean;
  unlockLabel?: string;
  onUnlock?: () => void;
}): MenuAction[] {
  if (verified) {
    if (!canUnlock || !onUnlock) {
      return [];
    }
    return [
      {
        key: "unlock",
        label: unlockLabel,
        icon: <LockOpen aria-hidden />,
        onSelect: onUnlock,
      },
    ];
  }
  return [
    {
      key: "verify",
      label,
      icon: <Shield aria-hidden />,
      onSelect,
    },
  ];
}
