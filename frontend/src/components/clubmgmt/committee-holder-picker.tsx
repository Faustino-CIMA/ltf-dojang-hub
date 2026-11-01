"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import { PopoverSelect } from "@/components/ui/popover-select";
import { committeeHolderLabel } from "@/lib/committee-holder";
import type { CommitteeHolderChoice } from "@/lib/clubmgmt-api";

export type HolderPage = {
  results: CommitteeHolderChoice[];
  hasMore: boolean;
};

export function CommitteeHolderPicker({
  value,
  onValueChange,
  load,
  fallbackLabel,
  debounceMs = 300,
}: {
  value: string;
  onValueChange: (value: string) => void;
  load: (query: string, page: number, signal: AbortSignal) => Promise<HolderPage>;
  fallbackLabel?: string;
  debounceMs?: number;
}) {
  const t = useTranslations("ClubMgmt");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<CommitteeHolderChoice[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const noClubLabel = t("committeeHolderLtf");

  useEffect(() => {
    const controller = new AbortController();
    const handle = window.setTimeout(() => {
      setLoading(true);
      void load(query, 1, controller.signal)
        .then((result) => {
          if (controller.signal.aborted) {
            return;
          }
          setRows(result.results);
          setHasMore(result.hasMore);
          setPage(1);
        })
        .catch(() => {
          if (controller.signal.aborted) {
            return;
          }
          setRows([]);
          setHasMore(false);
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setLoading(false);
          }
        });
    }, debounceMs);
    return () => {
      window.clearTimeout(handle);
      controller.abort();
    };
  }, [debounceMs, load, query]);

  const options = useMemo(() => {
    const seen = new Set<string>();
    const next = rows.map((row) => {
      const optionValue = String(row.id);
      seen.add(optionValue);
      return {
        value: optionValue,
        label: committeeHolderLabel(row, noClubLabel),
      };
    });
    if (value && fallbackLabel && !seen.has(value)) {
      next.unshift({ value, label: fallbackLabel });
    }
    return next;
  }, [fallbackLabel, noClubLabel, rows, value]);

  const loadMore = () => {
    const nextPage = page + 1;
    const controller = new AbortController();
    setLoading(true);
    void load(query, nextPage, controller.signal)
      .then((result) => {
        setRows((current) => {
          const seen = new Set(current.map((row) => row.id));
          return [...current, ...result.results.filter((row) => !seen.has(row.id))];
        });
        setHasMore(result.hasMore);
        setPage(nextPage);
      })
      .finally(() => setLoading(false));
  };

  return (
    <PopoverSelect
      ariaLabel={t("committeeColumnPerson")}
      value={value}
      onValueChange={onValueChange}
      options={options}
      searchable
      remoteSearch
      searchPlaceholder={t("committeeSearchMembers")}
      emptyMessage={loading ? t("committeeHolderLoading") : t("committeeNoAdults")}
      placeholder={t("committeeNeedMember")}
      onQueryChange={setQuery}
      footer={
        hasMore ? (
          <button
            type="button"
            className="mt-1 flex min-h-[var(--control-height)] w-full items-center rounded-[var(--radius-form)] px-3 text-left text-sm text-muted hover:bg-[var(--accent-soft)] hover:text-foreground"
            onClick={loadMore}
          >
            {t("committeeHolderMore")}
          </button>
        ) : null
      }
    />
  );
}
