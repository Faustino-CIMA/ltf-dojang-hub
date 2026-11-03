"use client";

import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";

import { cn } from "@/lib/utils";
import type { SortDirection } from "@/lib/table-sort";

export function SortableColumnHeader({
  label,
  active,
  direction,
  onSort,
}: {
  label: ReactNode;
  active: boolean;
  direction?: SortDirection;
  onSort: () => void;
}) {
  return (
    <button
      type="button"
      className="inline-flex min-h-[var(--control-height)] items-center gap-1.5 rounded-[var(--radius-form)] text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={onSort}
    >
      <span>{label}</span>
      <span aria-hidden className={cn("inline-flex size-4 items-center justify-center", active ? "text-foreground" : "text-muted")}>
        {active && direction === "asc" ? (
          <ArrowUp className="size-3.5" />
        ) : active && direction === "desc" ? (
          <ArrowDown className="size-3.5" />
        ) : (
          <ChevronsUpDown className="size-3.5 opacity-60" />
        )}
      </span>
    </button>
  );
}
