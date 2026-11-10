"use client";

import { useState } from "react";
import { CircleAlert, type LucideIcon } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { closedInfoHint, reduceInfoHint } from "@/components/ui/info-hint-state";

type InfoHintProps = {
  ariaLabel: string;
  children: React.ReactNode;
  className?: string;
  /** default is the 24px title badge. compact is the 16px field badge. */
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
  const [state, setState] = useState(closedInfoHint);
  const compact = size === "compact";

  const apply = (event: Parameters<typeof reduceInfoHint>[1]) => {
    setState((current) => reduceInfoHint(current, event));
  };

  return (
    <div className={cn("relative z-10 shrink-0", className)} onMouseLeave={() => apply("leave")}>
      <Popover
        open={state.open}
        onOpenChange={(next) => {
          if (!next) {
            apply("escape");
          }
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              "inline-flex items-center justify-center rounded-[var(--radius-form)] text-muted transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              compact ? "size-4" : "size-6",
            )}
            aria-label={ariaLabel}
            aria-expanded={state.open}
            onMouseEnter={() => apply("enter")}
            onFocus={() => apply("focus")}
            onBlur={() => apply("blur")}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              apply("click");
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.stopPropagation();
                apply("escape");
              }
            }}
          >
            <Icon className={compact ? "size-3" : "size-3.5"} aria-hidden />
          </button>
        </PopoverTrigger>
        <PopoverContent
          side="bottom"
          align={tooltipAlign === "left" ? "start" : "end"}
          role="tooltip"
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => event.preventDefault()}
          className="w-64 min-w-0 max-w-[min(16rem,calc(100vw-2rem))] px-3 py-2 text-left text-sm leading-snug text-muted"
        >
          {children}
        </PopoverContent>
      </Popover>
    </div>
  );
}
