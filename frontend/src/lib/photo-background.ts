/**
 * In-browser background removal for the license-card photo.
 *
 * The cutout runs on the current crop (plus a margin), not the whole camera
 * frame. Weights are served from this origin. The photo is not uploaded.
 */

export const LICENSE_PHOTO_BACKGROUND_DEFAULT = "#D9D9D9";
export const BACKGROUND_REMOVAL_MODEL = "isnet_fp16";
export const BACKGROUND_REMOVAL_LONG_SIDE = 1024;
export const BACKGROUND_REMOVAL_CROP_MARGIN = 0.08;
export const BACKGROUND_REMOVAL_ASSET_PATH = "/background-removal/1.7.0/";

export type PhotoCrop = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type PhotoBackgroundProgress =
  | { phase: "download"; percent: number }
  | { phase: "prepare" | "person" | "edges" | "colour" };

type Rgb = { r: number; g: number; b: number };

export function backgroundRemovalPublicPath(origin: string): string {
  const base = origin.endsWith("/") ? origin.slice(0, -1) : origin;
  return `${base}${BACKGROUND_REMOVAL_ASSET_PATH}`;
}

function parseHexColor(value: string): Rgb | null {
  const match = /^#([0-9a-fA-F]{6})$/.exec(value.trim());
  if (!match) {
    return null;
  }
  const hex = match[1];
  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16),
  };
}

export function parseLicensePhotoColor(value: string): Rgb {
  return parseHexColor(value) ?? parseHexColor(LICENSE_PHOTO_BACKGROUND_DEFAULT) ?? { r: 217, g: 217, b: 217 };
}

export function expandCrop(
  crop: PhotoCrop,
  imageWidth: number,
  imageHeight: number,
  marginRatio = BACKGROUND_REMOVAL_CROP_MARGIN,
): PhotoCrop {
  const marginX = crop.width * marginRatio;
  const marginY = crop.height * marginRatio;
  const x = Math.max(0, crop.x - marginX);
  const y = Math.max(0, crop.y - marginY);
  const right = Math.min(imageWidth, crop.x + crop.width + marginX);
  const bottom = Math.min(imageHeight, crop.y + crop.height + marginY);
  return { x, y, width: Math.max(1, right - x), height: Math.max(1, bottom - y) };
}

/** Where the print crop sits inside the image that removal returns. */
export function printWindowAfterRemoval(
  imageWidth: number,
  imageHeight: number,
  crop: PhotoCrop,
  longSide = BACKGROUND_REMOVAL_LONG_SIDE,
): PhotoCrop {
  const expanded = expandCrop(crop, imageWidth, imageHeight);
  const fitted = fitLongSide(expanded.width, expanded.height, longSide);
  const scaleX = fitted.width / expanded.width;
  const scaleY = fitted.height / expanded.height;
  return {
    x: (crop.x - expanded.x) * scaleX,
    y: (crop.y - expanded.y) * scaleY,
    width: crop.width * scaleX,
    height: crop.height * scaleY,
  };
}

export function fitLongSide(
  width: number,
  height: number,
  longSide = BACKGROUND_REMOVAL_LONG_SIDE,
): { width: number; height: number } {
  const longest = Math.max(width, height, 1);
  const scale = longSide / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export function noteFetchProgress(
  totals: Map<string, { current: number; total: number }>,
  key: string,
  current: number,
  total: number,
): number {
  totals.set(key, { current: Math.max(0, current), total: Math.max(0, total) });
  let currentSum = 0;
  let totalSum = 0;
  for (const entry of totals.values()) {
    currentSum += entry.current;
    totalSum += entry.total;
  }
  if (totalSum <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round((currentSum / totalSum) * 100)));
}

export function progressFromLibraryKey(
  key: string,
  current: number,
  total: number,
  downloads: Map<string, { current: number; total: number }>,
): PhotoBackgroundProgress {
  if (key.startsWith("fetch:")) {
    return { phase: "download", percent: noteFetchProgress(downloads, key, current, total) };
  }
  if (key === "compute:inference") {
    return { phase: "person" };
  }
  if (key === "compute:mask" || key === "compute:encode") {
    return { phase: "edges" };
  }
  return { phase: "prepare" };
}

