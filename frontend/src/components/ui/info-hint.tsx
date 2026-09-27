"use client";

import { useState } from "react";
import { CircleAlert, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

type InfoHintProps = {
  ariaLabel: string;
  children: React.ReactNode;
  className?: string;
  size?: "default" | "compact";
  icon?: LucideIcon;
  tooltipAlign?: "left" | "right";
};

export function InfoHint({
  ariaLabel,
  children,
  className,
  size = "default",
  icon: Icon = CircleAlert,
  tooltipAlign = "right",
}: InfoHintProps) {
  const [open, setOpen] = useState(false);
  const compact = size === "compact";

  return (
    <div className={cn("group relative z-10 shrink-0", open && "z-30", className)}>
      <button
        type="button"
        className={cn(
          "inline-flex items-center justify-center rounded-[var(--radius-form)] text-muted transition-colors hover:bg-secondary hover:text-foreground",
          compact
            ? "size-6"
            : "h-[var(--control-height)] min-h-[var(--control-height)] w-[var(--control-height)]",
        )}
        aria-label={ariaLabel}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        onBlur={() => setOpen(false)}
      >
        <Icon className={compact ? "size-3.5" : "h-4 w-4"} />
      </button>
      <div
        role="tooltip"
        className={cn(
          "absolute top-full z-30 mt-2 w-64 max-w-[min(16rem,calc(100vw-2rem))] rounded-[var(--radius-form)] border border-border bg-surface px-3 py-2 text-left text-sm leading-snug text-muted shadow-[var(--shadow-card)]",
          tooltipAlign === "left" ? "left-0" : "right-0",
          open ? "visible" : "invisible group-hover:visible group-focus-within:visible",
        )}
      >
        {children}
      </div>
    </div>
  );
}
