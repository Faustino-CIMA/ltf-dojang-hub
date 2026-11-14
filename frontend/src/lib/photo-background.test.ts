import {
  compositeOntoColor,
  decontaminateEdgeSpill,
  expandCrop,
  fitLongSide,
  noteFetchProgress,
  parseLicensePhotoColor,
  progressBarPercent,
  progressFromLibraryKey,
} from "./photo-background";

describe("photo background maths", () => {
  it("expands the crop by the margin and stays inside the picture", () => {
    expect(expandCrop({ x: 100, y: 50, width: 200, height: 400 }, 1000, 800)).toEqual({
      x: 84,
      y: 18,
      width: 232,
      height: 464,
    });
    expect(expandCrop({ x: 0, y: 0, width: 100, height: 100 }, 100, 100)).toEqual({
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    });
  });

  it("scales the long side to 1024 and keeps the portrait shape", () => {
    expect(fitLongSide(945, 1181)).toEqual({ width: 819, height: 1024 });
  });

  it("sums download chunks and holds the later stages", () => {
    const downloads = new Map<string, { current: number; total: number }>();
    expect(noteFetchProgress(downloads, "fetch:/models/isnet_fp16", 40, 100)).toBe(40);
    expect(noteFetchProgress(downloads, "fetch:/onnxruntime-web/ort.wasm", 10, 10)).toBe(45);
    const person = progressFromLibraryKey("compute:inference", 1, 4, downloads);
    expect(person).toEqual({ phase: "person" });
    expect(progressBarPercent({ phase: "download", percent: 100 })).toBe(70);
    expect(progressBarPercent(person)).toBe(82);
  });

  it("unmixes the old background and composites onto the card colour", () => {
    const pixels = new Uint8ClampedArray([
      10, 20, 30, 0,
      100, 150, 200, 128,
      9, 9, 9, 255,
    ]);
    decontaminateEdgeSpill(pixels);
    const coverage = 128 / 255;
    const unmixed = (channel: number, background: number) =>
      Math.max(0, Math.min(255, Math.round((channel - (1 - coverage) * background) / coverage)));
    expect(pixels[4]).toBe(unmixed(100, 10));
    expect(pixels[5]).toBe(unmixed(150, 20));
    expect(pixels[6]).toBe(unmixed(200, 30));
    expect(pixels[7]).toBe(128);
    expect(pixels[8]).toBe(9);
    compositeOntoColor(pixels, parseLicensePhotoColor("#D9D9D9"));
    expect(Array.from(pixels.slice(0, 4))).toEqual([217, 217, 217, 255]);
    expect(pixels[7]).toBe(255);
    expect(pixels[11]).toBe(255);
    expect(pixels[8]).toBe(9);
  });
});