/** Bar position. Download uses the real percent, scaled so later stages never jump backwards. */
export function progressBarPercent(progress: PhotoBackgroundProgress): number {
  if (progress.phase === "download") {
    return Math.round(progress.percent * 0.7);
  }
  if (progress.phase === "prepare") {
    return 74;
  }
  if (progress.phase === "person") {
    return 82;
  }
  if (progress.phase === "edges") {
    return 90;
  }
  return 96;
}

/**
 * ISNet keeps the original background colour in semi-transparent pixels.
 * Unmix that spill using the colour of the pixels the mask already marked empty.
 */
export function decontaminateEdgeSpill(pixels: Uint8ClampedArray): void {
  let backgroundRed = 0;
  let backgroundGreen = 0;
  let backgroundBlue = 0;
  let backgroundCount = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index + 3] >= 16) {
      continue;
    }
    backgroundRed += pixels[index];
    backgroundGreen += pixels[index + 1];
    backgroundBlue += pixels[index + 2];
    backgroundCount += 1;
  }
  if (backgroundCount === 0) {
    return;
  }
  backgroundRed /= backgroundCount;
  backgroundGreen /= backgroundCount;
  backgroundBlue /= backgroundCount;
  for (let index = 0; index < pixels.length; index += 4) {
    const alpha = pixels[index + 3];
    if (alpha === 0 || alpha === 255) {
      continue;
    }
    const coverage = alpha / 255;
    pixels[index] = unmixChannel(pixels[index], backgroundRed, coverage);
    pixels[index + 1] = unmixChannel(pixels[index + 1], backgroundGreen, coverage);
    pixels[index + 2] = unmixChannel(pixels[index + 2], backgroundBlue, coverage);
  }
}

function unmixChannel(channel: number, background: number, coverage: number): number {
  const foreground = (channel - (1 - coverage) * background) / coverage;
  return Math.max(0, Math.min(255, Math.round(foreground)));
}

const CUTOUT_ALPHA_FLOOR = 16;
const CUTOUT_SOLID_ALPHA = 200;

function boxBlurChannel(
  source: Float32Array,
  width: number,
  height: number,
  radius: number,
): Float32Array {
  const horizontal = new Float32Array(source.length);
  const dest = new Float32Array(source.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sum = 0;
      let count = 0;
      for (let offset = -radius; offset <= radius; offset += 1) {
        const nextX = x + offset;
        if (nextX < 0 || nextX >= width) {
          continue;
        }
        sum += source[y * width + nextX];
        count += 1;
      }
      horizontal[y * width + x] = count === 0 ? 0 : sum / count;
    }
  }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sum = 0;
      let count = 0;
      for (let offset = -radius; offset <= radius; offset += 1) {
        const nextY = y + offset;
        if (nextY < 0 || nextY >= height) {
          continue;
        }
        sum += horizontal[nextY * width + x];
        count += 1;
      }
      dest[y * width + x] = count === 0 ? 0 : sum / count;
    }
  }
  return dest;
}

function erodeAlpha(alpha: Float32Array, width: number, height: number): Float32Array {
  const dest = new Float32Array(alpha.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let lowest = 255;
      for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
        const nextY = y + offsetY;
        if (nextY < 0 || nextY >= height) {
          continue;
        }
        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
          const nextX = x + offsetX;
          if (nextX < 0 || nextX >= width) {
            continue;
          }
          lowest = Math.min(lowest, alpha[nextY * width + nextX]);
        }
      }
      dest[y * width + x] = lowest;
    }
  }
  return dest;
}

/**
 * The mask leaks the old background into the fringe, and a tiny alpha turns
 * that leak into a saturated speckle. Drop the specks, pull the mask in by
 * one pixel, feather it, and take the fringe colour from nearby solid pixels.
 */
