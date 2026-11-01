import { User } from "lucide-react";

import { StatusBadge } from "@/components/ui/status-badge";
import { accountBadgeTone, type AccountState } from "@/lib/member-accounts";

export function MemberAccountBadge({ state, label }: { state: AccountState; label: string }) {
  return (
    <span className="inline-flex items-center gap-1" data-account-state={state}>
      <User className="h-3.5 w-3.5 text-muted" aria-hidden="true" />
      <StatusBadge label={label} tone={accountBadgeTone(state)} />
    </span>
  );
}
