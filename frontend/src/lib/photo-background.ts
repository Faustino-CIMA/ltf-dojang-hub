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

export function compositeOntoColor(pixels: Uint8ClampedArray, color: Rgb): void {
  for (let index = 0; index < pixels.length; index += 4) {
    const coverage = pixels[index + 3] / 255;
    pixels[index] = Math.round(pixels[index] * coverage + color.r * (1 - coverage));
    pixels[index + 1] = Math.round(pixels[index + 1] * coverage + color.g * (1 - coverage));
    pixels[index + 2] = Math.round(pixels[index + 2] * coverage + color.b * (1 - coverage));
    pixels[index + 3] = 255;
  }
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to load image for processing."));
    image.src = source;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Unable to encode the photo."));
        return;
      }
      resolve(blob);
    }, type);
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

async function blobToCanvas(blob: Blob): Promise<{
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  image: ImageData;
}> {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new Error("Unable to read the cutout.");
  }
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  return {
    canvas,
    context,
    image: context.getImageData(0, 0, canvas.width, canvas.height),
  };
}

export async function removeProfileBackground(options: {
  imageUrl: string;
  crop: PhotoCrop;
  color: string;
  onProgress?: (progress: PhotoBackgroundProgress) => void;
}): Promise<Blob> {
  const report = options.onProgress ?? (() => undefined);
  report({ phase: "prepare" });
  const image = await loadImage(options.imageUrl);
  const expanded = expandCrop(
    options.crop,
    image.naturalWidth || image.width,
    image.naturalHeight || image.height,
  );
  const fitted = fitLongSide(expanded.width, expanded.height);
  const inputCanvas = document.createElement("canvas");
  inputCanvas.width = fitted.width;
  inputCanvas.height = fitted.height;
  const inputContext = inputCanvas.getContext("2d");
  if (!inputContext) {
    throw new Error("Unable to prepare the photo.");
  }
  inputContext.drawImage(
    image,
    expanded.x,
    expanded.y,
    expanded.width,
    expanded.height,
    0,
    0,
    fitted.width,
    fitted.height,
  );
  const inputBlob = await canvasToBlob(inputCanvas, "image/png");

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
  const cutout = await blobToCanvas(asPngBlob(removed));
  decontaminateEdgeSpill(cutout.image.data);
  report({ phase: "colour" });
  compositeOntoColor(cutout.image.data, parseLicensePhotoColor(options.color));
  cutout.context.putImageData(cutout.image, 0, 0);
  return canvasToBlob(cutout.canvas, "image/png");
}
