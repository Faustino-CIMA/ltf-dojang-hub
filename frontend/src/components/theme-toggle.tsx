"use client";

import { useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";

import { persistTheme, readThemeChoice, subscribeTheme, type ThemeChoice } from "@/lib/theme";
import { cn } from "@/lib/utils";

const choices: ThemeChoice[] = ["light", "dark", "system"];

function serverTheme(): ThemeChoice {
  return "system";
}

export function ThemeToggle() {
  const t = useTranslations("Common");
  const choice = useSyncExternalStore(subscribeTheme, readThemeChoice, serverTheme);
  const labels: Record<ThemeChoice, string> = {
    light: t("themeLight"),
    dark: t("themeDark"),
    system: t("themeSystem"),
  };

  return (
    <div
      role="group"
      aria-label={t("themeLabel")}
      className="inline-flex items-center rounded-[var(--radius-control)] border border-border bg-secondary p-0.5"
    >
      {choices.map((item) => {
        const selected = choice === item;
        return (
          <button
            key={item}
            type="button"
            aria-pressed={selected}
            className={cn(
              "h-6 rounded-[var(--radius-control)] px-2 text-[length:var(--text-meta)] font-medium",
              selected ? "bg-primary text-primary-foreground" : "text-muted hover:text-foreground",
            )}
            onClick={() => persistTheme(item)}
          >
            {labels[item]}
          </button>
        );
      })}
    </div>
  );
}
