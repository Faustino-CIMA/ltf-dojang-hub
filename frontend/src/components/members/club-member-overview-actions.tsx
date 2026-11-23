import { Download, Pencil, Receipt, Shield } from "lucide-react";

import type { MenuAction } from "@/components/ui/action-menu";

/** Overview actions for one club member. Edit stays first. Downloads and Verify keep their previous visibility. */
export function clubMemberOverviewActions({
  canManage,
  statementAvailable,
  editLabel,
  onEdit,
  statementLabel,
  onStatement,
  memberDataLabel,
  onMemberData,
  verifyLabel,
  verifyHref,
  accountActions,
}: {
  canManage: boolean;
  statementAvailable: boolean;
  editLabel: string;
  onEdit: () => void;
  statementLabel: string;
  onStatement: () => void;
  memberDataLabel: string;
  onMemberData: () => void;
  verifyLabel: string;
  verifyHref: string;
  accountActions: MenuAction[];
}): MenuAction[] {
  const actions: MenuAction[] = [];
  if (canManage) {
    actions.push({
      key: "edit",
      label: editLabel,
      icon: <Pencil aria-hidden />,
      onSelect: onEdit,
    });
  }
  if (statementAvailable) {
    actions.push({
      key: "statement",
      label: statementLabel,
      icon: <Receipt aria-hidden />,
      availableWhenReadOnly: true,
      onSelect: onStatement,
    });
  }
  if (canManage) {
    actions.push(
      {
        key: "member-data",
        label: memberDataLabel,
        icon: <Download aria-hidden />,
        availableWhenReadOnly: true,
        onSelect: onMemberData,
      },
      {
        key: "verify",
        label: verifyLabel,
        icon: <Shield aria-hidden />,
        href: verifyHref,
        availableWhenReadOnly: true,
        onSelect: () => undefined,
      },
      ...accountActions,
    );
  }
  return actions;
}
