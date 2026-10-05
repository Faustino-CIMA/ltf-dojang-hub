"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export type MenuAction = {
  key: string;
  label: string;
  disabled?: boolean;
  onSelect: () => void;
};

const menuTriggerClassName =
  "inline-flex min-h-[var(--control-height)] min-w-[11rem] items-center justify-between gap-2 rounded-[var(--radius-form)] border border-[var(--border)] bg-[var(--field-background)] px-3 py-2 text-sm text-[var(--field-foreground)] shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50";

export function ActionMenu({
  label,
  disabled = false,
  actions,
}: {
  label: string;
  disabled?: boolean;
  actions: MenuAction[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className={menuTriggerClassName} aria-label={label} disabled={disabled}>
        {label}
        <ChevronDown className="size-4 opacity-50" />
      </PopoverTrigger>
      <PopoverContent>
        {actions.map((action) => (
          <button
            key={action.key}
            type="button"
            className="flex min-h-10 w-full items-center rounded-[var(--radius-form)] px-3 text-left text-sm text-[var(--popover-foreground)] hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
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
