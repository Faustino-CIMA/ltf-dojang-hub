"use client";

import { InfoHint } from "@/components/ui/info-hint";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";

export function PhotoRejectionNote({
  title,
  body,
  reason,
  info,
  infoLabel,
  actionLabel,
  onSendAnother,
}: {
  title: string;
  body: string;
  reason?: string;
  info: string;
  infoLabel: string;
  actionLabel: string;
  onSendAnother: () => void;
}) {
  return (
    <div className="space-y-2 rounded-[var(--radius-card)] border border-border bg-surface p-3">
      <div className="flex items-center gap-2">
        <StatusBadge label={title} tone="warning" />
        <InfoHint size="compact" ariaLabel={infoLabel}>
          {info}
        </InfoHint>
      </div>
      <p className="text-sm text-muted">{body}</p>
      {reason ? <p className="text-sm text-foreground">{reason}</p> : null}
      <Button type="button" onClick={onSendAnother}>
        {actionLabel}
      </Button>
    </div>
  );
}
