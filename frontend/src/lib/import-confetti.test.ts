import {
  importConfettiBursts,
  importConfettiWindowMs,
} from "@/lib/import-confetti";

describe("import success confetti", () => {
  it("stays off when reduced motion is requested", () => {
    expect(importConfettiBursts(true)).toEqual([]);
    expect(importConfettiWindowMs([])).toBe(0);
  });

  it("fires a wide multi-burst show from both sides for about 2-3 seconds", () => {
    const bursts = importConfettiBursts(false);
    const particles = bursts.reduce((total, burst) => total + burst.particleCount, 0);
    const windowMs = importConfettiWindowMs(bursts);

    expect(particles).toBeGreaterThan(500);
    expect(Math.min(...bursts.map((burst) => burst.spread))).toBeGreaterThanOrEqual(100);
    expect(bursts.some((burst) => burst.originX <= 0.05 && burst.angle < 90)).toBe(true);
    expect(bursts.some((burst) => burst.originX >= 0.95 && burst.angle > 90)).toBe(true);
    expect(bursts.some((burst) => burst.originX === 0.5 && burst.spread >= 160)).toBe(true);
    expect(new Set(bursts.map((burst) => burst.delayMs)).size).toBeGreaterThanOrEqual(5);
    expect(windowMs).toBeGreaterThanOrEqual(2000);
    expect(windowMs).toBeLessThanOrEqual(3500);
  });
});
