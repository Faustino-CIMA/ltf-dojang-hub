"use client";

import { Copy, Download, PenLine, Star, Trash2 } from "lucide-react";

import { RowActionMenu } from "@/components/ui/row-action-menu";

export type LicenseCardRowActionLabels = {
  menu: string;
  openDesigner: string;
  setDefault: string;
  alreadyDefault: string;
  clone: string;
  export: string;
  exporting: string;
  delete: string;
};

type LicenseCardRowActionsProps = {
  isDefault: boolean;
  busy: boolean;
  labels: LicenseCardRowActionLabels;
  onOpenDesigner: () => void;
  onSetDefault: () => void;
  onClone: () => void;
  onExport: () => void;
  onDelete: () => void;
};

export function LicenseCardRowActions({
  isDefault,
  busy,
  labels,
  onOpenDesigner,
  onSetDefault,
  onClone,
  onExport,
  onDelete,
}: LicenseCardRowActionsProps) {
  return (
    <RowActionMenu
      label={labels.menu}
      actions={[
        {
          key: "open-designer",
          label: labels.openDesigner,
          icon: <PenLine aria-hidden="true" />,
          onSelect: onOpenDesigner,
        },
        {
          key: "set-default",
          label: isDefault ? labels.alreadyDefault : labels.setDefault,
          icon: <Star aria-hidden="true" />,
          disabled: busy || isDefault,
          onSelect: onSetDefault,
        },
        {
          key: "clone",
          label: labels.clone,
          icon: <Copy aria-hidden="true" />,
          disabled: busy,
          onSelect: onClone,
        },
        {
          key: "export",
          label: busy ? labels.exporting : labels.export,
          icon: <Download aria-hidden="true" />,
          disabled: busy,
          onSelect: onExport,
        },
        {
          key: "delete",
          label: labels.delete,
          icon: <Trash2 aria-hidden="true" />,
          destructive: true,
          disabled: busy,
          onSelect: onDelete,
        },
      ]}
    />
  );
}
