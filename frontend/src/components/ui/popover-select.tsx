"use client";

import { useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type PopoverSelectOption = {
  value: string;
  label: ReactNode;
  disabled?: boolean;
};

const triggerClassName =
  "inline-flex min-h-[var(--control-height)] min-w-[11rem] items-center justify-between gap-2 rounded-[var(--radius-form)] border border-[var(--border)] bg-[var(--field-background)] px-3 py-2 text-sm text-[var(--field-foreground)] shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50";

const optionClassName =
  "flex min-h-10 w-full items-center rounded-[var(--radius-form)] px-3 text-left text-sm text-[var(--popover-foreground)] hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50";

function focusOption(list: HTMLElement | null, current: Element | null, step: 1 | -1 | "first" | "last") {
  const options = Array.from(list?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
  if (options.length === 0) {
    return;
  }
  if (step === "first") {
    options[0]?.focus();
    return;
  }
  if (step === "last") {
    options[options.length - 1]?.focus();
    return;
  }
  const index = options.indexOf(current as HTMLButtonElement);
  const next = index < 0 ? (step > 0 ? 0 : options.length - 1) : (index + step + options.length) % options.length;
  options[next]?.focus();
}

export function PopoverSelect({
  value,
  onValueChange,
  options,
  placeholder,
  ariaLabel,
  disabled = false,
  className,
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: PopoverSelectOption[];
  placeholder?: string;
  ariaLabel: string;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className={cn(triggerClassName, className)} aria-label={ariaLabel} aria-haspopup="listbox" disabled={disabled}>
        <span className="truncate">{selected?.label ?? placeholder ?? ariaLabel}</span>
        <ChevronDown className="size-4 shrink-0 opacity-50" />
      </PopoverTrigger>
      <PopoverContent
        role="listbox"
        aria-label={ariaLabel}
        ref={listRef}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          const selectedOption = listRef.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]:not(:disabled)');
          (selectedOption ?? listRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)"))?.focus();
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            focusOption(listRef.current, document.activeElement, 1);
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            focusOption(listRef.current, document.activeElement, -1);
          } else if (event.key === "Home") {
            event.preventDefault();
            focusOption(listRef.current, document.activeElement, "first");
          } else if (event.key === "End") {
            event.preventDefault();
            focusOption(listRef.current, document.activeElement, "last");
          }
        }}
      >
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="option"
            aria-selected={option.value === value}
            disabled={option.disabled}
            className={cn(optionClassName, option.value === value && "bg-accent text-accent-foreground")}
            onClick={() => {
              if (option.disabled) {
                return;
              }
              onValueChange(option.value);
              setOpen(false);
            }}
          >
            {option.label}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
