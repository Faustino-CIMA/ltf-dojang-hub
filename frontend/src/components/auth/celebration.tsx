"use client";

import { useEffect } from "react";

import { celebrationBursts } from "@/lib/celebration";

export function Celebration({ active }: { active: boolean }) {
  useEffect(() => {
    if (!active || typeof window === "undefined") {
      return;
    }
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
    const bursts = celebrationBursts(reducedMotion);
    if (bursts.length === 0) {
      return;
    }

    let cancelled = false;
    const timers: number[] = [];
    let resetConfetti: (() => void) | null = null;

    void import("canvas-confetti").then(({ default: confetti }) => {
      if (cancelled) {
        return;
      }
      resetConfetti = () => confetti.reset();
      for (const burst of bursts) {
        timers.push(
          window.setTimeout(() => {
            if (cancelled) {
              return;
            }
            void confetti({
              particleCount: burst.particleCount,
              spread: burst.spread,
              angle: burst.angle,
              origin: { x: burst.originX, y: burst.originY },
              startVelocity: burst.startVelocity,
              ticks: burst.ticks,
              scalar: burst.scalar,
              gravity: 0.95,
              disableForReducedMotion: true,
            });
          }, burst.delayMs),
        );
      }
    }).catch(() => undefined);

    return () => {
      cancelled = true;
      for (const timer of timers) {
        window.clearTimeout(timer);
      }
      resetConfetti?.();
    };
  }, [active]);

  return null;
}
