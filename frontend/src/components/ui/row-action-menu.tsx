"use client";

import { useRef, useState } from "react";
import { MoreVertical } from "lucide-react";

import type { MenuAction } from "@/components/ui/action-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const itemClassName =
  "flex min-h-10 w-full items-center gap-2 rounded-[var(--radius-form)] px-3 text-left text-sm text-[var(--popover-foreground)] hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0";

const destructiveItemClassName =
  "text-destructive hover:bg-destructive/10 hover:text-destructive focus-visible:bg-destructive/10 focus-visible:text-destructive";

function focusItem(list: HTMLElement | null, current: Element | null, step: 1 | -1 | "first" | "last") {
  const items = Array.from(list?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
  if (items.length === 0) {
    return;
  }
  if (step === "first") {
    items[0]?.focus();
    return;
  }
  if (step === "last") {
    items[items.length - 1]?.focus();
    return;
  }
  const index = items.indexOf(current as HTMLButtonElement);
  const next = index < 0 ? (step > 0 ? 0 : items.length - 1) : (index + step + items.length) % items.length;
  items[next]?.focus();
}

export function RowActionMenu({
  label,
  actions,
}: {
  label: string;
  actions: MenuAction[];
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className="inline-flex size-[var(--control-height)] items-center justify-center rounded-[var(--radius-form)] text-muted outline-none hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={label}
        aria-haspopup="menu"
        onClick={(event) => event.stopPropagation()}
      >
        <MoreVertical className="size-4" />
      </PopoverTrigger>
      <PopoverContent
        role="menu"
        aria-label={label}
        align="end"
        ref={menuRef}
        className="w-auto min-w-[12rem]"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          menuRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            focusItem(menuRef.current, document.activeElement, 1);
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            focusItem(menuRef.current, document.activeElement, -1);
          } else if (event.key === "Home") {
            event.preventDefault();
            focusItem(menuRef.current, document.activeElement, "first");
          } else if (event.key === "End") {
            event.preventDefault();
            focusItem(menuRef.current, document.activeElement, "last");
          }
        }}
        onClick={(event) => event.stopPropagation()}
      >
        {actions.map((action) => (
          <button
            key={action.key}
            type="button"
            role="menuitem"
            disabled={action.disabled}
            className={cn(itemClassName, action.destructive && destructiveItemClassName)}
            onClick={(event) => {
              event.stopPropagation();
              if (action.disabled) {
                return;
              }
              setOpen(false);
              action.onSelect();
            }}
          >
            {action.icon}
            {action.label}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
