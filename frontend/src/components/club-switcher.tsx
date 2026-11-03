"use client";

import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronDown } from "lucide-react";

import { ALL_CLUBS_SELECT_VALUE } from "@/components/club-selection-provider";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export const CLUB_SWITCHER_SEARCH_THRESHOLD = 8;

export type ClubSwitcherClub = {
  id: number;
  name: string;
};

type ClubOption = {
  value: string;
  label: string;
};

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

export function ClubSwitcher({
  clubs,
  value,
  onValueChange,
  allowAllClubs = false,
  allClubsLabel,
  placeholder,
  ariaLabel,
  searchPlaceholder,
  emptyMessage,
}: {
  clubs: ClubSwitcherClub[];
  value?: string;
  onValueChange: (value: string) => void;
  allowAllClubs?: boolean;
  allClubsLabel: string;
  placeholder: string;
  ariaLabel: string;
  searchPlaceholder: string;
  emptyMessage: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const searchable = clubs.length > CLUB_SWITCHER_SEARCH_THRESHOLD;
  const options = useMemo<ClubOption[]>(() => {
    const clubOptions = clubs.map((club) => ({ value: String(club.id), label: club.name }));
    return allowAllClubs ? [{ value: ALL_CLUBS_SELECT_VALUE, label: allClubsLabel }, ...clubOptions] : clubOptions;
  }, [allowAllClubs, allClubsLabel, clubs]);
  const selected = options.find((option) => option.value === value);
  const needle = query.trim().toLowerCase();
  const visibleOptions =
    searchable && needle ? options.filter((option) => option.label.toLowerCase().includes(needle)) : options;

  const handleListKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusOption(listRef.current, document.activeElement, 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (searchable && listRef.current?.querySelector("button") === document.activeElement) {
        searchRef.current?.focus();
        return;
      }
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
      <PopoverTrigger
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        className="inline-flex h-[var(--control-height)] min-h-[var(--control-height)] min-w-0 max-w-[min(16rem,calc(100vw-7rem))] items-center justify-between gap-2 rounded-[var(--radius-control)] border border-border bg-surface px-3 text-sm font-medium text-foreground outline-none hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="truncate">{selected?.label ?? placeholder}</span>
        <ChevronDown className="size-4 shrink-0 text-muted" aria-hidden />
      </PopoverTrigger>
      <PopoverContent
        align="end"
        collisionPadding={8}
        aria-label={ariaLabel}
        className="w-[min(20rem,calc(100vw-1.5rem))]"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          if (searchable) {
            searchRef.current?.focus();
            return;
          }
          const current = listRef.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]');
          (current ?? listRef.current?.querySelector<HTMLButtonElement>("button"))?.focus();
        }}
      >
        {searchable ? (
          <input
            ref={searchRef}
            type="search"
            value={query}
            aria-label={searchPlaceholder}
            placeholder={searchPlaceholder}
            className="mb-1 h-[var(--control-height)] min-h-[var(--control-height)] w-full rounded-[var(--radius-form)] border border-border bg-surface px-3 text-sm text-foreground outline-none placeholder:text-muted focus-visible:ring-2 focus-visible:ring-ring"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
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
          onKeyDown={handleListKeyDown}
        >
          {visibleOptions.map((option) => {
            const current = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={current}
                className={cn(
                  "flex min-h-[var(--control-height)] w-full items-center gap-2 rounded-[var(--radius-form)] px-2.5 text-left text-sm text-popover-foreground outline-none hover:bg-secondary hover:text-foreground focus-visible:bg-secondary focus-visible:ring-2 focus-visible:ring-ring",
                  current && "font-medium text-foreground",
                )}
                onClick={() => {
                  onValueChange(option.value);
                  setOpen(false);
                  setQuery("");
                }}
              >
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
                {current ? <Check className="size-4 shrink-0 text-foreground" aria-hidden /> : null}
              </button>
            );
          })}
          {visibleOptions.length === 0 ? <p className="px-3 py-2 text-sm text-muted">{emptyMessage}</p> : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
