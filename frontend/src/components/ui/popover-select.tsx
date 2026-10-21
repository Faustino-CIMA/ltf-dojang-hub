"use client";

import { Fragment, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type PopoverSelectOption = {
  value: string;
  label: ReactNode;
  searchText?: string;
  disabled?: boolean;
  group?: string;
};

const triggerClassName =
  "inline-flex h-[var(--control-height)] min-h-[var(--control-height)] min-w-[11rem] items-center justify-between gap-2 rounded-[var(--radius-form)] border border-[var(--border)] bg-[var(--field-background)] px-3 py-0 text-sm text-[var(--field-foreground)] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50";

const optionClassName =
  "flex min-h-[var(--control-height)] w-full items-center rounded-[var(--radius-form)] px-3 text-left text-sm text-[var(--popover-foreground)] hover:bg-[var(--accent-soft)] hover:text-foreground focus-visible:bg-[var(--accent-soft)] focus-visible:text-foreground focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50";

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

function optionSearchText(option: PopoverSelectOption): string {
  if (option.searchText) {
    return option.searchText;
  }
  if (typeof option.label === "string" || typeof option.label === "number") {
    return String(option.label);
  }
  return option.value;
}

export function PopoverSelect({
  value,
  onValueChange,
  options,
  placeholder,
  ariaLabel,
  disabled = false,
  className,
  searchable = false,
  searchPlaceholder = "Search",
  emptyMessage = "No matches",
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: PopoverSelectOption[];
  placeholder?: string;
  ariaLabel: string;
  disabled?: boolean;
  className?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
  emptyMessage?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const selected = options.find((option) => option.value === value);
  const filteredOptions = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!searchable || !needle) {
      return options;
    }
    return options.filter((option) => optionSearchText(option).toLowerCase().includes(needle));
  }, [options, query, searchable]);

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
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
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setQuery("");
        }
      }}
    >
      <PopoverTrigger className={cn(triggerClassName, className)} aria-label={ariaLabel} aria-haspopup="listbox" disabled={disabled}>
        <span className="truncate">{selected?.label ?? placeholder ?? ariaLabel}</span>
        <ChevronDown className="size-4 shrink-0 opacity-50" />
      </PopoverTrigger>
      <PopoverContent
        aria-label={ariaLabel}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          if (searchable) {
            searchRef.current?.focus();
            return;
          }
          const selectedOption = listRef.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]:not(:disabled)');
          (selectedOption ?? listRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)"))?.focus();
        }}
      >
        {searchable ? (
          <input
            ref={searchRef}
            type="search"
            value={query}
            aria-label={searchPlaceholder}
            placeholder={searchPlaceholder}
            className="mb-1 h-[var(--control-height)] min-h-[var(--control-height)] w-full rounded-[var(--radius-form)] border border-[var(--border)] bg-[var(--field-background)] px-3 py-0 text-sm text-[var(--field-foreground)] outline-none placeholder:text-[var(--field-placeholder)] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                event.stopPropagation();
                focusOption(listRef.current, null, "first");
              }
            }}
          />
        ) : null}
        <div
          role="listbox"
          aria-label={ariaLabel}
          ref={listRef}
          className="max-h-64 overflow-y-auto"
          onKeyDown={handleKeyDown}
        >
          {filteredOptions.map((option, index) => {
            const showGroup = Boolean(option.group) && option.group !== filteredOptions[index - 1]?.group;
            return (
              <Fragment key={option.value || "blank"}>
                {showGroup ? (
                  <p className="px-3 pb-1 pt-2 text-xs font-medium text-muted" role="presentation">
                    {option.group}
                  </p>
                ) : null}
                <button
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
                    setQuery("");
                  }}
                >
                  {option.label}
                </button>
              </Fragment>
            );
          })}
          {filteredOptions.length === 0 ? (
            <p className="px-3 py-2 text-sm text-muted">{emptyMessage}</p>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
