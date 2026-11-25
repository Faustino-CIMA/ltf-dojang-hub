"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft, ArrowRight, BookOpen, List, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { playMfaCelebration } from "@/lib/mfa-celebration";
import {
  advanceOnClick,
  GUIDE_DONE_KEY,
  guideStepHref,
  parseGuideDone,
  sameRoute,
  valueReady,
  withGuideDone,
  type GuideMode,
  type GuideRun,
  type GuideStep,
} from "@/lib/guide-run";
import { guideById } from "@/lib/guides";

type Box = { step: GuideStep; rect: DOMRect; number: number };

function shown(anchor: string): HTMLElement | null {
  const elements = document.querySelectorAll<HTMLElement>(`[data-guide="${anchor}"]`);
  for (const element of elements) {
    if (element.getAttribute("hidden") != null) {
      continue;
    }
    const style = window.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden") {
      continue;
    }
    const rect = element.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      return element;
    }
  }
  return null;
}

function controlDisabled(element: HTMLElement): boolean {
  if (element.getAttribute("aria-disabled") === "true") {
    return true;
  }
  return element instanceof HTMLButtonElement && element.disabled;
}

export function GuideLayer({
  desk,
  pathname,
  run,
  onRunChange,
  onExit,
  onOpenManual,
}: {
  desk: string | null;
  pathname: string;
  run: GuideRun;
  onRunChange: (run: GuideRun) => void;
  onExit: () => void;
  onOpenManual: () => void;
}) {
  const t = useTranslations("Guide");
  const common = useTranslations("Common");
  const router = useRouter();
  const sentHref = useRef<string | null>(null);
  const guide = guideById(run.id);
  const steps = useMemo(() => guide?.steps ?? [], [guide]);
  const currentIndex = Math.max(0, steps.findIndex((step) => step.id === run.stepId));
  const current = steps[currentIndex] ?? steps[0];
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [phone, setPhone] = useState(false);
  const [keyboard, setKeyboard] = useState(0);
  const [confirmExit, setConfirmExit] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [openBubble, setOpenBubble] = useState<string | null>(null);

  const go = useCallback(
    (stepId: string, mode: GuideMode = run.mode) => {
      if (!guide || (run.stepId === stepId && run.mode === mode)) {
        return;
      }
      setProblem(null);
      setWaiting(false);
      onRunChange({ id: guide.id, stepId, mode });
    },
    [guide, onRunChange, run.mode, run.stepId],
  );

  useEffect(() => {
    if (!guide || !current) {
      return;
    }
    if (!desk) {
      return;
    }
    if (!guide.desks.includes(desk)) {
      onExit();
      return;
    }
    if (run.stepId !== current.id) {
      onRunChange({ ...run, stepId: current.id });
    }
  }, [current, desk, guide, onExit, onRunChange, run]);

  useEffect(() => {
    if (!current || sameRoute(current.route, pathname)) {
      sentHref.current = null;
      return;
    }
    const href = guideStepHref(pathname, current.route);
    if (sentHref.current === href) {
      return;
    }
    sentHref.current = href;
    router.push(href);
  }, [current, pathname, router]);

  const measure = useCallback(() => {
    if (!current) {
      return;
    }
    const narrow = window.matchMedia("(max-width: 428px)").matches;
    setPhone((value) => (value === narrow ? value : narrow));
    const viewport = window.visualViewport;
    const inset = viewport ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop) : 0;
    setKeyboard((value) => (value === inset ? value : inset));
    const onPage = steps.filter((step) => sameRoute(step.route, pathname));
    const wanted = run.mode === "map" ? onPage : [current];
    const nextBoxes: Box[] = [];
    for (const step of wanted) {
      if (!sameRoute(step.route, pathname)) {
        continue;
      }
      const element = shown(step.anchor);
      if (!element) {
        continue;
      }
      nextBoxes.push({
        step,
        rect: element.getBoundingClientRect(),
        number: steps.indexOf(step) + 1,
      });
    }
    setBoxes((previous) => {
      const signature = (list: Box[]) => list.map((box) => `${box.step.id}:${Math.round(box.rect.x)}:${Math.round(box.rect.y)}:${Math.round(box.rect.width)}:${Math.round(box.rect.height)}`).join("|");
      return signature(previous) === signature(nextBoxes) ? previous : nextBoxes;
    });
  }, [current, pathname, run.mode, steps]);

  useEffect(() => {
    measure();
    const onMove = () => measure();
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    window.visualViewport?.addEventListener("resize", onMove);
    window.visualViewport?.addEventListener("scroll", onMove);
    const observer = new MutationObserver((records) => {
      const outside = records.some((record) => {
        const node = record.target instanceof Element ? record.target : record.target.parentElement;
        return !node?.closest("[data-guide-layer]");
      });
      if (outside) {
        onMove();
      }
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-state", "aria-expanded", "hidden", "disabled"],
    });
    return () => {
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
      window.visualViewport?.removeEventListener("resize", onMove);
      window.visualViewport?.removeEventListener("scroll", onMove);
      observer.disconnect();
    };
  }, [measure]);

  useEffect(() => {
    if (!current) {
      return;
    }
    const element = shown(current.anchor);
    if (!element) {
      return;
    }
    const previous = element.style.scrollMargin;
    element.style.scrollMargin = phone ? "12px 12px 240px" : "96px";
    const rect = element.getBoundingClientRect();
    const barTop = window.innerHeight - keyboard - (phone ? 260 : 80);
    if (rect.bottom > barTop || rect.top < 8) {
      element.scrollIntoView({ block: "center", inline: "nearest" });
    }
    return () => {
      element.style.scrollMargin = previous;
    };
  }, [boxes, current, keyboard, phone]);

  useEffect(() => {
    if (!current || current.advance !== "click") {
      return;
    }
    const onClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-guide]") : null;
      if (!target) {
        return;
      }
      const decision = advanceOnClick(steps, current.id, target.getAttribute("data-guide") ?? "", controlDisabled(target));
      if (!decision) {
        return;
      }
      if (decision.wait) {
        setWaiting(true);
        setProblem(null);
        return;
      }
      go(decision.stepId);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [current, go, steps]);

  useEffect(() => {
    if (!current || current.advance !== "dialog") {
      return;
    }
    const check = () => {
      const element = document.querySelector<HTMLElement>(`[data-guide="${current.anchor}"]`);
      const open = element?.getAttribute("aria-expanded") === "true" || element?.getAttribute("data-state") === "open";
      if (!open) {
        return;
      }
      const next = steps[currentIndex + 1];
      if (next) {
        go(next.id);
      }
    };
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.body, { attributes: true, subtree: true, attributeFilter: ["aria-expanded", "data-state"] });
    return () => observer.disconnect();
  }, [current, currentIndex, go, steps]);

  useEffect(() => {
    if (!current || current.advance !== "value") {
      return;
    }
    const finish = (event: Event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) {
        return;
      }
      const onControl = target.closest(`[data-guide="${current.anchor}"]`);
      const option = target.closest("[role='option']");
      const open = document.querySelector(`[data-guide="${current.anchor}"]`)?.getAttribute("data-state") === "open";
      const next = steps[currentIndex + 1];
      if (!next) {
        return;
      }
      if (option && open) {
        go(next.id);
        return;
      }
      if (event.type === "focusout" && onControl) {
        const input = onControl instanceof HTMLInputElement ? onControl : onControl.querySelector("input");
        const raw = input?.value ?? onControl.textContent ?? "";
        if (valueReady(raw, current.shape)) {
          go(next.id);
        }
      }
    };
    document.addEventListener("focusout", finish, true);
    document.addEventListener("click", finish, true);
    return () => {
      document.removeEventListener("focusout", finish, true);
      document.removeEventListener("click", finish, true);
    };
  }, [current, currentIndex, go, steps]);

  useEffect(() => {
    if (!waiting || !current) {
      return;
    }
    const next = steps[currentIndex + 1];
    if (!next) {
      return;
    }
    const timer = window.setInterval(() => {
      if (document.querySelector(`[data-guide="${next.anchor}"]`)) {
        go(next.id);
        return;
      }
      const error = document.querySelector(".banner-danger");
      const text = error?.textContent?.trim();
      if (text) {
        setWaiting(false);
        setProblem(text);
        return;
      }
      const control = shown(current.anchor);
      if (control && controlDisabled(control)) {
        setProblem(null);
      }
    }, 200);
    return () => window.clearInterval(timer);
  }, [current, currentIndex, go, steps, waiting]);

  useEffect(() => {
    if (!guide || !current || current.advance !== "success") {
      return;
    }
    if (!document.querySelector(`[data-guide="${current.anchor}"]`)) {
      return;
    }
    const done = parseGuideDone(window.localStorage.getItem(GUIDE_DONE_KEY));
    if (done.includes(guide.id)) {
      return;
    }
    window.localStorage.setItem(GUIDE_DONE_KEY, JSON.stringify(withGuideDone(done, guide.id)));
    playMfaCelebration();
  }, [current, guide]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      const target = event.target instanceof HTMLElement ? event.target : null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable) {
        return;
      }
      event.preventDefault();
      if (currentIndex === 0 && !confirmExit) {
        onExit();
        return;
      }
      if (confirmExit) {
        onExit();
        return;
      }
      setConfirmExit(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmExit, currentIndex, onExit]);

  const bubbleStep = useMemo(() => {
    if (!current) {
      return null;
    }
    if (run.mode === "walk") {
      return current;
    }
    return steps.find((step) => step.id === (openBubble ?? current.id)) ?? current;
  }, [current, openBubble, run.mode, steps]);

  if (!guide || !current || !bubbleStep || typeof document === "undefined") {
    return null;
  }

  const title = (key: string) => t(key.slice(key.indexOf(".") + 1));
  const stepName = t("guideStepName", { current: currentIndex + 1, total: steps.length, title: title(guide.titleKey) });
  const onPage = sameRoute(current.route, pathname);
  const activeBox = boxes.find((box) => box.step.id === bubbleStep.id) ?? boxes[0];
  const bubbleStyle = bubblePosition(activeBox?.rect, phone, keyboard);

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[60]" data-guide-layer>
      {[...boxes].sort((left, right) => Number(right.step.id === bubbleStep.id) - Number(left.step.id === bubbleStep.id)).map((box) => (
        <div key={box.step.id} className="pointer-events-none" aria-hidden={box.step.id !== bubbleStep.id}>
          <div
            className={`pointer-events-none fixed border-[2.5px] border-link ${
              box.step.id === bubbleStep.id
                ? "shadow-[0_0_0_4px_transparent,0_0_0_9999px_color-mix(in_srgb,var(--scrim)_50%,transparent)] dark:shadow-[0_0_0_4px_transparent,0_0_0_9999px_color-mix(in_srgb,var(--scrim)_62%,transparent)]"
                : "z-[1]"
            }`}
            style={{
              left: box.rect.left - 4,
              top: box.rect.top - 4,
              width: box.rect.width + 8,
              height: box.rect.height + 8,
              borderRadius: 6,
            }}
          >
            <span className="pointer-events-none absolute -left-2 -top-2 inline-flex size-6 items-center justify-center rounded-full border-2 border-[var(--overlay)] bg-link text-xs font-semibold text-[var(--scrim-foreground)] motion-safe:animate-pulse">
              {box.number}
            </span>
          </div>
          {run.mode === "map" ? (
            <button
              type="button"
              className="pointer-events-auto fixed size-4"
              style={{ left: box.rect.left - 20, top: box.rect.top - 20 }}
              aria-label={String(box.number)}
              onClick={() => setOpenBubble(box.step.id)}
            />
          ) : null}
        </div>
      ))}
      <aside
        className="pointer-events-auto fixed z-[61] w-[min(22rem,calc(100vw-1rem))] rounded-[var(--radius-card)] border border-border bg-surface p-3 text-foreground shadow-[var(--shadow-card)]"
        style={bubbleStyle}
        aria-label={stepName}
      >
        <p className="sr-only" aria-live="polite">
          {stepName}. {title(bubbleStep.titleKey)}
        </p>
        <p className="text-xs font-medium text-link">{stepName}</p>
        <h2 className="mt-1 text-sm font-semibold text-foreground">{title(bubbleStep.titleKey)}</h2>
        <p className="mt-1 text-sm text-muted">{title(bubbleStep.bodyKey)}</p>
        {!onPage ? <p className="mt-2 text-sm text-muted">{t("guideElsewhere")}</p> : null}
        {onPage && !boxes.some((box) => box.step.id === current.id) && current.advance === "click" ? (
          <p className="mt-2 text-sm text-muted">{t("guideInMenu")}</p>
        ) : null}
        {waiting ? <p className="mt-2 text-sm text-muted">{shown(current.anchor)?.textContent}</p> : null}
        {problem ? <p className="banner-danger mt-2 rounded-[var(--radius-form)] border px-3 py-2 text-sm">{problem}</p> : null}
        <div className="mt-3 flex flex-wrap gap-2">
          {!onPage ? (
            <Button type="button" variant="outline" size="sm" onClick={() => router.push(guideStepHref(pathname, current.route))}>
              <ArrowRight aria-hidden />
              {common("helpOpenPage")}
            </Button>
          ) : null}
          <Button type="button" variant="outline" size="sm" onClick={onOpenManual}>
            <BookOpen aria-hidden />
            {t("guideManual")}
          </Button>
          {current.advance === "manual" ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                const next = steps[currentIndex + 1];
                if (next) {
                  go(next.id);
                }
              }}
            >
              <ArrowRight aria-hidden />
              {t("guideNext")}
            </Button>
          ) : null}
        </div>
      </aside>
      <div className="pointer-events-auto fixed inset-x-3 z-[61] mx-auto flex max-w-3xl flex-wrap items-center gap-2 rounded-[var(--radius-card)] border border-border bg-surface px-3 py-2 shadow-[var(--shadow-card)]" style={{ bottom: keyboard + 12 }}>
        {confirmExit ? <p className="text-sm text-foreground">{t("guideExitAsk")}</p> : null}
        <Button type="button" variant="outline" size="sm" disabled={currentIndex === 0} onClick={() => go(steps[currentIndex - 1].id)}>
          <ArrowLeft aria-hidden />
          {t("guideBack")}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => go(current.id, run.mode === "walk" ? "map" : "walk")}
        >
          <List aria-hidden />
          {run.mode === "walk" ? t("guideShowAll") : t("guideShowOne")}
        </Button>
        {confirmExit ? (
          <Button type="button" variant="outline" size="sm" onClick={() => setConfirmExit(false)}>
            <ArrowLeft aria-hidden />
            {t("guideStay")}
          </Button>
        ) : null}
        <Button type="button" variant="outline" size="sm" onClick={() => (currentIndex === 0 || confirmExit ? onExit() : setConfirmExit(true))}>
          <X aria-hidden />
          {t("guideExit")}
        </Button>
      </div>
    </div>,
    document.body,
  );
}

function bubblePosition(rect: DOMRect | undefined, phone: boolean, keyboard: number): { left: number; top?: number; bottom?: number } {
  if (phone || !rect) {
    return { left: 8, bottom: keyboard + 72 };
  }
  const width = 352;
  const gap = 12;
  if (window.innerWidth - rect.right > width + gap) {
    return { left: rect.right + gap, top: Math.max(8, rect.top) };
  }
  if (rect.left > width + gap) {
    return { left: Math.max(8, rect.left - width - gap), top: Math.max(8, rect.top) };
  }
  return { left: 8, top: Math.min(window.innerHeight - 220, rect.bottom + gap) };
}
