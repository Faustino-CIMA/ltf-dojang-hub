"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type StudentPick = {
  id: number;
  label: string;
  age?: number | null;
};

type AgeFilter = "all" | "under_12" | "from_12" | "adult";

function matchesAge(age: number | null | undefined, filter: AgeFilter) {
  if (filter === "all") return true;
  if (age === null || age === undefined) return false;
  if (filter === "under_12") return age < 12;
  if (filter === "from_12") return age >= 12;
  return age >= 18;
}

function matchesQuery(label: string, query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return needle.split(/\s+/).every((part) => label.toLowerCase().includes(part));
}

export function StudentMultiPicker({
  options,
  onAdd,
  showAgeFilter = false,
}: {
  options: StudentPick[];
  onAdd: (ids: number[]) => void;
  showAgeFilter?: boolean;
}) {
  const t = useTranslations("ClubAdmin");
  const [query, setQuery] = useState("");
  const [ageFilter, setAgeFilter] = useState<AgeFilter>("all");
  const [checked, setChecked] = useState<number[]>([]);

  const optionKey = options.map((option) => option.id).join(",");

  useEffect(() => {
    const allowed = new Set(optionKey ? optionKey.split(",").map(Number) : []);
    setChecked((current) => {
      const next = current.filter((id) => allowed.has(id));
      return next.length === current.length ? current : next;
    });
  }, [optionKey]);

  const visible = useMemo(
    () =>
      [...options]
        .filter((option) => matchesAge(option.age, showAgeFilter ? ageFilter : "all") && matchesQuery(option.label, query))
        .sort((left, right) => left.label.localeCompare(right.label)),
    [ageFilter, options, query, showAgeFilter],
  );

  const visibleIds = visible.map((option) => option.id);
  const allVisibleChecked = visibleIds.length > 0 && visibleIds.every((id) => checked.includes(id));

  const toggle = (id: number) => {
    setChecked((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  };

  const toggleShown = () => {
    setChecked((current) => {
      if (allVisibleChecked) return current.filter((id) => !visibleIds.includes(id));
      return Array.from(new Set([...current, ...visibleIds]));
    });
  };

  const add = () => {
    if (checked.length === 0) return;
    onAdd(checked);
    setChecked([]);
    setQuery("");
  };

  return (
    <div className="mt-2">
      {showAgeFilter ? (
        <div className="mb-2 flex flex-wrap gap-2">
          {(["all", "under_12", "from_12", "adult"] as const).map((filter) => (
            <Button key={filter} type="button" size="sm" variant={ageFilter === filter ? "primary" : "outline"} onClick={() => setAgeFilter(filter)}>
              {t(`trainingAge_${filter}`)}
            </Button>
          ))}
        </div>
      ) : null}
      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.preventDefault();
        }}
        placeholder={t("trainingSearchStudents")}
        aria-label={t("trainingSearchStudents")}
      />
      <div className="mt-2 overflow-hidden rounded-[var(--radius-form)] border border-border">
        <div className="flex items-center justify-between gap-3 border-b border-border bg-secondary/60 px-3 py-2">
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input type="checkbox" checked={allVisibleChecked} onChange={toggleShown} disabled={visible.length === 0} />
            {t("trainingSelectShownStudents")}
          </label>
          <span className="text-xs text-muted">{t("trainingSelectedCount", { count: checked.length })}</span>
        </div>
        <ul className="max-h-72 overflow-auto">
          {visible.length === 0 ? (
            <li className="px-3 py-3 text-sm text-muted">
              {options.length === 0 ? t("trainingNoMoreStudents") : t("trainingNoMatches")}
            </li>
          ) : (
            visible.map((option) => (
              <li key={option.id} className="border-b border-border last:border-0">
                <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-accent">
                  <input type="checkbox" checked={checked.includes(option.id)} onChange={() => toggle(option.id)} />
                  <span>
                    {option.label}
                    {option.age !== null && option.age !== undefined ? ` · ${option.age}` : ""}
                  </span>
                </label>
              </li>
            ))
          )}
        </ul>
      </div>
      <Button className="mt-2" type="button" variant="outline" size="sm" disabled={checked.length === 0} onClick={add}>
        {t("trainingAddSelected")}
      </Button>
    </div>
  );
}