export function cleanCutoutEdges(raster: PhotoRaster): void {
  const { width, height, data } = raster;
  const count = width * height;
  const alpha = new Float32Array(count);
  const solidRed = new Float32Array(count);
  const solidGreen = new Float32Array(count);
  const solidBlue = new Float32Array(count);
  const solidWeight = new Float32Array(count);
  for (let index = 0; index < count; index += 1) {
    const offset = index * 4;
    const coverage = data[offset + 3] < CUTOUT_ALPHA_FLOOR ? 0 : data[offset + 3];
    alpha[index] = coverage;
    if (coverage >= CUTOUT_SOLID_ALPHA) {
      solidRed[index] = data[offset];
      solidGreen[index] = data[offset + 1];
      solidBlue[index] = data[offset + 2];
      solidWeight[index] = 1;
    }
  }
  const feather = boxBlurChannel(erodeAlpha(alpha, width, height), width, height, 1);
  const blurredRed = boxBlurChannel(solidRed, width, height, 2);
  const blurredGreen = boxBlurChannel(solidGreen, width, height, 2);
  const blurredBlue = boxBlurChannel(solidBlue, width, height, 2);
  const blurredWeight = boxBlurChannel(solidWeight, width, height, 2);
  for (let index = 0; index < count; index += 1) {
    const offset = index * 4;
    const coverage = Math.max(0, Math.min(255, Math.round(feather[index])));
    data[offset + 3] = coverage;
    if (coverage === 0 || blurredWeight[index] <= 0.001) {
      continue;
    }
    data[offset] = Math.max(0, Math.min(255, Math.round(blurredRed[index] / blurredWeight[index])));
    data[offset + 1] = Math.max(0, Math.min(255, Math.round(blurredGreen[index] / blurredWeight[index])));
    data[offset + 2] = Math.max(0, Math.min(255, Math.round(blurredBlue[index] / blurredWeight[index])));
  }
}

export function compositeOntoColor(pixels: Uint8ClampedArray, color: Rgb): void {
  for (let index = 0; index < pixels.length; index += 4) {
    const coverage = pixels[index + 3] / 255;
    pixels[index] = Math.round(pixels[index] * coverage + color.r * (1 - coverage));
    pixels[index + 1] = Math.round(pixels[index + 1] * coverage + color.g * (1 - coverage));
    pixels[index + 2] = Math.round(pixels[index + 2] * coverage + color.b * (1 - coverage));
    pixels[index + 3] = 255;
  }
}

export type PhotoRaster = {
  width: number;
  height: number;
  data: Uint8ClampedArray;
};

/** iPhone portrait shots are landscape files with this tag. 1 means already upright. */
export function readJpegOrientation(bytes: Uint8Array): number {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return 1;
  }
  let offset = 2;
  while (offset + 4 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      break;
    }
    const marker = bytes[offset + 1];
    if (marker === 0xda || marker === 0xd9) {
      break;
    }
    const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (length < 2 || offset + 2 + length > bytes.length) {
      break;
    }
    if (marker === 0xe1 && length >= 8) {
      const start = offset + 4;
      const exif =
        bytes[start] === 0x45 &&
        bytes[start + 1] === 0x78 &&
        bytes[start + 2] === 0x69 &&
        bytes[start + 3] === 0x66 &&
        bytes[start + 4] === 0 &&
        bytes[start + 5] === 0;
      if (exif) {
        const value = orientationFromTiff(bytes, start + 6);
        if (value >= 1 && value <= 8) {
          return value;
        }
      }
    }
    offset += 2 + length;
  }
  return 1;
}

export function readJpegSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return null;
  }
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      return null;
    }
    const marker = bytes[offset + 1];
    if (marker === 0xda || marker === 0xd9) {
      return null;
    }
    const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (marker >= 0xc0 && marker <= 0xc2 && offset + 9 < bytes.length) {
      const height = (bytes[offset + 5] << 8) | bytes[offset + 6];
      const width = (bytes[offset + 7] << 8) | bytes[offset + 8];
      if (width > 0 && height > 0) {
        return { width, height };
      }
    }
    if (length < 2) {
      return null;
    }
    offset += 2 + length;
  }
  return null;
}

