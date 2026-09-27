import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

type LoadingCardProps = {
  title?: string;
  description?: string;
  icon?: LucideIcon;
  badge?: ReactNode;
  header?: ReactNode;
  delayMs?: number;
  className?: string;
};

export function LoadingCard({
  title,
  description,
  icon: Icon,
  badge,
  header,
  delayMs = 0,
  className,
}: LoadingCardProps) {
  return (
    <div className={cn("app-panel relative p-4", className)} style={{ animationDelay: `${delayMs}ms` }}>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-0.5 overflow-hidden bg-[color-mix(in_oklab,var(--accent)_18%,transparent)]">
        <span className="app-loading-shimmer absolute inset-y-0 w-1/3 bg-[var(--accent)]" />
      </div>
      {header ?? (
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            {Icon ? <Icon className="size-4 shrink-0 text-[var(--accent)]" aria-hidden /> : null}
            {title ? (
              <p className="truncate text-sm font-semibold text-foreground">{title}</p>
            ) : (
              <span className="h-4 w-28 animate-pulse rounded-full bg-[color-mix(in_oklab,var(--accent)_16%,white)]" />
            )}
          </div>
          {badge}
        </div>
      )}
      <div className="mt-3 flex items-center gap-2 text-sm text-muted">
        <Spinner className="size-4" />
        {description ? (
          <span>{description}</span>
        ) : (
          <span className="h-3 w-40 animate-pulse rounded-full bg-secondary" />
        )}
      </div>
    </div>
  );
}

type LoadingCardGridProps = {
  title: string;
  description?: string;
  count?: number;
  className?: string;
};

export function LoadingCardGrid({ title, description, count = 3, className }: LoadingCardGridProps) {
  return (
    <div
      className={cn("grid gap-3 md:grid-cols-2 xl:grid-cols-3", className)}
      role="status"
      aria-busy="true"
      aria-live="polite"
      aria-label={title}
    >
      {Array.from({ length: Math.max(1, count) }, (_, index) => (
        <LoadingCard
          key={index}
          title={index === 0 ? title : undefined}
          description={index === 0 ? description : undefined}
          delayMs={index * 70}
        />
      ))}
    </div>
  );
}
