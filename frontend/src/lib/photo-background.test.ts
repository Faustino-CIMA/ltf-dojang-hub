import {
  applyExifOrientation,
  cleanCutoutEdges,
  compositeOntoColor,
  decontaminateEdgeSpill,
  expandCrop,
  fitLongSide,
  licensePhotoFromStored,
  noteFetchProgress,
  parseLicensePhotoColor,
  progressBarPercent,
  progressFromLibraryKey,
  readJpegOrientation,
  readJpegSize,
  removalInputRaster,
  resampleCrop,
  shouldApplyOrientation,
  type PhotoRaster,
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

  it("blends a dark shape onto the card colour without a bright halo or speckles", () => {
    const width = 20;
    const height = 20;
    const hair = { r: 20, g: 16, b: 14 };
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = (y * width + x) * 4;
        const solid = x >= 6 && x <= 13 && y >= 6 && y <= 13;
        const fringe = x >= 5 && x <= 14 && y >= 5 && y <= 14 && !solid;
        data[index] = solid ? hair.r : 255;
        data[index + 1] = solid ? hair.g : fringe ? 40 : 255;
        data[index + 2] = solid ? hair.b : 255;
        data[index + 3] = solid ? 255 : fringe ? 140 : x === 1 && y === 1 ? 5 : 0;
        if (x === 1 && y === 1) {
          data[index] = 255;
          data[index + 1] = 0;
          data[index + 2] = 255;
        }
      }
    }
    const raster = { width, height, data };
    cleanCutoutEdges(raster);
    const coverage = new Uint8Array(width * height);
    for (let index = 0; index < coverage.length; index += 1) {
      coverage[index] = raster.data[index * 4 + 3];
    }
    const card = parseLicensePhotoColor("#D9D9D9");
    compositeOntoColor(raster.data, card);
    const center = (10 * width + 10) * 4;
    expect(Math.abs(raster.data[center] - hair.r)).toBeLessThanOrEqual(8);
    expect(Math.abs(raster.data[center + 1] - hair.g)).toBeLessThanOrEqual(8);
    expect(Math.abs(raster.data[center + 2] - hair.b)).toBeLessThanOrEqual(8);
    const speckle = (1 * width + 1) * 4;
    expect(Array.from(raster.data.slice(speckle, speckle + 4))).toEqual([card.r, card.g, card.b, 255]);
    const hairChannels = [hair.r, hair.g, hair.b];
    const cardChannels = [card.r, card.g, card.b];
    for (let index = 0; index < coverage.length; index += 1) {
      const weight = coverage[index] / 255;
      for (let channel = 0; channel < 3; channel += 1) {
        const actual = raster.data[index * 4 + channel];
        const expected = Math.round(hairChannels[channel] * weight + cardChannels[channel] * (1 - weight));
        expect(Math.abs(actual - expected)).toBeLessThanOrEqual(12);
        expect(actual).toBeLessThanOrEqual(card.r + 2);
      }
    }
  });
});

function circleRaster(width: number, height: number, cx: number, cy: number, radius: number): PhotoRaster {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const inside = (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
      const index = (y * width + x) * 4;
      data[index] = inside ? 255 : 0;
      data[index + 3] = 255;
    }
  }
  return { width, height, data };
}

function redBounds(raster: PhotoRaster) {
  let minX = raster.width;
  let minY = raster.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < raster.height; y += 1) {
    for (let x = 0; x < raster.width; x += 1) {
      if (raster.data[(y * raster.width + x) * 4] > 128) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }
  return {
    width: maxX - minX + 1,
    height: maxY - minY + 1,
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
  };
}

function storeIphonePortrait(upright: PhotoRaster): PhotoRaster {
  const rawWidth = upright.height;
  const rawHeight = upright.width;
  const data = new Uint8ClampedArray(rawWidth * rawHeight * 4);
  for (let y = 0; y < upright.height; y += 1) {
    for (let x = 0; x < upright.width; x += 1) {
      const rawX = y;
      const rawY = upright.width - 1 - x;
      const source = (y * upright.width + x) * 4;
      const dest = (rawY * rawWidth + rawX) * 4;
      data[dest] = upright.data[source];
      data[dest + 1] = upright.data[source + 1];
      data[dest + 2] = upright.data[source + 2];
      data[dest + 3] = upright.data[source + 3];
    }
  }
  return { width: rawWidth, height: rawHeight, data };
}

function stretchTaller(raster: PhotoRaster): PhotoRaster {
  return resampleCrop(
    raster,
    { x: 0, y: 0, width: raster.width, height: raster.height },
    raster.width,
    raster.height * 2,
  );
}

function jpegWithOrientation(orientation: number, width: number, height: number): Uint8Array {
  const tiff = [
    0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00,
    0x01, 0x00,
    0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00,
    orientation & 0xff, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
  ];
  const exif = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, ...tiff];
  const app1Length = exif.length + 2;
  const sofLength = 11;
  return new Uint8Array([
    0xff, 0xd8,
    0xff, 0xe1, (app1Length >> 8) & 0xff, app1Length & 0xff, ...exif,
    0xff, 0xc0, 0x00, sofLength, 0x08,
    (height >> 8) & 0xff, height & 0xff,
    (width >> 8) & 0xff, width & 0xff,
    0x01, 0x01, 0x11, 0x00,
  ]);
}

describe("photo background shape", () => {
  const upright = circleRaster(40, 80, 20, 14, 8);

  it("reads an iPhone orientation tag and the stored size", () => {
    const bytes = jpegWithOrientation(6, 80, 40);
    expect(readJpegOrientation(bytes)).toBe(6);
    expect(readJpegSize(bytes)).toEqual({ width: 80, height: 40 });
    expect(shouldApplyOrientation(80, 40, 80, 40, 6)).toBe(true);
    expect(shouldApplyOrientation(40, 80, 80, 40, 6)).toBe(false);
  });

  it("turns a sideways iPhone file upright without stretching the circle", () => {
    const stored = storeIphonePortrait(upright);
    const restored = applyExifOrientation(stored, 6);
    expect(restored.width).toBe(40);
    expect(restored.height).toBe(80);
    expect(Array.from(restored.data)).toEqual(Array.from(upright.data));
    const bounds = redBounds(restored);
    expect(bounds.width).toBe(bounds.height);
    expect(bounds.cy).toBeLessThan(restored.height * 0.35);
  });

  it("keeps a circle round through crop, a stretched model output, and the print frame", () => {
    const stored = storeIphonePortrait(upright);
    const crop = { x: 0, y: 0, width: 40, height: 80 };
    const input = removalInputRaster(stored, 6, crop, 80);
    const stretched = stretchTaller(input);
    expect(redBounds(stretched).height).toBeGreaterThan(redBounds(stretched).width + 4);

    const printed = licensePhotoFromStored({
      stored,
      orientation: 6,
      crop,
      modelOutput: stretchTaller,
      frameWidth: 40,
      frameHeight: 80,
      longSide: 80,
    });
    const bounds = redBounds(printed);
    expect(printed.width).toBe(40);
    expect(printed.height).toBe(80);
    expect(Math.abs(bounds.width - bounds.height)).toBeLessThanOrEqual(1);
    expect(bounds.cy).toBeLessThan(printed.height * 0.35);
    expect(Math.abs(bounds.cx - printed.width / 2)).toBeLessThanOrEqual(1);
  });
});