function orientationFromTiff(bytes: Uint8Array, tiffStart: number): number {
  if (tiffStart + 8 > bytes.length) {
    return 1;
  }
  const little = bytes[tiffStart] === 0x49 && bytes[tiffStart + 1] === 0x49;
  const big = bytes[tiffStart] === 0x4d && bytes[tiffStart + 1] === 0x4d;
  if (!little && !big) {
    return 1;
  }
  const read16 = (pos: number) => {
    if (pos + 1 >= bytes.length) {
      return 0;
    }
    return little ? bytes[pos] | (bytes[pos + 1] << 8) : (bytes[pos] << 8) | bytes[pos + 1];
  };
  const read32 = (pos: number) => {
    if (pos + 3 >= bytes.length) {
      return 0;
    }
    return little
      ? bytes[pos] | (bytes[pos + 1] << 8) | (bytes[pos + 2] << 16) | (bytes[pos + 3] << 24)
      : (bytes[pos] << 24) | (bytes[pos + 1] << 16) | (bytes[pos + 2] << 8) | bytes[pos + 3];
  };
  if (read16(tiffStart + 2) !== 42) {
    return 1;
  }
  let pos = tiffStart + read32(tiffStart + 4);
  const count = read16(pos);
  pos += 2;
  for (let index = 0; index < count; index += 1) {
    const entry = pos + index * 12;
    if (entry + 10 >= bytes.length) {
      break;
    }
    if (read16(entry) === 0x0112) {
      return read16(entry + 8);
    }
  }
  return 1;
}

export function orientedDimensions(
  width: number,
  height: number,
  orientation: number,
): { width: number; height: number } {
  if (orientation >= 5 && orientation <= 8) {
    return { width: height, height: width };
  }
  return { width, height };
}

export function shouldApplyOrientation(
  bitmapWidth: number,
  bitmapHeight: number,
  rawWidth: number,
  rawHeight: number,
  orientation: number,
): boolean {
  if (orientation <= 1 || orientation > 8) {
    return false;
  }
  const oriented = orientedDimensions(rawWidth, rawHeight, orientation);
  const matchesOriented = bitmapWidth === oriented.width && bitmapHeight === oriented.height;
  const matchesRaw = bitmapWidth === rawWidth && bitmapHeight === rawHeight;
  if (matchesOriented && !matchesRaw) {
    return false;
  }
  return true;
}

function orientedPoint(
  x: number,
  y: number,
  width: number,
  height: number,
  orientation: number,
): [number, number] {
  switch (orientation) {
    case 2:
      return [width - 1 - x, y];
    case 3:
      return [width - 1 - x, height - 1 - y];
    case 4:
      return [x, height - 1 - y];
    case 5:
      return [y, x];
    case 6:
      return [height - 1 - y, x];
    case 7:
      return [height - 1 - y, width - 1 - x];
    case 8:
      return [y, width - 1 - x];
    default:
      return [x, y];
  }
}

/** Turn stored pixels upright. A circle stays a circle; only its place on the grid changes. */
export function applyExifOrientation(raster: PhotoRaster, orientation: number): PhotoRaster {
  if (orientation <= 1 || orientation > 8) {
    return raster;
  }
  const { width, height, data } = raster;
  const destSize = orientedDimensions(width, height, orientation);
  const dest = new Uint8ClampedArray(destSize.width * destSize.height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [destX, destY] = orientedPoint(x, y, width, height, orientation);
      const sourceIndex = (y * width + x) * 4;
      const destIndex = (destY * destSize.width + destX) * 4;
      dest[destIndex] = data[sourceIndex];
      dest[destIndex + 1] = data[sourceIndex + 1];
      dest[destIndex + 2] = data[sourceIndex + 2];
      dest[destIndex + 3] = data[sourceIndex + 3];
    }
  }
  return { width: destSize.width, height: destSize.height, data: dest };
}

