import { removalDisplayPercent, REMOVAL_SERVER_TYPICAL_MS } from "./removal-progress";

describe("removal progress", () => {
  it("maps download bytes into the download slice and ignores the clock", () => {
    expect(removalDisplayPercent({ phase: "download", downloadPercent: 0, elapsedMs: 0 })).toBe(8);
    expect(removalDisplayPercent({ phase: "download", downloadPercent: 40, elapsedMs: 9_000 })).toBe(23);
    expect(removalDisplayPercent({ phase: "download", downloadPercent: 100, elapsedMs: 0 })).toBe(46);
  });

  it("eases a silent stage and never reaches the next one or 100", () => {
    const start = removalDisplayPercent({ phase: "server", elapsedMs: 0 });
    const mid = removalDisplayPercent({ phase: "server", elapsedMs: REMOVAL_SERVER_TYPICAL_MS });
    const late = removalDisplayPercent({ phase: "server", elapsedMs: REMOVAL_SERVER_TYPICAL_MS * 8 });
    expect(start).toBe(8);
    expect(mid).toBeGreaterThan(start);
    expect(late).toBeGreaterThan(mid);
    expect(late).toBeLessThan(99);
    expect(removalDisplayPercent({ phase: "server", elapsedMs: 1_000_000 })).toBeLessThan(100);
  });

  it("keeps climbing through the server wait instead of stopping near the end", () => {
    const early = removalDisplayPercent({ phase: "server", elapsedMs: 4_000 });
    const middle = removalDisplayPercent({ phase: "server", elapsedMs: 22_000 });
    const later = removalDisplayPercent({ phase: "server", elapsedMs: 50_000 });
    expect(middle).toBeGreaterThan(early);
    expect(later).toBeGreaterThan(middle);
    expect(later).toBeLessThan(99);
  });

  it("is 100 only when the photo is actually ready", () => {
    expect(removalDisplayPercent({ phase: "server", elapsedMs: 0, complete: true })).toBe(100);
    expect(removalDisplayPercent({ phase: "colour", elapsedMs: 60_000 })).toBeLessThan(100);
  });
});
