"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";

import { SidePanel } from "@/components/ui/side-panel";
import { Button } from "@/components/ui/button";
import pack from "@/content/help-pack.json";
import { CHAPTER_ROUTES, chapterForPath, sectionVisible, type HelpSection } from "@/lib/help-manual";
import { searchHelp } from "@/lib/help-search";

const packs = pack as Record<string, HelpSection[]>;

export function HelpPanel({
  locale,
  desk,
  pathname,
  onClose,
}: {
  locale: string;
  desk: string | null;
  pathname: string;
  onClose: () => void;
}) {
  const t = useTranslations("Common");
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const sections = packs[locale] ?? packs.en;
  const chapter = chapterForPath(pathname);
  const onPage = useMemo(
    () => sections.filter((section) => section.chapter === chapter && sectionVisible(section, desk)),
    [sections, chapter, desk],
  );
  const results = useMemo(() => searchHelp(sections, query, desk).slice(0, 8), [sections, query, desk]);
  const shown = query.trim() ? results : onPage;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <SidePanel open title={t("helpTitle")} closeLabel={t("modalClose")} onClose={onClose}>
      <label className="block space-y-2" htmlFor="help-search">
        <span className="block text-sm font-medium text-foreground">{t("helpSearchLabel")}</span>
        <input
          id="help-search"
          ref={inputRef}
          type="text"
          value={query}
          placeholder={t("helpSearchPlaceholder")}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpenId(null);
          }}
          className="h-[var(--control-height)] w-full rounded-[var(--radius-form)] border border-border bg-[var(--field-background)] px-3 text-sm text-[var(--field-foreground)] outline-none placeholder:text-[var(--field-placeholder)] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        />
      </label>
      {query.trim() ? null : <p className="mt-4 text-sm font-medium text-foreground">{t("helpOnThisPage")}</p>}
      {query.trim() && shown.length === 0 ? <p className="mt-3 text-sm text-muted">{t("helpEmpty")}</p> : null}
      <ul className="mt-3 space-y-2">
        {shown.map((section) => {
          const route = CHAPTER_ROUTES[section.chapter];
          const open = openId === section.id;
          return (
            <li key={section.id} className="rounded-[var(--radius-form)] border border-border p-3">
              <button
                type="button"
                className="w-full text-left text-sm font-medium text-foreground"
                aria-expanded={open}
                onClick={() => setOpenId(open ? null : section.id)}
              >
                {section.heading}
              </button>
              {open && section.text ? <p className="mt-2 text-sm text-muted">{section.text}</p> : null}
              {open && route ? (
                <Button
                  type="button"
                  variant="outline"
                  className="mt-3"
                  onClick={() => {
                    router.push(`/${locale}${route}`);
                    onClose();
                  }}
                >
                  <ArrowRight aria-hidden />
                  {t("helpOpenPage")}
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </SidePanel>
  );
}
