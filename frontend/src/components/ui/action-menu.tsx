"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

import { useDeskAccess } from "@/components/desk-access";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export type MenuAction = {
  key: string;
  label: string;
  icon?: ReactNode;
  destructive?: boolean;
  disabled?: boolean;
  href?: string;
  /** Shown in the menu before onSelect runs. The menu stays open until confirmed. */
  confirmLabel?: string;
  onSelect: () => void;
};

const menuTriggerClassName =
  "inline-flex h-[var(--control-height)] min-h-[var(--control-height)] min-w-[11rem] items-center justify-between gap-2 rounded-[var(--radius-form)] border border-[var(--border)] bg-[var(--field-background)] px-3 py-0 text-sm text-[var(--field-foreground)] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50";

export function ActionMenu({
  label,
  disabled = false,
  actions,
}: {
  label: string;
  disabled?: boolean;
  actions: MenuAction[];
}) {
  const { readOnly, viewOnlyLabel } = useDeskAccess();
  const visible = readOnly ? actions.filter((action) => action.href) : actions;
  const [open, setOpen] = useState(false);
  if (readOnly && visible.length === 0) {
    return (
      <button type="button" className={menuTriggerClassName} aria-label={label} disabled title={viewOnlyLabel}>
        {label}
        <ChevronDown className="size-4 opacity-50" />
      </button>
    );
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className={menuTriggerClassName} aria-label={label} disabled={disabled}>
        {label}
        <ChevronDown className="size-4 opacity-50" />
      </PopoverTrigger>
      <PopoverContent>
        {visible.map((action) => (
          <button
            key={action.key}
            type="button"
            className="flex min-h-[var(--control-height)] w-full items-center rounded-[var(--radius-form)] px-3 text-left text-sm text-[var(--popover-foreground)] hover:bg-[var(--accent-soft)] hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
            disabled={action.disabled}
            onClick={() => {
              setOpen(false);
              action.onSelect();
            }}
          >
            {action.label}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
