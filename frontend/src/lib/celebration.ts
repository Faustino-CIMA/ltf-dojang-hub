export type CelebrationBurst = {
  delayMs: number;
  particleCount: number;
  spread: number;
  angle: number;
  originX: number;
  originY: number;
  startVelocity: number;
  ticks: number;
  scalar: number;
};

/** A short burst for two-step setup. Reduced motion gets nothing. */
export function setupSuccessBursts(reducedMotion: boolean): CelebrationBurst[] {
  if (reducedMotion) {
    return [];
  }
  return [
    {
      delayMs: 0,
      particleCount: 70,
      spread: 70,
      angle: 90,
      originX: 0.5,
      originY: 0.35,
      startVelocity: 28,
      ticks: 140,
      scalar: 0.85,
    },
  ];
}

/** One short explosion. Reduced motion gets nothing. */
export function celebrationBursts(reducedMotion: boolean): CelebrationBurst[] {
  if (reducedMotion) {
    return [];
  }
  return [
    {
      delayMs: 0,
      particleCount: 180,
      spread: 110,
      angle: 90,
      originX: 0.5,
      originY: 0.62,
      startVelocity: 58,
      ticks: 220,
      scalar: 1.15,
    },
    {
      delayMs: 0,
      particleCount: 90,
      spread: 80,
      angle: 60,
      originX: 0.08,
      originY: 0.75,
      startVelocity: 48,
      ticks: 200,
      scalar: 1,
    },
    {
      delayMs: 0,
      particleCount: 90,
      spread: 80,
      angle: 120,
      originX: 0.92,
      originY: 0.75,
      startVelocity: 48,
      ticks: 200,
      scalar: 1,
    },
    {
      delayMs: 160,
      particleCount: 70,
      spread: 160,
      angle: 90,
      originX: 0.5,
      originY: 0.45,
      startVelocity: 36,
      ticks: 180,
      scalar: 0.95,
    },
  ];
}
