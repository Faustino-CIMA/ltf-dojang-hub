import { celebrationBursts } from "@/lib/celebration";

describe("celebration confetti", () => {
  it("stays off when reduced motion is requested", () => {
    expect(celebrationBursts(true)).toEqual([]);
  });

  it("fires one big explosion", () => {
    const bursts = celebrationBursts(false);
    const particles = bursts.reduce((total, burst) => total + burst.particleCount, 0);
    expect(particles).toBeGreaterThan(400);
    expect(bursts.some((burst) => burst.originX < 0.15)).toBe(true);
    expect(bursts.some((burst) => burst.originX > 0.85)).toBe(true);
    expect(Math.max(...bursts.map((burst) => burst.delayMs))).toBeLessThan(400);
  });
});
