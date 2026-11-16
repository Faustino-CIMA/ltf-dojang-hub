import { laplacianVariance, luminancePlane } from "./face-check";

import {
  applyExifOrientation,
  applyMaskOnce,
  cleanCutoutEdges,
  compositeMaskOntoOriginal,
  compositeCutoutForCard,
  compositeOntoColor,
  copyCrop,
  decontaminateEdgeSpill,
  expandCrop,
  fitLongSide,
  licensePhotoFromStored,
  noteFetchProgress,
  parseLicensePhotoColor,
  progressBarPercent,
  progressFromLibraryKey,
  rasterForPrintFrame,
  readJpegOrientation,
  readJpegSize,
  removalInputRaster,
  runSelectedMask,
  removalLibraryConfig,
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

  it("lays a soft shadow under the person and keeps the card grey around it", () => {
    const width = 24;
    const height = 24;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 4; y <= 10; y += 1) {
      for (let x = 6; x <= 14; x += 1) {
        const index = (y * width + x) * 4;
        data[index] = 250;
        data[index + 1] = 250;
        data[index + 2] = 250;
        data[index + 3] = 255;
      }
    }
    compositeCutoutForCard(data, width, height, parseLicensePhotoColor("#D9D9D9"));
    const subject = (7 * width + 10) * 4;
    expect(data[subject]).toBeGreaterThan(230);
    const below = (16 * width + 10) * 4;
    expect(data[below]).toBeLessThan(217);
    expect(data[0]).toBe(217);
    expect(data[1]).toBe(217);
    expect(data[2]).toBe(217);
    expect(data[3]).toBe(255);
  });

  it("scales the long side to 1024 and keeps the portrait shape", () => {
    expect(fitLongSide(945, 1181)).toEqual({ width: 819, height: 1024 });
  });

  it("uses the portrait model unless the page asks for the usual one", async () => {
    const standard = jest.fn(async () => "isnet");
    const portrait = jest.fn(async () => "modnet");
    await expect(runSelectedMask({ mask: "modnet", portrait, standard })).resolves.toBe("modnet");
    expect(standard).not.toHaveBeenCalled();
    await expect(runSelectedMask({ mask: "isnet", portrait, standard })).resolves.toBe("isnet");
    expect(portrait).toHaveBeenCalledTimes(1);
  });

  it("falls back to the usual model when the portrait model fails", async () => {
    const standard = jest.fn(async () => "isnet");
    const portrait = jest.fn(async () => {
      throw new Error("missing");
    });
    const onFallback = jest.fn();
    await expect(runSelectedMask({ mask: "modnet", portrait, standard, onFallback })).resolves.toBe("isnet");
    expect(onFallback).toHaveBeenCalledTimes(1);
    expect(standard).toHaveBeenCalledTimes(1);
  });

  it("does not reuse a failed removal download on the next try", async () => {
    const cache = new Map<string, Promise<unknown>>();
    const loads: number[] = [];
    const memoized = (config: { attempt: number; progress?: () => void }) => {
      const key = JSON.stringify(config);
      const cached = cache.get(key);
      if (cached) {
        return cached;
      }
      const promise = Promise.reject(new Error("network"));
      cache.set(key, promise);
      loads.push(config.attempt);
      return promise;
    };
    const first = { ...removalLibraryConfig("https://app.example", 1), progress: () => undefined };
    const same = { ...removalLibraryConfig("https://app.example", 1), progress: () => undefined };
    const retry = { ...removalLibraryConfig("https://app.example", 2), progress: () => undefined };
    await expect(memoized(first)).rejects.toThrow("network");
    await expect(memoized(same)).rejects.toThrow("network");
    await expect(memoized(retry)).rejects.toThrow("network");
    expect(loads).toEqual([1, 2]);
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

  it("keeps a drawn sharp pattern when only the mask is scaled", () => {
    const width = 40;
    const height = 60;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = (y * width + x) * 4;
        const value = x % 2 === 0 ? 16 : 230;
        data[index] = value;
        data[index + 1] = value;
        data[index + 2] = value;
        data[index + 3] = 255;
      }
    }
    const before = laplacianVariance(luminancePlane(data, width, height), width, height);
    const maskWidth = 20;
    const maskHeight = 30;
    const mask = new Uint8ClampedArray(maskWidth * maskHeight * 4);
    for (let index = 0; index < maskWidth * maskHeight; index += 1) {
      mask[index * 4] = 128;
      mask[index * 4 + 1] = 128;
      mask[index * 4 + 2] = 128;
      mask[index * 4 + 3] = 255;
    }
    const result = compositeMaskOntoOriginal(
      { width, height, data },
      { width: maskWidth, height: maskHeight, data: mask },
    );
    const after = laplacianVariance(luminancePlane(result.data, result.width, result.height), result.width, result.height);
    expect(after).toBeGreaterThanOrEqual(before * 0.9);
  });

  it("applies the mask without changing the face colour", () => {
    const width = 8;
    const height = 8;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let index = 0; index < width * height; index += 1) {
      data[index * 4] = 20 + (index % 5);
      data[index * 4 + 1] = 30 + (index % 7);
      data[index * 4 + 2] = 40;
      data[index * 4 + 3] = 255;
    }
    const mask = new Uint8ClampedArray(4 * 4 * 4);
    for (let index = 0; index < 16; index += 1) {
      mask[index * 4] = 0;
      mask[index * 4 + 1] = 255;
      mask[index * 4 + 2] = 0;
      mask[index * 4 + 3] = 255;
    }
    const result = applyMaskOnce({ width, height, data }, { width: 4, height: 4, data: mask });
    for (let index = 0; index < width * height; index += 1) {
      expect(result.data[index * 4]).toBe(data[index * 4]);
      expect(result.data[index * 4 + 1]).toBe(data[index * 4 + 1]);
      expect(result.data[index * 4 + 2]).toBe(data[index * 4 + 2]);
    }
    expect(result.data[3]).toBe(255);
  });

  it("copies a crop exactly and resizes only for the print frame", () => {
    const width = 6;
    const height = 8;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let index = 0; index < width * height; index += 1) {
      data[index * 4] = index;
      data[index * 4 + 1] = 10;
      data[index * 4 + 2] = 20;
      data[index * 4 + 3] = 255;
    }
    const copied = copyCrop({ width, height, data }, { x: 1, y: 2, width: 4, height: 4 });
    expect(copied.width).toBe(4);
    expect(copied.height).toBe(4);
    const sourceIndex = (2 * width + 1) * 4;
    expect(copied.data[0]).toBe(data[sourceIndex]);
    expect(copied.data[1]).toBe(data[sourceIndex + 1]);
    const printed = rasterForPrintFrame(copied, { x: 0, y: 0, width: 4, height: 4 }, 2, 3);
    expect(printed.width).toBe(2);
    expect(printed.height).toBe(3);
  });

  it("removes a background island beside the subject", () => {
    const width = 24;
    const height = 16;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = (y * width + x) * 4;
        const subject = x >= 2 && x <= 9 && y >= 4 && y <= 11;
        const island = x >= 16 && x <= 20 && y >= 4 && y <= 8;
        data[index] = island ? 255 : subject ? 20 : 240;
        data[index + 1] = island ? 40 : subject ? 16 : 240;
        data[index + 2] = island ? 180 : subject ? 14 : 240;
        data[index + 3] = subject || island ? 255 : 0;
      }
    }
    const raster = { width, height, data };
    cleanCutoutEdges(raster);
    compositeOntoColor(raster.data, parseLicensePhotoColor("#D9D9D9"));
    const island = (6 * width + 18) * 4;
    expect(Array.from(raster.data.slice(island, island + 3))).toEqual([217, 217, 217]);
    const subject = (7 * width + 5) * 4;
    expect(raster.data[subject]).toBeLessThan(40);
  });

  it("gives a stair-stepped diagonal a slope along the real edge", () => {
    const width = 48;
    const height = 48;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = (y * width + x) * 4;
        const subject = x < y;
        data[index] = subject ? 24 : 236;
        data[index + 1] = subject ? 20 : 236;
        data[index + 2] = subject ? 18 : 236;
        data[index + 3] = Math.floor(x / 4) < Math.floor(y / 4) ? 255 : 0;
      }
    }
    cleanCutoutEdges({ width, height, data });
    const crossing: number[] = [];
    for (let y = 16; y <= 32; y += 4) {
      for (let dx = -3; dx <= 3; dx += 1) {
        crossing.push(data[(y * width + (y + dx)) * 4 + 3]);
      }
    }
    expect(new Set(crossing).size).toBeGreaterThanOrEqual(4);
    expect(crossing.some((value) => value > 30 && value < 230)).toBe(true);
    expect(data[(22 * width + 8) * 4 + 3]).toBeGreaterThan(200);
    expect(data[(22 * width + 36) * 4 + 3]).toBeLessThan(20);
    expect(data[(22 * width + 20) * 4 + 3]).toBeGreaterThan(80);
  });

  it("keeps a one-pixel strand the coarse mask still touches", () => {
    const width = 32;
    const height = 28;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = (y * width + x) * 4;
        const body = y >= 12 && x >= 4 && x <= 26;
        const strand = (x === 8 || x === 14 || x === 20) && y >= 10 && y <= 11;
        const on = body || strand;
        data[index] = on ? 22 : 232;
        data[index + 1] = on ? 18 : 232;
        data[index + 2] = on ? 16 : 232;
        data[index + 3] = body ? 255 : strand ? 220 : 0;
      }
    }
    cleanCutoutEdges({ width, height, data });
    expect(data[(11 * width + 8) * 4 + 3]).toBeGreaterThan(140);
    expect(data[(11 * width + 10) * 4 + 3]).toBeLessThan(40);
    expect(data[(11 * width + 14) * 4 + 3]).toBeGreaterThan(140);
    expect(data[(11 * width + 20) * 4 + 3]).toBeGreaterThan(140);
  });

  it("drops a coloured block that touches a head-shaped blob", () => {
    const width = 48;
    const height = 56;
    const data = new Uint8ClampedArray(width * height * 4);
    const head = (x: number, y: number) => ((x - 24) / 12) ** 2 + ((y - 30) / 16) ** 2 <= 1;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = (y * width + x) * 4;
        const poster = x <= 20 && y <= 16;
        const strand = x === 36 && y >= 18 && y <= 30;
        const onHead = head(x, y);
        const on = onHead || poster || strand;
        data[index] = poster ? 240 : on ? 24 : 236;
        data[index + 1] = poster ? 30 : on ? 18 : 236;
        data[index + 2] = poster ? 180 : on ? 16 : 236;
        data[index + 3] = on ? 255 : 0;
      }
    }
    cleanCutoutEdges({ width, height, data });
    compositeOntoColor(data, parseLicensePhotoColor("#D9D9D9"));
    const poster = (4 * width + 4) * 4;
    expect(Array.from(data.slice(poster, poster + 3))).toEqual([217, 217, 217]);
    const crown = (20 * width + 24) * 4;
    expect(data[crown]).toBeLessThan(40);
    const hair = (22 * width + 36) * 4;
    expect(data[hair]).toBeLessThan(80);
  });

  it("fills a bright highlight inside a face and leaves a gap that opens to the border", () => {
    const width = 40;
    const height = 40;
    const data = new Uint8ClampedArray(width * height * 4);
    const face = (x: number, y: number) => (x - 20) ** 2 + (y - 18) ** 2 <= 12 ** 2;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = (y * width + x) * 4;
        const highlight = (x - 20) ** 2 + (y - 14) ** 2 <= 2 ** 2;
        const onFace = face(x, y) && !highlight;
        const gap = x >= 30 && x <= 34 && y >= 28;
        data[index] = highlight ? 255 : onFace ? 210 : 40;
        data[index + 1] = highlight ? 250 : onFace ? 170 : 40;
        data[index + 2] = highlight ? 240 : onFace ? 150 : 40;
        data[index + 3] = onFace ? 255 : 0;
        if (gap) {
          data[index + 3] = 0;
        }
      }
    }
    cleanCutoutEdges({ width, height, data });
    const highlight = (14 * width + 20) * 4;
    expect(data[highlight + 3]).toBeGreaterThan(200);
    const opening = (36 * width + 32) * 4;
    expect(data[opening + 3]).toBeLessThan(20);
  });

  it("keeps a hand that touches the body and drops a poster on a one-pixel bridge", () => {
    const width = 48;
    const height = 32;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = (y * width + x) * 4;
        const body = x >= 8 && x <= 24 && y >= 8 && y <= 24;
        const hand = x >= 25 && x <= 31 && y >= 10 && y <= 16;
        const bridge = x === 32 && y === 13;
        const poster = x >= 33 && x <= 44 && y >= 10 && y <= 18;
        const on = body || hand || bridge || poster;
        data[index] = poster || bridge ? 240 : on ? 200 : 30;
        data[index + 1] = poster || bridge ? 30 : on ? 160 : 30;
        data[index + 2] = poster || bridge ? 180 : on ? 140 : 30;
        data[index + 3] = on ? 255 : 0;
      }
    }
    cleanCutoutEdges({ width, height, data });
    expect(data[(13 * width + 28) * 4 + 3]).toBeGreaterThan(200);
    const poster = (16 * width + 40) * 4;
    expect(data[poster + 3]).toBeLessThan(20);
    expect(data[(13 * width + 32) * 4 + 3]).toBeLessThan(200);
  });

  it("keeps a hair wisp that touches the head", () => {
    const width = 30;
    const height = 30;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = (y * width + x) * 4;
        const head = (x - 14) ** 2 + (y - 16) ** 2 <= 8 ** 2;
        const wisp = x === 14 && y >= 4 && y <= 8;
        const on = head || wisp;
        data[index] = on ? 30 : 220;
        data[index + 1] = on ? 24 : 220;
        data[index + 2] = on ? 20 : 220;
        data[index + 3] = on ? 255 : 0;
      }
    }
    cleanCutoutEdges({ width, height, data });
    expect(data[(6 * width + 14) * 4 + 3]).toBeGreaterThan(140);
  });

  it("drops a poster touching the top-left of the head and keeps a hair wisp", () => {
    const width = 80;
    const height = 72;
    const data = new Uint8ClampedArray(width * height * 4);
    const head = (x: number, y: number) => (x - 40) ** 2 + (y - 36) ** 2 <= 18 ** 2;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = (y * width + x) * 4;
        const poster = x <= 30 && y <= 26 && !head(x, y);
        const wisp = x === 40 && y >= 14 && y <= 18 && !head(x, y);
        const onHead = head(x, y);
        data[index] = poster ? 40 : 210;
        data[index + 1] = poster ? 70 : 210;
        data[index + 2] = poster ? 210 : 210;
        data[index + 3] = 0;
        if (onHead || wisp) {
          data[index] = 36;
          data[index + 1] = 28;
          data[index + 2] = 24;
          data[index + 3] = wisp ? 210 : 255;
        } else if (poster) {
          data[index + 3] = 255;
        }
      }
    }
    cleanCutoutEdges({ width, height, data });
    expect(data[(8 * width + 8) * 4 + 3]).toBeLessThan(20);
    expect(data[(16 * width + 40) * 4 + 3]).toBeGreaterThan(100);
    expect(data[(36 * width + 40) * 4 + 3]).toBeGreaterThan(200);
  });

  it("keeps a skin-toned head on a dark shirt", () => {
    const width = 64;
    const height = 80;
    const data = new Uint8ClampedArray(width * height * 4);
    const head = (x: number, y: number) => (x - 32) ** 2 + (y - 24) ** 2 <= 16 ** 2;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = (y * width + x) * 4;
        const shirt = y >= 36 && x >= 12 && x <= 52;
        const neck = y >= 32 && y < 36 && x >= 26 && x <= 38;
        const onHead = head(x, y);
        if (onHead || neck) {
          data[index] = 200;
          data[index + 1] = 150;
          data[index + 2] = 114;
          data[index + 3] = 255;
        } else if (shirt) {
          data[index] = 18;
          data[index + 1] = 20;
          data[index + 2] = 28;
          data[index + 3] = 255;
        }
      }
    }
    cleanCutoutEdges({ width, height, data });
    expect(data[(24 * width + 32) * 4 + 3]).toBeGreaterThan(200);
    expect(data[(20 * width + 32) * 4 + 3]).toBeGreaterThan(200);
    expect(data[(50 * width + 32) * 4 + 3]).toBeGreaterThan(200);
    expect(data[(50 * width + 18) * 4 + 3]).toBeGreaterThan(200);
    expect(data[(50 * width + 46) * 4 + 3]).toBeGreaterThan(200);
  });

  it("keeps a skin-toned head that sits above a larger dark shirt", () => {
    const width = 64;
    const height = 88;
    const data = new Uint8ClampedArray(width * height * 4);
    const head = (x: number, y: number) => (x - 32) ** 2 + (y - 18) ** 2 <= 12 ** 2;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = (y * width + x) * 4;
        const shirt = y >= 40 && x >= 8 && x <= 56;
        if (head(x, y)) {
          data[index] = 186;
          data[index + 1] = 132;
          data[index + 2] = 102;
          data[index + 3] = 255;
        } else if (shirt) {
          data[index] = 16;
          data[index + 1] = 18;
          data[index + 2] = 26;
          data[index + 3] = 255;
        }
      }
    }
    cleanCutoutEdges({ width, height, data });
    expect(data[(18 * width + 32) * 4 + 3]).toBeGreaterThan(200);
    expect(data[(14 * width + 32) * 4 + 3]).toBeGreaterThan(200);
    expect(data[(60 * width + 20) * 4 + 3]).toBeGreaterThan(200);
    expect(data[(60 * width + 44) * 4 + 3]).toBeGreaterThan(200);
  });

  it("keeps the head when a colour rule would erase it", () => {
    const width = 64;
    const height = 80;
    const data = new Uint8ClampedArray(width * height * 4);
    const head = (x: number, y: number) => (x - 32) ** 2 + (y - 22) ** 2 <= 14 ** 2;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = (y * width + x) * 4;
        const shirt = y >= 34 && x >= 14 && x <= 50;
        if (head(x, y)) {
          data[index] = 30;
          data[index + 1] = 190;
          data[index + 2] = 40;
          data[index + 3] = 255;
        } else if (shirt) {
          data[index] = 16;
          data[index + 1] = 18;
          data[index + 2] = 24;
          data[index + 3] = 255;
        }
      }
    }
    cleanCutoutEdges({ width, height, data });
    expect(data[(22 * width + 32) * 4 + 3]).toBeGreaterThan(200);
    expect(data[(18 * width + 32) * 4 + 3]).toBeGreaterThan(200);
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
