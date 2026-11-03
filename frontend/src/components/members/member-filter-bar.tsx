"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type MemberFilterGroup = {
  id: string;
  label: string;
  count: number;
  pressedLabel: string;
  children: ReactNode;
};

const triggerClassName =
  "inline-flex h-[var(--control-height)] min-h-[var(--control-height)] items-center gap-2 rounded-[var(--radius-form)] border border-[var(--border)] bg-[var(--field-background)] px-3 text-sm font-medium text-[var(--field-foreground)] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

export function MemberIssueChip({
  label,
  detail,
  dismissLabel,
  onDismiss,
}: {
  label: string;
  detail: string;
  dismissLabel: string;
  onDismiss: () => void;
}) {
  return (
    <span
      title={detail}
      className="inline-flex h-[var(--control-height)] max-w-full items-center gap-1 rounded-[var(--radius-chip)] border border-[var(--border)] bg-[var(--accent-soft)] pl-3 pr-1 text-sm text-[var(--foreground)]"
    >
      <span className="truncate">{label}</span>
      <button
        type="button"
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-form)] text-[var(--foreground)]"
        aria-label={dismissLabel}
        onClick={onDismiss}
      >
        <X className="size-4" aria-hidden />
      </button>
    </span>
  );
}

export function MemberFilterBar({
  groups,
  resetLabel,
  onReset,
}: {
  groups: MemberFilterGroup[];
  resetLabel: string;
  onReset: () => void;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      {groups.map((group) => (
        <Popover key={group.id}>
          <PopoverTrigger className={triggerClassName} aria-label={group.count > 0 ? group.pressedLabel : group.label}>
            <span>{group.label}</span>
            {group.count > 0 ? (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-[var(--radius-chip)] bg-[var(--accent-soft)] px-1.5 text-xs font-semibold text-[var(--foreground)]">
                {group.count}
              </span>
            ) : null}
          </PopoverTrigger>
          <PopoverContent className="w-[min(24rem,calc(100vw-2rem))] p-3">{group.children}</PopoverContent>
        </Popover>
      ))}
      <button
        type="button"
        className={cn(
          "inline-flex h-[var(--control-height)] min-h-[var(--control-height)] items-center rounded-[var(--radius-form)] px-2 text-sm font-medium text-[var(--accent)] underline-offset-4 hover:underline",
        )}
        onClick={onReset}
      >
        {resetLabel}
      </button>
    </div>
  );
}
