"use client";

import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronDown } from "lucide-react";
import Link from "next/link";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { venueShortAddress, type TrainingVenue } from "@/lib/training-venues";
import { cn } from "@/lib/utils";

export const VENUE_SEARCH_THRESHOLD = 8;

export type VenueChoice = {
  venueId: number | null;
  place: string;
};

export function timetablePlaceText(row: { place?: string; venue_name?: string | null }): string {
  return row.venue_name || row.place || "";
}

type VenueOption = {
  id: number;
  name: string;
  detail: string;
  inactive: boolean;
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

export function TrainingVenuePicker({
  venues,
  venueId,
  place,
  onChange,
  settingsHref,
  knownName = "",
  loadFailed = false,
  ariaLabel,
  searchPlaceholder,
  emptySearch,
  noneLabel,
  legacyHint,
  inactiveLabel,
  emptyTitle,
  emptyBody,
  emptyLink,
  loadError,
  loadingLabel,
}: {
  venues: TrainingVenue[] | null;
  venueId: number | null;
  place: string;
  onChange: (choice: VenueChoice) => void;
  settingsHref: string;
  knownName?: string;
  loadFailed?: boolean;
  ariaLabel: string;
  searchPlaceholder: string;
  emptySearch: string;
  noneLabel: string;
  legacyHint: string;
  inactiveLabel: string;
  emptyTitle: string;
  emptyBody: string;
  emptyLink: string;
  loadError: string;
  loadingLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const legacyPlace = venueId == null ? place : "";
  const options = useMemo<VenueOption[]>(() => {
    const rows = venues ?? [];
    return rows.map((venue) => ({
      id: venue.id,
      name: venue.name,
      detail: venueShortAddress(venue),
      inactive: !venue.is_active,
    }));
  }, [venues]);
  const searchable = options.length > VENUE_SEARCH_THRESHOLD;
  const selected = options.find((option) => option.id === venueId);
  const needle = query.trim().toLowerCase();
  const visibleOptions =
    searchable && needle
      ? options.filter((option) => `${option.name} ${option.detail}`.toLowerCase().includes(needle))
      : options;
  const chosenLabel = selected?.name || (venueId != null ? knownName : "") || legacyPlace;
  const buttonLabel = chosenLabel || noneLabel;

  const choose = (choice: VenueChoice) => {
    onChange(choice);
    setOpen(false);
    setQuery("");
  };

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

  if (venues === null) {
    return (
      <div className="space-y-2">
        {chosenLabel ? <p className="text-sm text-foreground">{chosenLabel}</p> : null}
        <p className={cn("text-sm", loadFailed ? "text-destructive" : "text-muted")}>
          {loadFailed ? loadError : loadingLabel}
        </p>
      </div>
    );
  }

  if (options.length === 0) {
    return (
      <div className="space-y-2">
        {legacyPlace ? (
          <div className="flex min-h-[var(--control-height)] items-center justify-between gap-2 rounded-[var(--radius-control)] border border-border bg-surface px-3">
            <span className="min-w-0 truncate text-sm text-foreground">{legacyPlace}</span>
            <button
              type="button"
              className="shrink-0 text-sm font-medium text-link outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => choose({ venueId: null, place: "" })}
            >
              {noneLabel}
            </button>
          </div>
        ) : null}
        <div className="rounded-[var(--radius-form)] border border-dashed border-border bg-surface px-3 py-3">
          <p className="text-sm font-medium text-foreground">{emptyTitle}</p>
          <p className="mt-1 text-sm text-muted">{emptyBody}</p>
          <Link
            href={settingsHref}
            className="mt-2 inline-flex text-sm font-medium text-link underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
          >
            {emptyLink}
          </Link>
        </div>
      </div>
    );
  }

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
        className="inline-flex h-[var(--control-height)] min-h-[var(--control-height)] w-full min-w-0 items-center justify-between gap-2 rounded-[var(--radius-control)] border border-border bg-surface px-3 text-sm font-medium outline-none hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className={cn("truncate", chosenLabel ? "text-foreground" : "text-muted")}>{buttonLabel}</span>
        <ChevronDown className="size-4 shrink-0 text-muted" aria-hidden />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        collisionPadding={8}
        aria-label={ariaLabel}
        className="w-[var(--radix-popover-trigger-width)] min-w-[16rem]"
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
          <button
            type="button"
            role="option"
            aria-selected={venueId == null && !legacyPlace}
            className={cn(
              "flex min-h-[var(--control-height)] w-full items-center gap-2 rounded-[var(--radius-form)] px-2.5 text-left text-sm text-popover-foreground outline-none hover:bg-secondary hover:text-foreground focus-visible:bg-secondary focus-visible:ring-2 focus-visible:ring-ring",
              venueId == null && !legacyPlace && "font-medium text-foreground",
            )}
            onClick={() => choose({ venueId: null, place: "" })}
          >
            <span className="min-w-0 flex-1 truncate">{noneLabel}</span>
            {venueId == null && !legacyPlace ? <Check className="size-4 shrink-0 text-foreground" aria-hidden /> : null}
          </button>
          {legacyPlace ? (
            <button
              type="button"
              role="option"
              aria-selected={venueId == null}
              className="flex min-h-[var(--control-height)] w-full items-center gap-2 rounded-[var(--radius-form)] px-2.5 text-left text-sm font-medium text-foreground outline-none hover:bg-secondary focus-visible:bg-secondary focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => choose({ venueId: null, place: legacyPlace })}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate">{legacyPlace}</span>
                <span className="block truncate text-xs font-normal text-muted">{legacyHint}</span>
              </span>
              <Check className="size-4 shrink-0 text-foreground" aria-hidden />
            </button>
          ) : null}
          {visibleOptions.map((option) => {
            const current = option.id === venueId;
            return (
              <button
                key={option.id}
                type="button"
                role="option"
                aria-selected={current}
                className={cn(
                  "flex min-h-[var(--control-height)] w-full items-center gap-2 rounded-[var(--radius-form)] px-2.5 text-left text-sm text-popover-foreground outline-none hover:bg-secondary hover:text-foreground focus-visible:bg-secondary focus-visible:ring-2 focus-visible:ring-ring",
                  current && "font-medium text-foreground",
                )}
                onClick={() => choose({ venueId: option.id, place: option.name })}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate">
                    {option.name}
                    {option.inactive ? <span className="text-muted"> · {inactiveLabel}</span> : null}
                  </span>
                  {option.detail ? <span className="block truncate text-xs text-muted">{option.detail}</span> : null}
                </span>
                {current ? <Check className="size-4 shrink-0 text-foreground" aria-hidden /> : null}
              </button>
            );
          })}
          {visibleOptions.length === 0 ? <p className="px-3 py-2 text-sm text-muted">{emptySearch}</p> : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
