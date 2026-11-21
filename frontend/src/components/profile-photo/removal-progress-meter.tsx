"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  removalDisplayPercent,
  removalStageHasByteProgress,
  type RemovalPhase,
} from "@/lib/removal-progress";

const TICK_MS = 100;

export function RemovalProgressMeter({
  phase,
  downloadPercent,
  label,
}: {
  phase: RemovalPhase;
  downloadPercent?: number;
  label: string;
}) {
  const startedAt = useRef(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [trackedPhase, setTrackedPhase] = useState(phase);

  if (phase !== trackedPhase) {
    setTrackedPhase(phase);
    setElapsedMs(0);
  }

  useEffect(() => {
    startedAt.current = performance.now();
    const timer = window.setInterval(() => {
      setElapsedMs(performance.now() - startedAt.current);
    }, TICK_MS);
    return () => window.clearInterval(timer);
  }, [phase]);

  const percent = removalDisplayPercent({
    phase,
    downloadPercent,
    elapsedMs: removalStageHasByteProgress(phase) ? 0 : elapsedMs,
  });
  const shimmer = !removalStageHasByteProgress(phase);

  return (
    <div className="space-y-1">
      <p aria-live="polite" className="text-xs text-muted">
        {label}
      </p>
      <div className="flex items-center gap-2">
        <Loader2 aria-hidden className="size-4 shrink-0 animate-spin text-muted motion-reduce:animate-none" />
        <div
          className="relative h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-secondary"
          role="progressbar"
          aria-busy="true"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-valuetext={label}
        >
          <div
            className="h-full rounded-full bg-foreground motion-reduce:transition-none transition-[width] duration-150 ease-out"
            style={{ width: `${percent}%` }}
          />
          {shimmer ? (
            <div className="removal-progress-shimmer pointer-events-none absolute inset-y-0 w-1/3 bg-[linear-gradient(90deg,transparent,color-mix(in_oklab,var(--foreground)_28%,transparent),transparent)]" />
          ) : null}
        </div>
        <span className="w-11 shrink-0 text-right text-xs tabular-nums text-muted">{percent}%</span>
      </div>
    </div>
  );
}
