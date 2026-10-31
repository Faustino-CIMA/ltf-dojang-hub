"use client";

import { useDeskAccess } from "@/components/desk-access";
import { cn } from "@/lib/utils";

type SwitchProps = {
  id?: string;
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  disabled?: boolean;
  label: React.ReactNode;
  className?: string;
};

/**
 * Accessible toggle. Track sits inside the dense control height.
 */
export function Switch({ id, checked, onCheckedChange, disabled, label, className }: SwitchProps) {
  const { readOnly, viewOnlyLabel } = useDeskAccess();
  const locked = Boolean(disabled || readOnly);
  return (
    <div className={cn("flex min-h-[var(--control-height)] items-center gap-2", className)}>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={id ? `${id}-label` : undefined}
        disabled={locked}
        title={readOnly ? viewOnlyLabel : undefined}
        onClick={() => onCheckedChange(!checked)}
        className={cn(
          "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-[var(--radius-form)] border border-[var(--border)] bg-[var(--surface-secondary)] px-0.5 transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          checked && "border-primary bg-primary",
          locked && "pointer-events-none",
          disabled && !readOnly && "opacity-50"
        )}
      >
        <span
          aria-hidden
          className={cn(
            "pointer-events-none block size-4 rounded-[var(--radius-form)] bg-[var(--surface)] ring-1 ring-[var(--border)] transition-transform",
            checked ? "translate-x-3.5" : "translate-x-0"
          )}
        />
      </button>
      {label ? (
        <span id={id ? `${id}-label` : undefined} className="text-sm font-medium text-[var(--foreground)]">
          {label}
        </span>
      ) : null}
    </div>
  );
}
