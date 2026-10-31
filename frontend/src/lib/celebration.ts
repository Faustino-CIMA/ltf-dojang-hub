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

export type SetupCelebrationStep = CelebrationBurst & {
  gravity: number;
  drift: number;
};

/** Side cannons, then a short fall from the top. About three seconds. Reduced motion gets nothing. */
export const SETUP_CELEBRATION_MS = 3000;

export function setupCelebrationSteps(reducedMotion: boolean): SetupCelebrationStep[] {
  if (reducedMotion) {
    return [];
  }
  const cannons: SetupCelebrationStep[] = [
    {
      delayMs: 0,
      particleCount: 80,
      spread: 55,
      angle: 60,
      originX: 0,
      originY: 1,
      startVelocity: 48,
      ticks: 160,
      scalar: 1,
      gravity: 0.85,
      drift: 0,
    },
    {
      delayMs: 140,
      particleCount: 80,
      spread: 55,
      angle: 120,
      originX: 1,
      originY: 1,
      startVelocity: 48,
      ticks: 160,
      scalar: 1,
      gravity: 0.85,
      drift: 0,
    },
  ];
  const fall: SetupCelebrationStep[] = Array.from({ length: 10 }, (_, index) => ({
    delayMs: 520 + index * 200,
    particleCount: 10,
    spread: 120,
    angle: 270,
    originX: 0.12 + (index % 5) * 0.19,
    originY: 0,
    startVelocity: 14,
    ticks: 90,
    scalar: 0.85,
    gravity: 0.45,
    drift: index % 2 === 0 ? 0.35 : -0.35,
  }));
  return [...cannons, ...fall];
}

export const MFA_CONFETTI_FALLBACKS = ["#e30613", "#0099ff", "#ffffff", "#d4af37"];

export function mfaConfettiColors(read: (name: string) => string): string[] {
  const pick = (name: string, fallback: string) => {
    const value = read(name).trim();
    return value.startsWith("#") || value.startsWith("rgb") ? value : fallback;
  };
  return [
    pick("--brand-ltf-red", MFA_CONFETTI_FALLBACKS[0]),
    pick("--brand-ltf-blue", MFA_CONFETTI_FALLBACKS[1]),
    pick("--brand-on-ink", MFA_CONFETTI_FALLBACKS[2]),
    MFA_CONFETTI_FALLBACKS[3],
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
