"use client";

import { useRef, useState } from "react";
import { MoreVertical } from "lucide-react";

import { useDeskAccess } from "@/components/desk-access";
import type { MenuAction } from "@/components/ui/action-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const itemClassName =
  "flex min-h-[var(--control-height)] w-full items-center gap-2 rounded-[var(--radius-form)] px-2.5 py-1.5 text-left text-sm text-[var(--popover-foreground)] hover:bg-[var(--accent-soft)] hover:text-foreground focus-visible:bg-[var(--accent-soft)] focus-visible:text-foreground focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0";

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
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const { readOnly } = useDeskAccess();
  const visible = readOnly ? actions.filter((action) => action.href) : actions;
  const pending = visible.find((action) => action.key === pendingKey) ?? null;
  if (visible.length === 0) {
    return null;
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setPendingKey(null);
      }}
    >
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
        className="w-max min-w-[12rem] max-w-[min(22rem,calc(100vw-1.5rem))]"
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
        {pending ? (
          <div className="space-y-2 px-1 py-1">
            <p className="px-2 text-sm text-popover-foreground">{pending.confirmLabel}</p>
            <button
              type="button"
              role="menuitem"
              className={cn(itemClassName, destructiveItemClassName)}
              onClick={(event) => {
                event.stopPropagation();
                setOpen(false);
                setPendingKey(null);
                pending.onSelect();
              }}
            >
              {pending.label}
            </button>
          </div>
        ) : (
          visible.map((action) =>
            action.href ? (
              <a
                key={action.key}
                href={action.href}
                role="menuitem"
                className={cn(itemClassName, action.destructive && destructiveItemClassName)}
                onClick={(event) => {
                  event.stopPropagation();
                  setOpen(false);
                }}
              >
                {action.icon}
                {action.label}
              </a>
            ) : (
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
                  if (action.confirmLabel) {
                    setPendingKey(action.key);
                    return;
                  }
                  setOpen(false);
                  action.onSelect();
                }}
              >
                {action.icon}
                {action.label}
              </button>
            ),
          )
        )}
      </PopoverContent>
    </Popover>
  );
}