export function resampleCrop(
  source: PhotoRaster,
  crop: PhotoCrop,
  destWidth: number,
  destHeight: number,
): PhotoRaster {
  const width = Math.max(1, Math.round(destWidth));
  const height = Math.max(1, Math.round(destHeight));
  const dest = new Uint8ClampedArray(width * height * 4);
  const scaleX = crop.width / width;
  const scaleY = crop.height / height;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sourceX = Math.min(
        source.width - 1,
        Math.max(0, Math.floor(crop.x + (x + 0.5) * scaleX)),
      );
      const sourceY = Math.min(
        source.height - 1,
        Math.max(0, Math.floor(crop.y + (y + 0.5) * scaleY)),
      );
      const sourceIndex = (sourceY * source.width + sourceX) * 4;
      const destIndex = (y * width + x) * 4;
      dest[destIndex] = source.data[sourceIndex];
      dest[destIndex + 1] = source.data[sourceIndex + 1];
      dest[destIndex + 2] = source.data[sourceIndex + 2];
      dest[destIndex + 3] = source.data[sourceIndex + 3];
    }
  }
  return { width, height, data: dest };
}

export function removalInputRaster(
  stored: PhotoRaster,
  orientation: number,
  crop: PhotoCrop,
  longSide = BACKGROUND_REMOVAL_LONG_SIDE,
): PhotoRaster {
  const oriented = applyExifOrientation(stored, orientation);
  const expanded = expandCrop(crop, oriented.width, oriented.height);
  const fitted = fitLongSide(expanded.width, expanded.height, longSide);
  return resampleCrop(oriented, expanded, fitted.width, fitted.height);
}

/** Paint a different-sized cutout back onto the frame we sent to the model. */
export function restoreRemovalFrame(input: PhotoRaster, cutout: PhotoRaster): PhotoRaster {
  if (cutout.width === input.width && cutout.height === input.height) {
    return cutout;
  }
  return resampleCrop(
    cutout,
    { x: 0, y: 0, width: cutout.width, height: cutout.height },
    input.width,
    input.height,
  );
}

export function matchCropAspect(crop: PhotoCrop, aspect: number): PhotoCrop {
  if (crop.width <= 0 || crop.height <= 0 || aspect <= 0) {
    return crop;
  }
  const current = crop.width / crop.height;
  if (Math.abs(current - aspect) / aspect < 0.001) {
    return crop;
  }
  if (current > aspect) {
    const width = crop.height * aspect;
    return { x: crop.x + (crop.width - width) / 2, y: crop.y, width, height: crop.height };
  }
  const height = crop.width / aspect;
  return { x: crop.x, y: crop.y + (crop.height - height) / 2, width: crop.width, height };
}

export function rasterForPrintFrame(
  source: PhotoRaster,
  crop: PhotoCrop,
  frameWidth: number,
  frameHeight: number,
): PhotoRaster {
  const x = Math.min(Math.max(0, crop.x), Math.max(0, source.width - 1));
  const y = Math.min(Math.max(0, crop.y), Math.max(0, source.height - 1));
  const clamped = {
    x,
    y,
    width: Math.max(1, Math.min(crop.width, source.width - x)),
    height: Math.max(1, Math.min(crop.height, source.height - y)),
  };
  const matched = matchCropAspect(clamped, frameWidth / frameHeight);
  return resampleCrop(source, matched, frameWidth, frameHeight);
}

export function licensePhotoFromStored(options: {
  stored: PhotoRaster;
  orientation: number;
  crop: PhotoCrop;
  modelOutput: (input: PhotoRaster) => PhotoRaster;
  frameWidth: number;
  frameHeight: number;
  longSide?: number;
}): PhotoRaster {
  const input = removalInputRaster(options.stored, options.orientation, options.crop, options.longSide);
  const restored = restoreRemovalFrame(input, options.modelOutput(input));
  return rasterForPrintFrame(
    restored,
    { x: 0, y: 0, width: restored.width, height: restored.height },
    options.frameWidth,
    options.frameHeight,
  );
}

