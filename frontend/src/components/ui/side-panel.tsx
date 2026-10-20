"use client";

import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { RequiredForm } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function SidePanel({
  open,
  title,
  description,
  closeLabel,
  onClose,
  children,
  footer,
  wide = false,
}: {
  open: boolean;
  title: string;
  description?: string;
  closeLabel: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** Two-column forms. The default panel stays max-w-md. */
  wide?: boolean;
}) {
  if (!open) {
    return null;
  }
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" className="absolute inset-0 bg-foreground/40" aria-label={closeLabel} onClick={onClose} />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="side-panel-title"
        className={cn(
          "relative flex h-full w-full flex-col border-l border-border bg-surface",
          wide ? "max-w-3xl" : "max-w-md",
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-3 py-2">
          <div>
            <h2 id="side-panel-title" className="text-section text-foreground">
              {title}
            </h2>
            {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
          </div>
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            {closeLabel}
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-2">
          <RequiredForm>{children}</RequiredForm>
        </div>
        {footer ? <div className="flex flex-wrap justify-end gap-2 border-t border-border px-3 py-2">{footer}</div> : null}
      </aside>
    </div>
  );
}
