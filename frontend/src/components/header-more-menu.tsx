"use client";

import { useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Landmark, Languages, Laptop, LogOut, Moon, MoreHorizontal, ShieldCheck, Sun, Terminal } from "lucide-react";

import { LOCALES, pathWithLocale } from "@/components/language-switcher";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { persistTheme, readThemeChoice, subscribeTheme, type ThemeChoice } from "@/lib/theme";
import { cn } from "@/lib/utils";

const choices: ThemeChoice[] = ["light", "dark", "system"];

const itemClassName =
  "flex min-h-[var(--control-height)] w-full items-center gap-2 rounded-[var(--radius-form)] px-2.5 py-1.5 text-left text-sm text-[var(--popover-foreground)] hover:bg-[var(--accent-soft)] hover:text-foreground focus-visible:bg-[var(--accent-soft)] focus-visible:text-foreground focus-visible:outline-none [&_svg]:size-4 [&_svg]:shrink-0";

function focusItem(list: HTMLElement | null, current: Element | null, step: 1 | -1 | "first" | "last") {
  const items = Array.from(list?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
  if (items.length === 0) {
    return;
  }
  if (step === "first") {
    items[0]?.focus();
    return;
  }
  if (step === "last") {
    items[items.length - 1]?.focus();
    return;
  }
  const index = items.indexOf(current as HTMLButtonElement);
  const next = index < 0 ? (step > 0 ? 0 : items.length - 1) : (index + step + items.length) % items.length;
  items[next]?.focus();
}

function serverTheme(): ThemeChoice {
  return "system";
}

export function HeaderMoreMenu({
  name,
  role,
  onSecurity,
  onSignOut,
  opsLabel,
  onOps,
  federationLabel,
  onFederation,
}: {
  name: string;
  role: string;
  onSecurity: () => void;
  onSignOut: () => void;
  opsLabel?: string;
  onOps?: () => void;
  federationLabel?: string;
  onFederation?: () => void;
}) {
  const t = useTranslations("Common");
  const auth = useTranslations("Auth");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const theme = useSyncExternalStore(subscribeTheme, readThemeChoice, serverTheme);
  const themeLabels: Record<ThemeChoice, string> = {
    light: t("themeLight"),
    dark: t("themeDark"),
    system: t("themeSystem"),
  };
  const themeIcons: Record<ThemeChoice, ReactNode> = {
    light: <Sun aria-hidden />,
    dark: <Moon aria-hidden />,
    system: <Laptop aria-hidden />,
  };
  const localeName = (value: (typeof LOCALES)[number]) => {
    if (value === "fr") return "Français";
    if (value === "de") return "Deutsch";
    if (value === "lb") return t("languageLux");
    return t("languageEnglish");
  };

  const close = () => setOpen(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className="inline-flex size-[var(--control-height)] items-center justify-center rounded-[var(--radius-form)] border border-border bg-surface text-foreground outline-none hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={t("headerMore")}
        aria-haspopup="menu"
        data-guide="header.more"
      >
        <MoreHorizontal className="size-4" aria-hidden />
      </PopoverTrigger>
      <PopoverContent
        role="menu"
        aria-label={t("headerMore")}
        align="end"
        ref={menuRef}
        className="w-[min(18rem,calc(100vw-1.5rem))]"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          menuRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            focusItem(menuRef.current, document.activeElement, 1);
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            focusItem(menuRef.current, document.activeElement, -1);
          } else if (event.key === "Home") {
            event.preventDefault();
            focusItem(menuRef.current, document.activeElement, "first");
          } else if (event.key === "End") {
            event.preventDefault();
            focusItem(menuRef.current, document.activeElement, "last");
          }
        }}
      >
        <div className="px-2.5 py-2">
          <p className="truncate text-sm font-medium text-foreground">{name}</p>
          {role ? <p className="truncate text-meta text-muted">{role}</p> : null}
        </div>
        <div className="space-y-1 border-t border-border px-1 py-2" role="group" aria-label={t("themeLabel")}>
          <p className="px-1.5 text-meta text-muted">{t("themeLabel")}</p>
          <div className="grid grid-cols-3 gap-1">
            {choices.map((item) => (
              <button
                key={item}
                type="button"
                role="menuitemradio"
                aria-checked={theme === item}
                className={cn(
                  "inline-flex min-h-[var(--control-height)] items-center justify-center gap-1 rounded-[var(--radius-form)] px-1 text-sm [&_svg]:size-4",
                  theme === item ? "bg-secondary font-semibold text-foreground" : "text-muted hover:bg-secondary hover:text-foreground",
                )}
                onClick={() => persistTheme(item)}
              >
                {themeIcons[item]}
                {themeLabels[item]}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1 border-t border-border px-1 py-2" role="group" aria-label={t("languageLabel")}>
          <p className="flex items-center gap-2 px-1.5 text-sm text-foreground">
            <Languages className="size-4 shrink-0" aria-hidden />
            {t("languageLabel")}: {localeName(locale as (typeof LOCALES)[number])}
          </p>
          {LOCALES.map((value) => (
            <button
              key={value}
              type="button"
              role="menuitemradio"
              aria-checked={value === locale}
              className={cn(itemClassName, value === locale && "bg-secondary font-semibold")}
              onClick={() => {
                if (value !== locale) {
                  router.push(pathWithLocale(pathname || "/", value));
                }
                close();
              }}
            >
              {localeName(value)}
            </button>
          ))}
        </div>
        <div className="border-t border-border px-1 py-1">
          <button
            type="button"
            role="menuitem"
            className={itemClassName}
            data-guide="mfa.security"
            onClick={() => {
              close();
              onSecurity();
            }}
          >
            <ShieldCheck aria-hidden />
            {auth("mfaSecurity")}
          </button>
          {opsLabel && onOps ? (
            <button
              type="button"
              role="menuitem"
              className={itemClassName}
              onClick={() => {
                close();
                onOps();
              }}
            >
              <Terminal aria-hidden />
              {opsLabel}
            </button>
          ) : null}
          {federationLabel && onFederation ? (
            <button
              type="button"
              role="menuitem"
              className={itemClassName}
              onClick={() => {
                close();
                onFederation();
              }}
            >
              <Landmark aria-hidden />
              {federationLabel}
            </button>
          ) : null}
        </div>
        <div className="border-t border-border px-1 py-1">
          <button
            type="button"
            role="menuitem"
            className={itemClassName}
            onClick={() => {
              close();
              onSignOut();
            }}
          >
            <LogOut aria-hidden />
            {t("signOut")}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
