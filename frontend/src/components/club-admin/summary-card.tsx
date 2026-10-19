import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export type SummaryCardTone = "accent" | "success" | "warning" | "danger" | "neutral";

type SummaryCardProps = {
  title: string;
  value: string;
  helper?: string;
  icon?: LucideIcon;
  tone?: SummaryCardTone;
};

const toneClasses: Record<SummaryCardTone, { tile: string; icon: string }> = {
  accent: {
    tile: "bg-[var(--accent-soft)]",
    icon: "bg-primary text-primary-foreground",
  },
  success: {
    tile: "bg-[var(--badge-success-bg)]",
    icon: "bg-[var(--badge-success-border)] text-[var(--badge-success-fg)]",
  },
  warning: {
    tile: "bg-[var(--badge-warning-bg)]",
    icon: "bg-[var(--badge-warning-border)] text-[var(--badge-warning-fg)]",
  },
  danger: {
    tile: "bg-[var(--badge-danger-bg)]",
    icon: "bg-[var(--badge-danger-border)] text-[var(--badge-danger-fg)]",
  },
  neutral: {
    tile: "bg-surface",
    icon: "bg-secondary text-muted",
  },
};

export function SummaryCard({ title, value, helper, icon: Icon, tone = "neutral" }: SummaryCardProps) {
  const palette = toneClasses[tone];
  return (
    <div className={cn("app-panel p-5", palette.tile)}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-muted">{title}</p>
        {Icon ? (
          <span className={cn("inline-flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-control)]", palette.icon)}>
            <Icon className="size-4" aria-hidden />
          </span>
        ) : null}
      </div>
      <p className="mt-3 text-display tabular-nums text-foreground">{value}</p>
      {helper ? <p className="mt-2 text-meta">{helper}</p> : null}
    </div>
  );
}
