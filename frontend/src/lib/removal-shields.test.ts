import { canvasReadbackIsStable } from "./removal-shields";

describe("removal shields probe", () => {
  it("accepts a canvas that returns the colour it was given", () => {
    expect(canvasReadbackIsStable()).toBe(true);
  });

  it("rejects a canvas that changes the colour on readback", () => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = (() => ({
      fillStyle: "",
      fillRect: () => undefined,
      getImageData: () => ({ data: new Uint8ClampedArray([1, 2, 3, 255]) }),
    })) as unknown as typeof HTMLCanvasElement.prototype.getContext;
    expect(canvasReadbackIsStable()).toBe(false);
    HTMLCanvasElement.prototype.getContext = original;
  });
});