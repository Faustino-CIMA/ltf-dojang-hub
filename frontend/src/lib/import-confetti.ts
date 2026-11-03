export type ImportConfettiBurst = {
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

const SIDE_WAVES_MS = [0, 350, 700, 1050, 1450, 1850];
const PARTICLE_TICKS = 70;

export function importConfettiBursts(reducedMotion: boolean): ImportConfettiBurst[] {
  if (reducedMotion) {
    return [];
  }

  const bursts: ImportConfettiBurst[] = [];
  for (const delayMs of SIDE_WAVES_MS) {
    bursts.push(
      {
        delayMs,
        particleCount: 48,
        spread: 100,
        angle: 58,
        originX: 0,
        originY: 0.72,
        startVelocity: 52,
        ticks: PARTICLE_TICKS,
        scalar: 1.15,
      },
      {
        delayMs,
        particleCount: 48,
        spread: 100,
        angle: 122,
        originX: 1,
        originY: 0.72,
        startVelocity: 52,
        ticks: PARTICLE_TICKS,
        scalar: 1.15,
      }
    );
  }

  for (const delayMs of [0, 800, 1600]) {
    bursts.push({
      delayMs,
      particleCount: 90,
      spread: 180,
      angle: 90,
      originX: 0.5,
      originY: 0.35,
      startVelocity: 42,
      ticks: PARTICLE_TICKS,
      scalar: 1.2,
    });
  }

  return bursts;
}

export function importConfettiWindowMs(bursts: ImportConfettiBurst[]): number {
  if (bursts.length === 0) {
    return 0;
  }
  const lastLaunch = Math.max(...bursts.map((burst) => burst.delayMs));
  const longestLife = Math.max(...bursts.map((burst) => burst.ticks)) * 16;
  return lastLaunch + longestLife;
}
