"use client";

import { usePathname, useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const LOCALES = ["en", "lb"] as const;

export function LanguageSwitcher({
  compact = false,
  variant = "popover",
}: {
  compact?: boolean;
  variant?: "popover" | "segment";
}) {
  const t = useTranslations("Common");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  const labelFor = (value: string) => (value === "lb" ? t("languageLux") : t("languageEnglish"));

  const handleLocaleChange = (value: string) => {
    if (value === locale) {
      return;
    }
    const safePath = pathname || "/";
    const segments = safePath.split("/");
    if (segments.length > 1) {
      segments[1] = value;
    } else {
      segments.push(value);
    }
    router.push(segments.join("/") || `/${value}`);
  };

  if (variant === "segment") {
    return (
      <div className="flex items-center gap-1" role="group" aria-label={t("languageLabel")}>
        {LOCALES.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={value === locale}
            onClick={() => handleLocaleChange(value)}
            className={cn(
              "rounded-[var(--radius-control)] px-2 py-1 text-xs font-bold tracking-wide",
              value === locale
                ? "bg-[color-mix(in_oklab,var(--brand-on-ink)_14%,transparent)] text-[var(--brand-on-ink)]"
                : "text-[color-mix(in_oklab,var(--brand-on-ink)_55%,transparent)]"
            )}
          >
            {value.toUpperCase()}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {compact ? null : <span className="text-sm font-medium text-muted">{t("languageLabel")}</span>}
      <Popover>
        <PopoverTrigger
          type="button"
          aria-label={t("languageLabel")}
          className="inline-flex h-[var(--control-height)] min-w-16 items-center justify-center rounded-[var(--radius-control)] border border-border bg-surface px-3 text-sm font-semibold text-foreground"
        >
          {locale.toUpperCase()}
        </PopoverTrigger>
        <PopoverContent align="end" className="min-w-40">
          {LOCALES.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={value === locale}
              onClick={() => handleLocaleChange(value)}
              className={cn(
                "flex min-h-[var(--control-height)] w-full items-center rounded-[var(--radius-form)] px-3 text-left text-sm",
                value === locale ? "bg-secondary font-semibold text-foreground" : "text-foreground hover:bg-secondary"
              )}
            >
              {labelFor(value)}
            </button>
          ))}
        </PopoverContent>
      </Popover>
    </div>
  );
}
