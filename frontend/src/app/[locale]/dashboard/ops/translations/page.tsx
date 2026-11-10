"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { OpsLayout } from "@/components/ops/ops-layout";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ActionNotices } from "@/components/ui/list-page-chrome";
import { LoadingCardGrid } from "@/components/ui/loading-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";
import {
  downloadOpsTranslationExport,
  getOpsTranslationMeta,
  getOpsTranslations,
  saveOpsTranslationBatch,
  type TranslationLocale,
  type TranslationPageSummary,
  type TranslationRow,
} from "@/lib/ops-api";

const TRANSLATION_LOCALES = ["en", "fr", "de", "lb"] as const satisfies readonly TranslationLocale[];

const LOCALE_LABEL = {
  en: "englishLabel",
  fr: "frenchLabel",
  de: "germanLabel",
  lb: "luxembourgishLabel",
} as const;

type Drafts = Record<string, Record<TranslationLocale, string>>;

function emptyDraft(row: TranslationRow): Record<TranslationLocale, string> {
  return { en: row.en, fr: row.fr, de: row.de, lb: row.lb };
}

function isOverridden(row: TranslationRow, code: TranslationLocale) {
  if (code === "fr") return row.fr_overridden;
  if (code === "de") return row.de_overridden;
  if (code === "lb") return row.lb_overridden;
  return row.en_overridden;
}

function previewHref(path: string | null, locale: string) {
  if (!path) return null;
  return path.replace("{locale}", locale);
}

function groupRows(rows: TranslationRow[]) {
  const groups: Array<{ id: string; label: string; rows: TranslationRow[] }> = [];
  for (const row of rows) {
    const last = groups[groups.length - 1];
    if (last && last.id === row.section) {
      last.rows.push(row);
    } else {
      groups.push({ id: row.section, label: row.section_label, rows: [row] });
    }
  }
  return groups;
}

function fieldRows(value: string) {
  if (value.includes("\n") || value.length > 90) {
    return 4;
  }
  if (value.length > 48) {
    return 2;
  }
  return 1;
}