function rasterFromImageBitmap(bitmap: ImageBitmap): PhotoRaster {
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    throw new Error("Unable to read the photo.");
  }
  context.drawImage(bitmap, 0, 0);
  const image = context.getImageData(0, 0, bitmap.width, bitmap.height);
  return { width: bitmap.width, height: bitmap.height, data: new Uint8ClampedArray(image.data) };
}

function paintRaster(raster: PhotoRaster): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = raster.width;
  canvas.height = raster.height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Unable to prepare the photo.");
  }
  const image = context.createImageData(raster.width, raster.height);
  image.data.set(raster.data);
  context.putImageData(image, 0, 0);
  return canvas;
}

export async function rasterFromBlob(blob: Blob): Promise<PhotoRaster> {
  const bytes = await blobBytes(blob);
  const orientation = readJpegOrientation(bytes);
  const rawSize = readJpegSize(bytes);
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(blob, { imageOrientation: "none" });
  } catch {
    bitmap = await createImageBitmap(blob);
  }
  try {
    const raw = rasterFromImageBitmap(bitmap);
    if (
      rawSize &&
      shouldApplyOrientation(bitmap.width, bitmap.height, rawSize.width, rawSize.height, orientation)
    ) {
      return applyExifOrientation(raw, orientation);
    }
    return raw;
  } finally {
    bitmap.close();
  }
}

async function blobBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === "function") {
    return new Uint8Array(await blob.arrayBuffer());
  }
  return new Uint8Array(await new Response(blob).arrayBuffer());
}

export async function normalizePhotoFile(file: File): Promise<File> {
  try {
    const bytes = await blobBytes(file);
    if (readJpegOrientation(bytes) === 1) {
      return file;
    }
    const raster = await rasterFromBlob(file);
    const blob = await canvasToBlob(paintRaster(raster), "image/jpeg", 0.92);
    const stem = file.name.replace(/\.[^.]+$/, "") || "photo";
    return new File([blob], `${stem}.jpg`, { type: "image/jpeg" });
  } catch {
    return file;
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Unable to encode the photo."));
        return;
      }
      resolve(blob);
    }, type, quality);
  });
}

function asPngBlob(removed: unknown): Blob {
  if (removed instanceof Blob) {
    return removed;
  }
  if (
    removed &&
    typeof removed === "object" &&
    "blob" in removed &&
    removed.blob instanceof Blob
  ) {
    return removed.blob;
  }
  if (removed instanceof ArrayBuffer) {
    return new Blob([removed], { type: "image/png" });
  }
  throw new Error("Background removal returned an unexpected result.");
}

export async function removeProfileBackground(options: {
  imageUrl: string;
  crop: PhotoCrop;
  color: string;
  onProgress?: (progress: PhotoBackgroundProgress) => void;
}): Promise<Blob> {
  const report = options.onProgress ?? (() => undefined);
  report({ phase: "prepare" });
  const response = await fetch(options.imageUrl);
  if (!response.ok) {
    throw new Error("Unable to load image for processing.");
  }
  // Orient first. A tall crop painted from an unrotated iPhone bitmap stretches the face.
  const oriented = await rasterFromBlob(await response.blob());
  const input = removalInputRaster(oriented, 1, options.crop);
  const inputBlob = await canvasToBlob(paintRaster(input), "image/png");

  const downloads = new Map<string, { current: number; total: number }>();
  const bgModule = await import("@imgly/background-removal-js");
  const removed = await bgModule.removeBackground(inputBlob, {
    publicPath: backgroundRemovalPublicPath(window.location.origin),
    model: BACKGROUND_REMOVAL_MODEL,
    device: "cpu",
    output: { format: "image/png", quality: 1 },
    progress: (key: string, current: number, total: number) => {
      report(progressFromLibraryKey(key, current, total, downloads));
    },
  });

  report({ phase: "edges" });
  const cutout = await rasterFromBlob(asPngBlob(removed));
  const restored = restoreRemovalFrame(input, cutout);
  cleanCutoutEdges(restored);
  report({ phase: "colour" });
  compositeOntoColor(restored.data, parseLicensePhotoColor(options.color));
  return canvasToBlob(paintRaster(restored), "image/png");
}
