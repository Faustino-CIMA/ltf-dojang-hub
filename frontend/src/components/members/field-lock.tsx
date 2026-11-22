import { Lock, LockOpen } from "lucide-react";

export function FieldLock({
  locked,
  lockedLabel,
  openLabel,
}: {
  locked: boolean;
  lockedLabel: string;
  openLabel: string;
}) {
  const label = locked ? lockedLabel : openLabel;
  const Icon = locked ? Lock : LockOpen;
  return (
    <span className="inline-flex min-h-[var(--control-height-sm)] items-center gap-1 text-xs text-muted">
      <Icon className="size-4 text-foreground" aria-hidden />
      <span>{label}</span>
    </span>
  );
}
