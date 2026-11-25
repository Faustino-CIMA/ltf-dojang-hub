"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowRight, Check, ChevronDown, Route } from "lucide-react";

import { SidePanel } from "@/components/ui/side-panel";
import { Button } from "@/components/ui/button";
import pack from "@/content/help-pack.json";
import { CHAPTER_ROUTES, plainEnough, sectionSummary, sectionVisible, type HelpSection } from "@/lib/help-manual";
import { searchHelp } from "@/lib/help-search";
import { GUIDE_DONE_KEY, parseGuideDone } from "@/lib/guide-run";
import { guideForManual } from "@/lib/guides";

const packs = pack as Record<string, HelpSection[]>;
const POPULAR = ["order-licences", "add-member", "import", "pay-ltf", "roll"];
const MANUAL_ONLY = new Set(["conventions"]);

export function HelpPanel({
  locale,
  desk,
  onClose,
  onStartGuide,
}: {
  locale: string;
  desk: string | null;
  pathname: string;
  onClose: () => void;
  onStartGuide: (id: string) => void;
}) {
  const t = useTranslations("Common");
  const guideCopy = useTranslations("Guide");
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [done, setDone] = useState<string[]>([]);
  const sections = packs[locale] ?? packs.en;
  const readable = useMemo(
    () => sections.filter((section) => section.text && plainEnough(section) && !MANUAL_ONLY.has(section.id)),
    [sections],
  );
  const chips = useMemo(
    () => POPULAR.map((id) => readable.find((section) => section.id === id)).filter((section): section is HelpSection => section != null && sectionVisible(section, desk)),
    [readable, desk],
  );
  const results = useMemo(() => searchHelp(readable, query, desk).slice(0, 6), [readable, query, desk]);
  const picked = readable.find((section) => section.id === pickedId && sectionVisible(section, desk)) ?? null;
  const shown = query.trim() ? results : picked ? [picked] : [];

  useEffect(() => {
    inputRef.current?.focus();
    setDone(parseGuideDone(window.localStorage.getItem(GUIDE_DONE_KEY)));
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
            setPickedId(null);
            setOpenId(null);
          }}
          className="h-[var(--control-height)] w-full rounded-[var(--radius-form)] border border-border bg-[var(--field-background)] px-3 text-sm text-[var(--field-foreground)] outline-none placeholder:text-[var(--field-placeholder)] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        />
      </label>
      {query.trim() || picked ? null : (
        <div className="mt-4">
          <p className="text-sm font-medium text-foreground">{t("helpPrompt")}</p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {chips.map((section) => (
              <li key={section.id}>
                <button
                  type="button"
                  className="inline-flex h-[var(--control-height)] items-center gap-2 rounded-full border border-border bg-surface px-3 text-sm text-foreground"
                  onClick={() => setPickedId(section.id)}
                >
                  <Route aria-hidden className="size-4 text-link" />
                  {section.heading}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {query.trim() && shown.length === 0 ? <p className="mt-3 text-sm text-muted">{t("helpEmpty")}</p> : null}
      <ul className="mt-3 space-y-2">
        {shown.map((section) => {
          const route = CHAPTER_ROUTES[section.chapter];
          const guide = guideForManual(section.id, desk);
          const open = openId === section.id;
          const summary = sectionSummary(section.text);
          return (
            <li key={section.id} className="rounded-[var(--radius-card)] border border-border bg-surface p-3">
              <h3 className="text-sm font-semibold text-foreground">{section.heading}</h3>
              {summary ? <p className="mt-1 text-sm text-muted">{summary}</p> : null}
              {guide && done.includes(guide.id) ? (
                <p className="mt-2 inline-flex items-center gap-1 text-sm text-[var(--badge-success-fg)]">
                  <Check aria-hidden className="size-4" />
                  {guideCopy("guideDone")}
                </p>
              ) : null}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {guide ? (
                  <Button type="button" variant="outline" size="sm" onClick={() => onStartGuide(guide.id)}>
                    <Route aria-hidden />
                    {guideCopy("guideShowMe")}
                  </Button>
                ) : route ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      router.push(`/${locale}${route}`);
                      onClose();
                    }}
                  >
                    <ArrowRight aria-hidden />
                    {t("helpOpenPage")}
                  </Button>
                ) : null}
                <Button type="button" variant="outline" size="sm" aria-expanded={open} onClick={() => setOpenId(open ? null : section.id)}>
                  <ChevronDown aria-hidden />
                  {open ? t("helpLess") : t("helpMore")}
                </Button>
              </div>
              {open ? <p className="mt-3 text-sm text-foreground">{section.text}</p> : null}
            </li>
          );
        })}
      </ul>
    </SidePanel>
  );
}