export default function OpsTranslationsPage() {
  const t = useTranslations("Ops");
  const locale = useLocale();
  const [pages, setPages] = useState<TranslationPageSummary[]>([]);
  const [namespace, setNamespace] = useState<string>("");
  const [rows, setRows] = useState<TranslationRow[]>([]);
  const [drafts, setDrafts] = useState<Drafts>({});
  const [query, setQuery] = useState("");
  const [missingOnly, setMissingOnly] = useState(false);
  const [readingView, setReadingView] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingPage, setIsLoadingPage] = useState(false);

  const currentPage = pages.find((page) => page.id === namespace) ?? null;
  const screenHref = previewHref(currentPage?.preview_path ?? null, locale);

  const loadMeta = useCallback(async () => {
    const meta = await getOpsTranslationMeta();
    setPages(meta.pages);
    setNamespace((current) => {
      if (current && meta.pages.some((page) => page.id === current)) {
        return current;
      }
      const firstMissing = meta.pages.find((page) => page.missing_translations > 0);
      return firstMissing?.id || meta.pages[0]?.id || "";
    });
  }, []);

  const loadPage = useCallback(
    async (nextNamespace: string) => {
      if (!nextNamespace) return;
      setIsLoadingPage(true);
      setErrorMessage(null);
      try {
        const response = await getOpsTranslations({ namespace: nextNamespace });
        setRows(response.results);
        const nextDrafts: Drafts = {};
        response.results.forEach((row) => {
          nextDrafts[row.key] = emptyDraft(row);
        });
        setDrafts(nextDrafts);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : t("loadError"));
      } finally {
        setIsLoadingPage(false);
      }
    },
    [t],
  );

  useEffect(() => {
    void loadMeta().catch((error) => {
      setErrorMessage(error instanceof Error ? error.message : t("loadError"));
    });
  }, [loadMeta, t]);

  useEffect(() => {
    if (!namespace) return;
    void loadPage(namespace);
  }, [loadPage, namespace]);

  const dirtyCount = useMemo(() => {
    return rows.filter((row) => {
      const draft = drafts[row.key];
      if (!draft) return false;
      return TRANSLATION_LOCALES.some((code) => draft[code] !== row[code]);
    }).length;
  }, [drafts, rows]);

  const visibleRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      const draft = drafts[row.key] ?? emptyDraft(row);
      if (missingOnly && TRANSLATION_LOCALES.every((code) => code === "en" || draft[code].trim())) {
        return false;
      }
      if (!needle) {
        return true;
      }
      return (
        row.key.toLowerCase().includes(needle) ||
        TRANSLATION_LOCALES.some((code) => draft[code].toLowerCase().includes(needle))
      );
    });
  }, [drafts, missingOnly, query, rows]);

  const groups = useMemo(() => groupRows(visibleRows), [visibleRows]);

  const changePage = (next: string) => {
    if (next === namespace) return;
    if (dirtyCount > 0 && !window.confirm(t("translationsUnsavedConfirm"))) {
      return;
    }
    setQuery("");
    setMissingOnly(false);
    setReadingView(false);
    setNamespace(next);
  };

  const updateDraft = (key: string, localeKey: TranslationLocale, value: string) => {
    setDrafts((current) => ({
      ...current,
      [key]: {
        en: current[key]?.en ?? "",
        fr: current[key]?.fr ?? "",
        de: current[key]?.de ?? "",
        lb: current[key]?.lb ?? "",
        [localeKey]: value,
      },
    }));
  };

  const onSavePage = async () => {
    const changes: Array<{ locale: TranslationLocale; key: string; value: string }> = [];
    rows.forEach((row) => {
      const draft = drafts[row.key];
      if (!draft) return;
      TRANSLATION_LOCALES.forEach((code) => {
        if (draft[code] !== row[code]) {
          changes.push({ locale: code, key: row.key, value: draft[code] });
        }
      });
    });
    if (changes.length === 0) {
      return;
    }
    setIsSaving(true);
    setErrorMessage(null);
    try {
      await saveOpsTranslationBatch(namespace, changes);
      setSuccessMessage(t("translationsSavedPage", { count: changes.length }));
      await Promise.all([loadMeta(), loadPage(namespace)]);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("saveError"));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <OpsLayout title={t("translationsTitle")} subtitle={t("translationsSubtitle")} hintSubtitle>
      <ActionNotices
        error={errorMessage}
        success={successMessage}
        onDismiss={() => {
          setErrorMessage(null);
          setSuccessMessage(null);
        }}
      />

      <div className="grid gap-3 xl:grid-cols-[16rem_minmax(0,1fr)]">
        <aside className="app-panel h-fit p-3 xl:sticky xl:top-4">
          <p className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-muted">
            {t("translationsPages")}
          </p>
          <ul className="flex flex-col gap-1">
            {pages.map((page) => {
              const active = page.id === namespace;
              return (
                <li key={page.id}>
                  <button
                    type="button"
                    onClick={() => changePage(page.id)}
                    className={cn(
                      "flex w-full items-start justify-between gap-2 rounded-[var(--radius-control)] px-3 py-2 text-left text-sm",
                      active ? "bg-secondary font-semibold text-foreground" : "text-muted hover:bg-secondary/60",
                    )}
                  >
                    <span>
                      <span className="block">{page.title}</span>
                      <span className="block text-xs font-normal text-muted">
                        {t("translationsStringCount", { count: page.string_count })}
                      </span>
                    </span>
                    {page.missing_translations > 0 ? (
                      <StatusBadge label={String(page.missing_translations)} tone="warning" />
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        <div className="min-w-0">
          <div className="app-panel p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-xl font-semibold text-foreground">{currentPage?.title ?? namespace}</h2>
                <p className="mt-1 max-w-3xl text-sm text-muted">{currentPage?.description}</p>
                <p className="mt-2 text-sm text-muted">
                  {t("translationsStringCount", { count: rows.length })}
                  {currentPage && currentPage.missing_translations > 0
                    ? ` · ${t("translationsMissingCount", { count: currentPage.missing_translations })}`
                    : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {screenHref ? (
                  <Button asChild variant="outline">
                    <a href={screenHref} target="_blank" rel="noreferrer">
                      {t("translationsOpenScreen")}
                    </a>
                  </Button>
                ) : null}
                <Button variant="outline" onClick={() => setReadingView((value) => !value)}>
                  {readingView ? t("translationsEditView") : t("translationsReadingView")}
                </Button>
                {TRANSLATION_LOCALES.map((code) => (
                  <Button key={code} variant="outline" onClick={() => void downloadOpsTranslationExport(code)}>
                    {t("translationsExport", { language: t(LOCALE_LABEL[code]) })}
                  </Button>
                ))}
                <Button variant="primary" onClick={() => void onSavePage()} disabled={isSaving || dirtyCount === 0}>
                  {isSaving ? t("saving") : t("translationsSavePage", { count: dirtyCount })}
                </Button>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-end gap-3">
              <div className="min-w-[12rem] flex-1">
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t("translationsSearchInPage")}
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-muted">
                <Checkbox checked={missingOnly} onCheckedChange={(checked) => setMissingOnly(checked === true)} />
                {t("missingTranslationOnly")}
              </label>
            </div>
          </div>

          {isLoadingPage ? (
            <div className="mt-4">
              <LoadingCardGrid title={t("loading")} description={t("translationsSearchInPage")} />
            </div>
          ) : visibleRows.length === 0 ? (
            <p className="mt-4 text-sm text-muted">{t("translationsEmptyPage")}</p>
          ) : readingView ? (
            <div className="mt-4 grid gap-4 xl:grid-cols-2">
              {TRANSLATION_LOCALES.map((code) => (
                <article key={code} className="app-panel p-3">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">{t(LOCALE_LABEL[code])}</h3>
                  {groups.map((group) => (
                    <section key={`${code}-${group.id}`} className="mt-5">
                      <h4 className="text-sm font-semibold text-foreground">{group.label}</h4>
                      <div className="mt-2 space-y-3 text-sm leading-relaxed text-foreground">
                        {group.rows.map((row) => {
                          const value = drafts[row.key]?.[code] || "";
                          return (
                            <p key={`${code}-copy-${row.key}`} className={value.trim() ? "" : "text-muted"}>
                              {value.trim() ? value : t("translationsMissingValue")}
                            </p>
                          );
                        })}
                      </div>
                    </section>
                  ))}
                </article>
              ))}
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-[var(--radius-card)] border border-border bg-[var(--surface)]">
              <div className="sticky top-0 z-10 hidden min-w-[64rem] grid-cols-[minmax(8rem,11rem)_repeat(4,minmax(10rem,1fr))] border-b border-border bg-[var(--surface)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted xl:grid">
                <span>{t("translationsOnScreen")}</span>
                {TRANSLATION_LOCALES.map((code) => (
                  <span key={code}>{t(LOCALE_LABEL[code])}</span>
                ))}
              </div>
              {groups.map((group) => (
                <section key={group.id} className="min-w-[64rem] border-b border-border last:border-b-0">
                  <h3 className="bg-[var(--surface-secondary)] px-4 py-2 text-sm font-semibold text-foreground">
                    {group.label}
                  </h3>
                  <ul>
                    {group.rows.map((row) => {
                      const draft = drafts[row.key] ?? emptyDraft(row);
                      const dirty = TRANSLATION_LOCALES.some((code) => draft[code] !== row[code]);
                      const overridden = TRANSLATION_LOCALES.some((code) => isOverridden(row, code));
                      return (
                        <li
                          key={row.key}
                          className="grid gap-3 border-t border-border/70 px-3 py-2 xl:grid-cols-[minmax(8rem,11rem)_repeat(4,minmax(10rem,1fr))]"
                        >
                          <div className="min-w-0">
                            <p className="break-all text-sm font-medium text-foreground">{row.local_key}</p>
                            {dirty ? (
                              <p className="mt-1 text-xs font-medium text-link">{t("translationsDirty")}</p>
                            ) : null}
                            {row.placeholders.length > 0 ? (
                              <p className="mt-1 text-xs text-muted">
                                {t("translationsKeepPlaceholder")} {row.placeholders.join(" ")}
                              </p>
                            ) : null}
                            {overridden ? (
                              <p className="mt-1 text-xs text-link">{t("overridden")}</p>
                            ) : null}
                          </div>
                          {TRANSLATION_LOCALES.map((code) => (
                            <label key={code} className="block min-w-0 text-sm md:text-inherit">
                              <span className="mb-1 block text-xs font-medium text-muted xl:hidden">
                                {t(LOCALE_LABEL[code])}
                              </span>
                              <textarea
                                className="w-full resize-y rounded-[var(--radius-form)] border border-[var(--border)] bg-[var(--field-background)] px-3 py-2 text-sm leading-relaxed text-[var(--field-foreground)]"
                                rows={fieldRows(draft[code] || draft.en)}
                                value={draft[code]}
                                aria-label={`${row.local_key} ${t(LOCALE_LABEL[code])}`}
                                onChange={(event) => updateDraft(row.key, code, event.target.value)}
                              />
                            </label>
                          ))}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>
      </div>
    </OpsLayout>
  );
}
