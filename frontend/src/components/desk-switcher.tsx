"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

import { deskHeaderValue, type DeskChoice } from "@/lib/active-desk";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function deskLabel(
  desk: Pick<DeskChoice, "desk" | "club_name">,
  names: Record<string, string>,
): string {
  const name = names[desk.desk] ?? desk.desk;
  if (desk.club_name) {
    return `${name} · ${desk.club_name}`;
  }
  return name;
}

export function DeskSwitcher({
  desks,
  active,
  names,
  viewOnlyLabel,
  menuLabel,
  onSelect,
}: {
  desks: DeskChoice[];
  active: DeskChoice | null;
  names: Record<string, string>;
  viewOnlyLabel: string;
  menuLabel: string;
  onSelect: (desk: DeskChoice) => void;
}) {
  const [open, setOpen] = useState(false);
  if (desks.length < 2) {
    return null;
  }
  const current = active ?? desks[0];
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="max-w-[16rem]"
          aria-label={menuLabel}
          aria-haspopup="dialog"
        >
          <span className="truncate">{deskLabel(current, names)}</span>
          {current.level === "read_only" ? (
            <span className="text-meta text-muted">{viewOnlyLabel}</span>
          ) : null}
          <ChevronDown aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-1">
        <ul className="max-h-72 overflow-y-auto" aria-label={menuLabel}>
          {desks.map((desk) => {
            const selected = deskHeaderValue(desk) === deskHeaderValue(current);
            return (
              <li key={deskHeaderValue(desk)}>
                <button
                  type="button"
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-[var(--radius-control)] px-2 py-1.5 text-left text-sm text-foreground hover:bg-secondary",
                    selected && "bg-secondary",
                  )}
                  aria-current={selected ? "true" : undefined}
                  onClick={() => {
                    setOpen(false);
                    if (!selected) {
                      onSelect(desk);
                    }
                  }}
                >
                  <span className="truncate">{deskLabel(desk, names)}</span>
                  {desk.level === "read_only" ? (
                    <span className="shrink-0 text-meta text-muted">{viewOnlyLabel}</span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

export function DeskSwitchAsk({
  title,
  message,
  confirmLabel,
  stayLabel,
  onConfirm,
  onStay,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  stayLabel: string;
  onConfirm: () => void;
  onStay: () => void;
}) {
  return (
    <div className="app-panel mx-auto max-w-lg p-4">
      <h2 className="text-section text-foreground">{title}</h2>
      <p className="mt-2 text-sm text-muted">{message}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" variant="primary" onClick={onConfirm}>
          {confirmLabel}
        </Button>
        <Button type="button" variant="outline" onClick={onStay}>
          {stayLabel}
        </Button>
      </div>
    </div>
  );
}
