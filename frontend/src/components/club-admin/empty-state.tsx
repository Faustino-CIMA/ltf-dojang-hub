import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";

import { LoadingCardGrid } from "@/components/ui/loading-card";

type EmptyStateProps = {
  title: string;
  description?: string;
  icon?: LucideIcon;
  action?: React.ReactNode;
  loading?: boolean;
};

export function EmptyState({
  title,
  description,
  icon: Icon = Inbox,
  action,
  loading = false,
}: EmptyStateProps) {
  if (loading) {
    return <LoadingCardGrid title={title} description={description} />;
  }

  return (
    <div className="app-panel border-dashed px-6 py-10 text-center">
      <span className="mx-auto mb-3 inline-flex size-11 items-center justify-center rounded-[var(--radius-control)] bg-secondary text-muted">
        <Icon className="size-5" aria-hidden />
      </span>
      <p className="text-section text-foreground">{title}</p>
      {description ? <p className="mx-auto mt-2 max-w-md text-sm text-muted">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
