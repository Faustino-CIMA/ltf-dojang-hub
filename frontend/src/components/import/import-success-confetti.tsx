"use client";

import { useEffect } from "react";

type ImportSuccessConfettiProps = {
  active: boolean;
};

export function ImportSuccessConfetti({ active }: ImportSuccessConfettiProps) {
  useEffect(() => {
    if (!active || typeof window === "undefined") {
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    let cancelled = false;
    void import("canvas-confetti").then(({ default: confetti }) => {
      if (cancelled) {
        return;
      }
      void confetti({
        particleCount: 90,
        spread: 70,
        startVelocity: 32,
        ticks: 140,
        gravity: 1.05,
        scalar: 0.9,
        origin: { y: 0.65 },
        disableForReducedMotion: true,
      });
    });

    return () => {
      cancelled = true;
    };
  }, [active]);

  return null;
}
