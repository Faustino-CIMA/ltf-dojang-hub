import { mfaConfettiColors, SETUP_CELEBRATION_MS, setupCelebrationSteps } from "@/lib/celebration";

type ConfettiShot = ((options: Record<string, unknown>) => Promise<undefined> | null) & {
  reset: () => void;
};

let activeStop: (() => void) | null = null;

function readThemeColor(name: string): string {
  if (typeof window === "undefined") {
    return "";
  }
  return getComputedStyle(document.documentElement).getPropertyValue(name);
}

/** Full-window celebration. A second call while one is playing does nothing. */
export function playMfaCelebration(): () => void {
  if (typeof window === "undefined") {
    return () => undefined;
  }
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const steps = setupCelebrationSteps(reducedMotion);
  if (steps.length === 0 || activeStop) {
    return activeStop ?? (() => undefined);
  }

  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.position = "fixed";
  canvas.style.inset = "0";
  canvas.style.width = "100vw";
  canvas.style.height = "100vh";
  canvas.style.pointerEvents = "none";
  canvas.style.zIndex = "55";
  document.body.appendChild(canvas);

  let stopped = false;
  const timers: number[] = [];
  let reset: (() => void) | null = null;

  const stop = () => {
    if (stopped) {
      return;
    }
    stopped = true;
    for (const timer of timers) {
      window.clearTimeout(timer);
    }
    reset?.();
    canvas.remove();
    if (activeStop === stop) {
      activeStop = null;
    }
  };
  activeStop = stop;

  const colors = mfaConfettiColors(readThemeColor);
  void import("canvas-confetti")
    .then(({ default: confetti }) => {
      if (stopped) {
        return;
      }
      const fire = (confetti as unknown as { create: (canvas: HTMLCanvasElement, options: { resize: boolean; useWorker: boolean }) => ConfettiShot }).create(
        canvas,
        { resize: true, useWorker: false },
      );
      reset = () => fire.reset();
      for (const step of steps) {
        timers.push(
          window.setTimeout(() => {
            if (stopped) {
              return;
            }
            void fire({
              particleCount: step.particleCount,
              spread: step.spread,
              angle: step.angle,
              origin: { x: step.originX, y: step.originY },
              startVelocity: step.startVelocity,
              ticks: step.ticks,
              scalar: step.scalar,
              gravity: step.gravity,
              drift: step.drift,
              colors,
              disableForReducedMotion: true,
            });
          }, step.delayMs),
        );
      }
      timers.push(window.setTimeout(stop, SETUP_CELEBRATION_MS));
    })
    .catch(() => stop());

  return stop;
}
