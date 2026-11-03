import { celebrationBursts, mfaConfettiColors, SETUP_CELEBRATION_MS, setupCelebrationSteps } from "@/lib/celebration";

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

  it("fires side cannons and then a fall from the top", () => {
    expect(setupCelebrationSteps(true)).toEqual([]);
    const steps = setupCelebrationSteps(false);
    expect(steps[0]).toMatchObject({ originX: 0, originY: 1, angle: 60 });
    expect(steps[1]).toMatchObject({ originX: 1, originY: 1, angle: 120 });
    expect(steps.slice(2).every((step) => step.originY === 0 && step.angle === 270)).toBe(true);
    const last = Math.max(...steps.map((step) => step.delayMs));
    expect(last).toBeGreaterThan(2000);
    expect(last).toBeLessThan(SETUP_CELEBRATION_MS);
    expect(SETUP_CELEBRATION_MS).toBeLessThanOrEqual(3000);
  });

  it("uses the brand colours and a little gold", () => {
    expect(mfaConfettiColors(() => "")).toEqual(["#e30613", "#0099ff", "#ffffff", "#d4af37"]);
    expect(mfaConfettiColors((name) => (name === "--brand-ltf-red" ? "#aa0000" : ""))[0]).toBe("#aa0000");
  });
});
