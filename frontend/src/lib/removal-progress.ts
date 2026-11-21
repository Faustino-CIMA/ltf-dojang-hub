import type { PhotoBackgroundProgress } from "@/lib/photo-background";

/**
 * How far the bar may move during one stage.
 *
 * Download is the only stage with a real byte count. The others have no
 * signal from the model or from the removal worker, so the bar eases toward
 * the end of the slice and never arrives there. 100 is reserved for the
 * moment the photo is actually ready.
 *
 * The server slice is paced for 22 seconds. That is the CPU cutout time
 * measured on the removal worker (about 22s for a drawn portrait). The phone
 * stages are paced, not measured: the library sends one event per stage.
 */
export const REMOVAL_SERVER_TYPICAL_MS = 22_000;

export const REMOVAL_TYPICAL_MS = {
  prepare: 800,
  person: 10_000,
  edges: 1_500,
  colour: 800,
  server: REMOVAL_SERVER_TYPICAL_MS,
} as const;

const BAR_CAP = 99;

const STAGE_SPAN = {
  prepare: [0, 8],
  download: [8, 46],
  person: [46, 84],
  edges: [84, 93],
  colour: [93, BAR_CAP],
  server: [8, BAR_CAP],
} as const;

export type RemovalPhase = PhotoBackgroundProgress["phase"];

function clampPercent(value: number): number {
  return Math.max(0, Math.min(BAR_CAP, Math.round(value)));
}

/** Approach the end of the slice. The value keeps rising and never lands on it. */
export function easedStagePercent(elapsedMs: number, typicalMs: number, start: number, end: number): number {
  const span = Math.max(0, end - start);
  const typical = Math.max(1, typicalMs);
  const fraction = 1 - Math.exp(-Math.max(0, elapsedMs) / typical);
  const heldBack = span <= 1 ? 0 : 1 - 1 / span;
  return clampPercent(start + span * fraction * heldBack);
}

export function removalDisplayPercent(input: {
  phase: RemovalPhase;
  downloadPercent?: number;
  elapsedMs: number;
  complete?: boolean;
}): number {
  if (input.complete) {
    return 100;
  }
  const [start, end] = STAGE_SPAN[input.phase];
  if (input.phase === "download") {
    const ratio = Math.max(0, Math.min(100, input.downloadPercent ?? 0)) / 100;
    return clampPercent(start + (end - start) * ratio);
  }
  return easedStagePercent(input.elapsedMs, REMOVAL_TYPICAL_MS[input.phase], start, end);
}

export function removalStageHasByteProgress(phase: RemovalPhase): boolean {
  return phase === "download";
}
