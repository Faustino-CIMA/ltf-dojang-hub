import { Shield } from "lucide-react";

import type { MenuAction } from "@/components/ui/action-menu";

export function memberVerifyPath(locale: string, desk: "club" | "ltf", memberId: number): string {
  return `/${locale}/dashboard/${desk}/members/${memberId}/verify`;
}

/** Menu item for the existing card check. Hidden once the member is verified, because the row already shows the badge. */
export function verifyMemberMenuAction({
  verified,
  label,
  onSelect,
}: {
  verified: boolean;
  label: string;
  onSelect: () => void;
}): MenuAction[] {
  if (verified) {
    return [];
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
