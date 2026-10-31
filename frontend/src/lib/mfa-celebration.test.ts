import { playMfaCelebration } from "./mfa-celebration";

function mockMotion(reduced: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: reduced && query.includes("prefers-reduced-motion"),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
    onchange: null,
  })) as unknown as typeof window.matchMedia;
}

describe("mfa celebration", () => {
  afterEach(() => {
    document.querySelectorAll("canvas").forEach((node) => node.remove());
  });

  it("adds one full-window canvas and ignores a second call", () => {
    mockMotion(false);
    const stop = playMfaCelebration();
    playMfaCelebration();
    const canvases = document.querySelectorAll("canvas");
    expect(canvases).toHaveLength(1);
    const canvas = canvases[0] as HTMLCanvasElement;
    expect(canvas.style.position).toBe("fixed");
    expect(canvas.style.pointerEvents).toBe("none");
    expect(canvas.style.zIndex).toBe("55");
    stop();
    expect(document.querySelector("canvas")).toBeNull();
  });

  it("skips the canvas when reduced motion is on", () => {
    mockMotion(true);
    playMfaCelebration();
    expect(document.querySelector("canvas")).toBeNull();
  });
});
