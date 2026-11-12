"use client";

import { Download, Pencil, Printer, Trash2 } from "lucide-react";

import { RowActionMenu } from "@/components/ui/row-action-menu";

type LtfLicenseRowActionsProps = {
  menuLabel: string;
  editLabel: string;
  printLabel: string;
  downloadLabel: string;
  deleteLabel: string;
  onEdit: () => void;
  onPrint: () => void;
  onDownload: () => void;
  onDelete: () => void;
};

export function LtfLicenseRowActions({
  menuLabel,
  editLabel,
  printLabel,
  downloadLabel,
  deleteLabel,
  onEdit,
  onPrint,
  onDownload,
  onDelete,
}: LtfLicenseRowActionsProps) {
  return (
    <RowActionMenu
      label={menuLabel}
      actions={[
        { key: "edit", icon: <Pencil aria-hidden />, label: editLabel, onSelect: onEdit },
        { key: "print", icon: <Printer aria-hidden />, label: printLabel, onSelect: onPrint },
        { key: "download", icon: <Download aria-hidden />, label: downloadLabel, onSelect: onDownload },
        {
          key: "delete",
          icon: <Trash2 aria-hidden />,
          label: deleteLabel,
          destructive: true,
          onSelect: onDelete,
        },
      ]}
    />
  );
}
