/**
 * In-browser background removal for the license-card photo.
 *
 * The cutout runs on the current crop (plus a margin), not the whole camera
 * frame. Weights are served from this origin. The photo is not uploaded.
 */

import { BackgroundFetchError, runWithModelFetch } from "@/lib/background-model-cache";

export const LICENSE_PHOTO_BACKGROUND_DEFAULT = "#D9D9D9";
/** Soft shadow under the person on the card grey. One place for preview and Save. */
export const CUTOUT_SHADOW_OFFSET_X = 0;
export const CUTOUT_SHADOW_OFFSET_Y = 8;
export const CUTOUT_SHADOW_BLUR = 14;
export const CUTOUT_SHADOW_STRENGTH = 0.16;
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
  | { phase: "prepare" | "person" | "edges" | "colour" | "server" };

type Rgb = { r: number; g: number; b: number };

export function backgroundRemovalPublicPath(origin: string): string {
  const base = origin.endsWith("/") ? origin.slice(0, -1) : origin;
  return `${base}${BACKGROUND_REMOVAL_ASSET_PATH}`;
}

/**
 * Options passed to @imgly/background-removal.
 * The library memoizes init() with JSON.stringify, which drops functions and
 * keeps a rejected or still-pending promise. `attempt` is a real field, so
 * each Retry is a new load. Zod strips it before the download starts.
 */
export function removalLibraryConfig(origin: string, attempt: number): {
  publicPath: string;
  model: typeof BACKGROUND_REMOVAL_MODEL;
  device: "cpu";
  output: { format: "image/png"; quality: 1 };
  attempt: number;
} {
  return {
    publicPath: backgroundRemovalPublicPath(origin),
    model: BACKGROUND_REMOVAL_MODEL,
    device: "cpu",
    output: { format: "image/png", quality: 1 },
    attempt,
  };
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

/**
 * Where the print crop sits inside the full-resolution image removal returns.
 * The model still sees a 1024 working copy. Only its mask is scaled back.
 */
export function printWindowAfterRemoval(
  imageWidth: number,
  imageHeight: number,
  crop: PhotoCrop,
): PhotoCrop {
  const expanded = expandCrop(crop, imageWidth, imageHeight);
  return {
    x: crop.x - expanded.x,
    y: crop.y - expanded.y,
    width: crop.width,
    height: crop.height,
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
const CUTOUT_SUBJECT_ALPHA = 128;
const CUTOUT_BACKGROUND_DISTANCE = 48;
const CUTOUT_BRIDGE_RADIUS = 1;
const CUTOUT_SATURATED_CHROMA = 80;
/** A printed poster is often less neon than 80, and still far from hair and skin. */
const CUTOUT_FOREIGN_CHROMA = 48;
const CUTOUT_FOREIGN_DISTANCE = 90;
/** Ordinary skin sits in this chroma band. A black uniform must not make it look foreign. */
const SKIN_CHROMA_MIN = 12;
const SKIN_CHROMA_MAX = 100;
const MATTE_GUIDE_RADIUS = 4;
const MATTE_GUIDE_EPSILON = 256;

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

function boxMean(source: Float32Array, width: number, height: number, radius: number): Float32Array {
  const stride = width + 1;
  const integral = new Float64Array(stride * (height + 1));
  for (let y = 0; y < height; y += 1) {
    let row = 0;
    for (let x = 0; x < width; x += 1) {
      row += source[y * width + x];
      integral[(y + 1) * stride + (x + 1)] = integral[y * stride + (x + 1)] + row;
    }
  }
  const dest = new Float32Array(source.length);
  for (let y = 0; y < height; y += 1) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(height - 1, y + radius);
    for (let x = 0; x < width; x += 1) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(width - 1, x + radius);
      const sum =
        integral[(y1 + 1) * stride + (x1 + 1)] -
        integral[y0 * stride + (x1 + 1)] -
        integral[(y1 + 1) * stride + x0] +
        integral[y0 * stride + x0];
      dest[y * width + x] = sum / ((x1 - x0 + 1) * (y1 - y0 + 1));
    }
  }
  return dest;
}

/**
 * Edge-aware smooth of a coarse mask. The photo is the guide, so a real
 * contour keeps its slope and a flat stair-step is averaged away.
 */
function guideAlpha(
  alpha: Float32Array,
  guidance: Float32Array,
  width: number,
  height: number,
): Float32Array {
  const meanGuidance = boxMean(guidance, width, height, MATTE_GUIDE_RADIUS);
  const meanAlpha = boxMean(alpha, width, height, MATTE_GUIDE_RADIUS);
  const guidanceSquare = new Float32Array(alpha.length);
  const guidanceAlpha = new Float32Array(alpha.length);
  for (let index = 0; index < alpha.length; index += 1) {
    guidanceSquare[index] = guidance[index] * guidance[index];
    guidanceAlpha[index] = guidance[index] * alpha[index];
  }
  const meanSquare = boxMean(guidanceSquare, width, height, MATTE_GUIDE_RADIUS);
  const meanProduct = boxMean(guidanceAlpha, width, height, MATTE_GUIDE_RADIUS);
  const coefficient = new Float32Array(alpha.length);
  const offset = new Float32Array(alpha.length);
  for (let index = 0; index < alpha.length; index += 1) {
    const variance = meanSquare[index] - meanGuidance[index] * meanGuidance[index];
    const covariance = meanProduct[index] - meanGuidance[index] * meanAlpha[index];
    coefficient[index] = covariance / (variance + MATTE_GUIDE_EPSILON);
    offset[index] = meanAlpha[index] - coefficient[index] * meanGuidance[index];
  }
  const meanCoefficient = boxMean(coefficient, width, height, MATTE_GUIDE_RADIUS);
  const meanOffset = boxMean(offset, width, height, MATTE_GUIDE_RADIUS);
  const dest = new Float32Array(alpha.length);
  for (let index = 0; index < alpha.length; index += 1) {
    dest[index] = meanCoefficient[index] * guidance[index] + meanOffset[index];
  }
  return dest;
}

function colourDistance(red: number, green: number, blue: number, background: Rgb): number {
  const dr = red - background.r;
  const dg = green - background.g;
  const db = blue - background.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function colourAt(pixels: Uint8ClampedArray, index: number): Rgb {
  const offset = index * 4;
  return { r: pixels[offset], g: pixels[offset + 1], b: pixels[offset + 2] };
}

function chromaOf(colour: Rgb): number {
  return Math.max(colour.r, colour.g, colour.b) - Math.min(colour.r, colour.g, colour.b);
}

function solidInterior(alpha: Float32Array, width: number, height: number, index: number): boolean {
  const x = index % width;
  const y = Math.floor(index / width);
  for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
    const nextY = y + offsetY;
    if (nextY < 0 || nextY >= height) {
      return false;
    }
    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
      const nextX = x + offsetX;
      if (nextX < 0 || nextX >= width || alpha[nextY * width + nextX] < CUTOUT_SOLID_ALPHA) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Warm skin, light or dark. A black dobok is the largest low-chroma region, so a
 * distance from that median would call the face a poster and delete it.
 */
function isSkinTone(colour: Rgb): boolean {
  const { r, g, b } = colour;
  if (r < 45 || r <= g || r <= b) {
    return false;
  }
  const chroma = chromaOf(colour);
  if (chroma < SKIN_CHROMA_MIN || chroma > SKIN_CHROMA_MAX) {
    return false;
  }
  return r - Math.max(g, b) >= 8;
}

/** A poster colour sitting against the person. Skin, low-chroma hair, and a white uniform are not this. */
function saturatedForeign(colour: Rgb, subject: Rgb): boolean {
  if (isSkinTone(colour)) {
    return false;
  }
  return chromaOf(colour) >= CUTOUT_FOREIGN_CHROMA && colourDistance(colour.r, colour.g, colour.b, subject) >= CUTOUT_FOREIGN_DISTANCE;
}

function dropBackgroundColouredFringe(raster: PhotoRaster, enclosed?: Uint8Array): void {
  const { data } = raster;
  let red = 0;
  let green = 0;
  let blue = 0;
  let count = 0;
  for (let index = 0; index < data.length; index += 4) {
    if (data[index + 3] >= CUTOUT_ALPHA_FLOOR) {
      continue;
    }
    red += data[index];
    green += data[index + 1];
    blue += data[index + 2];
    count += 1;
  }
  if (count === 0) {
    return;
  }
  const background = { r: red / count, g: green / count, b: blue / count };
  for (let index = 0; index < data.length; index += 4) {
    const pixel = index / 4;
    if (enclosed?.[pixel]) {
      continue;
    }
    const alpha = data[index + 3];
    if (alpha < CUTOUT_ALPHA_FLOOR || alpha >= CUTOUT_SOLID_ALPHA) {
      continue;
    }
    if (colourDistance(data[index], data[index + 1], data[index + 2], background) < CUTOUT_BACKGROUND_DISTANCE) {
      data[index + 3] = 0;
    }
  }
}

function erodeMask(mask: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  const eroded = new Uint8Array(mask.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (!mask[index]) {
        continue;
      }
      let solid = true;
      for (let offsetY = -radius; offsetY <= radius && solid; offsetY += 1) {
        for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
          const nextX = x + offsetX;
          const nextY = y + offsetY;
          if (nextX < 0 || nextY < 0 || nextX >= width || nextY >= height || !mask[nextY * width + nextX]) {
            solid = false;
            break;
          }
        }
      }
      eroded[index] = solid ? 1 : 0;
    }
  }
  return eroded;
}

function largestComponent(mask: Uint8Array, width: number, height: number): Uint8Array {
  const count = mask.length;
  const labels = new Int32Array(count);
  const queue = new Int32Array(count);
  let nextLabel = 0;
  let bestLabel = 0;
  let bestCount = 0;
  for (let start = 0; start < count; start += 1) {
    if (!mask[start] || labels[start] !== 0) {
      continue;
    }
    nextLabel += 1;
    let head = 0;
    let tail = 0;
    queue[tail] = start;
    tail += 1;
    labels[start] = nextLabel;
    let area = 0;
    while (head < tail) {
      const index = queue[head];
      head += 1;
      area += 1;
      const x = index % width;
      const y = Math.floor(index / width);
      const neighbours = [
        x > 0 ? index - 1 : -1,
        x + 1 < width ? index + 1 : -1,
        y > 0 ? index - width : -1,
        y + 1 < height ? index + width : -1,
      ];
      for (const neighbour of neighbours) {
        if (neighbour < 0 || !mask[neighbour] || labels[neighbour] !== 0) {
          continue;
        }
        labels[neighbour] = nextLabel;
        queue[tail] = neighbour;
        tail += 1;
      }
    }
    if (area > bestCount) {
      bestCount = area;
      bestLabel = nextLabel;
    }
  }
  const core = new Uint8Array(count);
  if (bestCount === 0) {
    return core;
  }
  for (let index = 0; index < count; index += 1) {
    core[index] = labels[index] === bestLabel ? 1 : 0;
  }
  return core;
}

function medianColour(pixels: Uint8ClampedArray, mask: Uint8Array, lowChromaOnly: boolean): Rgb | null {
  const reds: number[] = [];
  const greens: number[] = [];
  const blues: number[] = [];
  for (let index = 0; index < mask.length; index += 1) {
    if (!mask[index]) {
      continue;
    }
    const colour = colourAt(pixels, index);
    if (lowChromaOnly && chromaOf(colour) >= CUTOUT_SATURATED_CHROMA) {
      continue;
    }
    reds.push(colour.r);
    greens.push(colour.g);
    blues.push(colour.b);
  }
  if (reds.length === 0) {
    return null;
  }
  const mid = (values: number[]) => {
    values.sort((left, right) => left - right);
    return values[Math.floor(values.length / 2)];
  };
  return { r: mid(reds), g: mid(greens), b: mid(blues) };
}

/** The upper part of the person. The shirt must not become the colour the face is judged against. */
function upperPerson(mask: Uint8Array, width: number, height: number): Uint8Array {
  let minY = height;
  let maxY = -1;
  for (let index = 0; index < mask.length; index += 1) {
    if (!mask[index]) {
      continue;
    }
    const y = Math.floor(index / width);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  const upper = new Uint8Array(mask.length);
  if (maxY < minY) {
    return upper;
  }
  const limit = minY + Math.max(1, Math.round((maxY - minY + 1) * 0.55));
  for (let index = 0; index < mask.length; index += 1) {
    if (mask[index] && Math.floor(index / width) <= limit) {
      upper[index] = 1;
    }
  }
  return upper;
}

function subjectColour(pixels: Uint8ClampedArray, mask: Uint8Array, width: number, height: number): Rgb | null {
  const upper = upperPerson(mask, width, height);
  return (
    medianColour(pixels, upper, true) ??
    medianColour(pixels, upper, false) ??
    medianColour(pixels, mask, true) ??
    medianColour(pixels, mask, false)
  );
}

function floodAllowed(seeds: Uint8Array, allowed: Uint8Array, width: number, height: number): Uint8Array {
  const keep = new Uint8Array(seeds.length);
  const queue = new Int32Array(seeds.length);
  let tail = 0;
  for (let index = 0; index < seeds.length; index += 1) {
    if (!seeds[index] || !allowed[index]) {
      continue;
    }
    keep[index] = 1;
    queue[tail] = index;
    tail += 1;
  }
  let head = 0;
  while (head < tail) {
    const index = queue[head];
    head += 1;
    const x = index % width;
    const y = Math.floor(index / width);
    const neighbours = [
      x > 0 ? index - 1 : -1,
      x + 1 < width ? index + 1 : -1,
      y > 0 ? index - width : -1,
      y + 1 < height ? index + width : -1,
    ];
    for (const neighbour of neighbours) {
      if (neighbour < 0 || keep[neighbour] || !allowed[neighbour]) {
        continue;
      }
      keep[neighbour] = 1;
      queue[tail] = neighbour;
      tail += 1;
    }
  }
  return keep;
}

function reachesBorder(blocked: Uint8Array, width: number, height: number): Uint8Array {
  const count = blocked.length;
  const reached = new Uint8Array(count);
  const queue = new Int32Array(count);
  let tail = 0;
  const tryAdd = (index: number) => {
    if (index < 0 || blocked[index] || reached[index]) {
      return;
    }
    reached[index] = 1;
    queue[tail] = index;
    tail += 1;
  };
  for (let x = 0; x < width; x += 1) {
    tryAdd(x);
    tryAdd((height - 1) * width + x);
  }
  for (let y = 0; y < height; y += 1) {
    tryAdd(y * width);
    tryAdd(y * width + width - 1);
  }
  let head = 0;
  while (head < tail) {
    const index = queue[head];
    head += 1;
    const x = index % width;
    const y = Math.floor(index / width);
    const neighbours = [
      x > 0 ? index - 1 : -1,
      x + 1 < width ? index + 1 : -1,
      y > 0 ? index - width : -1,
      y + 1 < height ? index + width : -1,
    ];
    for (const neighbour of neighbours) {
      tryAdd(neighbour);
    }
  }
  return reached;
}

/**
 * The person is the largest piece after a one-pixel bridge cut, plus foreground
 * that touches it. A bright highlight inside the face is filled back in.
 * A poster touching the head is not, including one that is colourful without
 * being neon. Low-chroma hair and a white uniform stay.
 */
function selectPerson(
  alpha: Float32Array,
  width: number,
  height: number,
  pixels: Uint8ClampedArray,
): { person: Uint8Array; enclosed: Uint8Array } {
  const count = alpha.length;
  const foreground = new Uint8Array(count);
  for (let index = 0; index < count; index += 1) {
    foreground[index] = alpha[index] >= CUTOUT_SUBJECT_ALPHA ? 1 : 0;
  }
  const eroded = erodeMask(foreground, width, height, CUTOUT_BRIDGE_RADIUS);
  const geometric = largestComponent(eroded, width, height);
  const subject = subjectColour(pixels, geometric, width, height);
  const passable = new Uint8Array(count);
  for (let index = 0; index < count; index += 1) {
    if (!eroded[index]) {
      continue;
    }
    if (subject && saturatedForeign(colourAt(pixels, index), subject)) {
      continue;
    }
    passable[index] = 1;
  }
  let core = largestComponent(passable, width, height);
  if (!core.some((pixel) => pixel === 1)) {
    core = largestComponent(foreground, width, height);
  }
  const raisedHead = upperCenterPiece(passable, width, height);
  for (let index = 0; index < count; index += 1) {
    if (raisedHead[index]) {
      core[index] = 1;
    }
  }
  const allowed = new Uint8Array(count);
  for (let index = 0; index < count; index += 1) {
    if (!foreground[index]) {
      continue;
    }
    if (subject && !core[index] && saturatedForeign(colourAt(pixels, index), subject)) {
      continue;
    }
    allowed[index] = 1;
  }
  const person = floodAllowed(core, allowed, width, height);
  const outside = reachesBorder(person, width, height);
  const enclosed = new Uint8Array(count);
  for (let index = 0; index < count; index += 1) {
    if (person[index] || outside[index]) {
      continue;
    }
    person[index] = 1;
    enclosed[index] = 1;
  }
  return { person, enclosed };
}

function nearPerson(person: Uint8Array, width: number, height: number, index: number, radius: number): boolean {
  const x = index % width;
  const y = Math.floor(index / width);
  for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
    const nextY = y + offsetY;
    if (nextY < 0 || nextY >= height) {
      continue;
    }
    for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
      const nextX = x + offsetX;
      if (nextX < 0 || nextX >= width) {
        continue;
      }
      if (person[nextY * width + nextX]) {
        return true;
      }
    }
  }
  return false;
}

function outerFringe(person: Uint8Array, width: number, height: number, index: number): boolean {
  if (!person[index]) {
    return false;
  }
  const x = index % width;
  const y = Math.floor(index / width);
  if (x === 0 || y === 0 || x + 1 === width || y + 1 === height) {
    return true;
  }
  return !person[index - 1] || !person[index + 1] || !person[index - width] || !person[index + width];
}

function upsampleAlpha(
  source: Float32Array,
  sourceWidth: number,
  sourceHeight: number,
  destWidth: number,
  destHeight: number,
): Float32Array {
  if (sourceWidth === destWidth && sourceHeight === destHeight) {
    return source.slice();
  }
  const dest = new Float32Array(destWidth * destHeight);
  for (let y = 0; y < destHeight; y += 1) {
    const gy = destHeight === 1 ? 0 : (y * (sourceHeight - 1)) / Math.max(1, destHeight - 1);
    const y0 = Math.floor(gy);
    const y1 = Math.min(sourceHeight - 1, y0 + 1);
    const fy = gy - y0;
    for (let x = 0; x < destWidth; x += 1) {
      const gx = destWidth === 1 ? 0 : (x * (sourceWidth - 1)) / Math.max(1, destWidth - 1);
      const x0 = Math.floor(gx);
      const x1 = Math.min(sourceWidth - 1, x0 + 1);
      const fx = gx - x0;
      dest[y * destWidth + x] =
        source[y0 * sourceWidth + x0] * (1 - fx) * (1 - fy) +
        source[y0 * sourceWidth + x1] * fx * (1 - fy) +
        source[y1 * sourceWidth + x0] * (1 - fx) * fy +
        source[y1 * sourceWidth + x1] * fx * fy;
    }
  }
  return dest;
}

/**
 * Put the model's mask on the original crop. Only the alpha is scaled.
 * The face colour is the original pixels.
 */
export function applyMaskOnce(original: PhotoRaster, mask: PhotoRaster): PhotoRaster {
  const data = new Uint8ClampedArray(original.data);
  const alpha = new Float32Array(mask.width * mask.height);
  for (let index = 0; index < alpha.length; index += 1) {
    alpha[index] = mask.data[index * 4 + 3];
  }
  const scaled = upsampleAlpha(alpha, mask.width, mask.height, original.width, original.height);
  for (let index = 0; index < scaled.length; index += 1) {
    data[index * 4 + 3] = Math.max(0, Math.min(255, Math.round(scaled[index])));
  }
  return { width: original.width, height: original.height, data };
}

/**
 * Put the model's mask on the original crop. The model's colour is ignored,
 * so a sharp pattern in the photo stays sharp.
 */
export function compositeMaskOntoOriginal(original: PhotoRaster, mask: PhotoRaster): PhotoRaster {
  const raster = applyMaskOnce(original, mask);
  cleanCutoutEdges(raster);
  return raster;
}

function labelMask(mask: Uint8Array, width: number, height: number): Int32Array {
  const labels = new Int32Array(mask.length);
  const queue = new Int32Array(mask.length);
  let nextLabel = 0;
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || labels[start] !== 0) {
      continue;
    }
    nextLabel += 1;
    let head = 0;
    let tail = 0;
    queue[tail] = start;
    tail += 1;
    labels[start] = nextLabel;
    while (head < tail) {
      const index = queue[head];
      head += 1;
      const x = index % width;
      const y = Math.floor(index / width);
      const neighbours = [
        x > 0 ? index - 1 : -1,
        x + 1 < width ? index + 1 : -1,
        y > 0 ? index - width : -1,
        y + 1 < height ? index + width : -1,
      ];
      for (const neighbour of neighbours) {
        if (neighbour < 0 || !mask[neighbour] || labels[neighbour] !== 0) {
          continue;
        }
        labels[neighbour] = nextLabel;
        queue[tail] = neighbour;
        tail += 1;
      }
    }
  }
  return labels;
}

/** The piece in the top middle of the frame. Shoulders and a corner poster lose this vote. */
function upperCenterPiece(mask: Uint8Array, width: number, height: number): Uint8Array {
  const labels = labelMask(mask, width, height);
  const piece = new Uint8Array(mask.length);
  const top = Math.max(1, Math.round(height * 0.5));
  const left = Math.round(width * 0.35);
  const right = Math.min(width - 1, Math.round(width * 0.65));
  const score = new Map<number, number>();
  for (let y = 0; y < top; y += 1) {
    for (let x = left; x <= right; x += 1) {
      const label = labels[y * width + x];
      if (label === 0) {
        continue;
      }
      score.set(label, (score.get(label) ?? 0) + 1);
    }
  }
  let best = 0;
  let bestScore = 0;
  for (const [label, count] of score) {
    if (count > bestScore) {
      best = label;
      bestScore = count;
    }
  }
  if (bestScore < 12) {
    return piece;
  }
  for (let index = 0; index < labels.length; index += 1) {
    if (labels[index] === best && Math.floor(index / width) < top && index % width >= left && index % width <= right) {
      piece[index] = 1;
    }
  }
  return piece;
}

/** True when the cleanup erased most of the head. The caller then keeps the model mask. */
function removedMostOfTheFace(
  before: Uint8ClampedArray,
  after: Uint8ClampedArray,
  zone: Uint8Array,
): boolean {
  let total = 0;
  let kept = 0;
  for (let index = 0; index < zone.length; index += 1) {
    if (!zone[index] || before[index * 4 + 3] < CUTOUT_SUBJECT_ALPHA) {
      continue;
    }
    total += 1;
    if (after[index * 4 + 3] >= CUTOUT_SUBJECT_ALPHA) {
      kept += 1;
    }
  }
  if (total < 12) {
    return false;
  }
  return kept / total < 0.5;
}

/**
 * Cut a thin bridge, keep the person and what touches them, and fill holes
 * inside that person. A poster colour is refused only on the outer edge.
 * The guided filter feathers that edge. Solid interior pixels stay solid.
 * Skin is never a poster. If the result would erase the head, the model mask is kept.
 */
export function cleanCutoutEdges(raster: PhotoRaster): void {
  const { width, height, data } = raster;
  const count = width * height;
  const saved = new Uint8ClampedArray(data);
  const savedAlpha = new Float32Array(count);
  for (let index = 0; index < count; index += 1) {
    savedAlpha[index] = data[index * 4 + 3];
  }
  const foreground = new Uint8Array(count);
  for (let index = 0; index < count; index += 1) {
    foreground[index] = savedAlpha[index] >= CUTOUT_SUBJECT_ALPHA ? 1 : 0;
  }
  const head = upperCenterPiece(foreground, width, height);
  const alpha = new Float32Array(count);
  const guidance = new Float32Array(count);
  for (let index = 0; index < count; index += 1) {
    const offset = index * 4;
    alpha[index] = data[offset + 3] < CUTOUT_ALPHA_FLOOR ? 0 : data[offset + 3];
    guidance[index] = data[offset] * 0.299 + data[offset + 1] * 0.587 + data[offset + 2] * 0.114;
  }
  const { person, enclosed } = selectPerson(alpha, width, height, data);
  const wasSolid = new Uint8Array(count);
  for (let index = 0; index < count; index += 1) {
    if (!person[index]) {
      alpha[index] = 0;
      continue;
    }
    if (enclosed[index] || alpha[index] >= CUTOUT_SOLID_ALPHA) {
      alpha[index] = Math.max(alpha[index], CUTOUT_SOLID_ALPHA);
    }
    wasSolid[index] = alpha[index] >= CUTOUT_SOLID_ALPHA ? 1 : 0;
    data[index * 4 + 3] = alpha[index];
  }
  for (let index = 0; index < count; index += 1) {
    if (!person[index]) {
      data[index * 4 + 3] = 0;
    }
  }
  dropBackgroundColouredFringe(raster, enclosed);
  for (let index = 0; index < count; index += 1) {
    alpha[index] = data[index * 4 + 3];
  }
  const subject = subjectColour(data, person, width, height);
  const solidRed = new Float32Array(count);
  const solidGreen = new Float32Array(count);
  const solidBlue = new Float32Array(count);
  const solidWeight = new Float32Array(count);
  for (let index = 0; index < count; index += 1) {
    if (!wasSolid[index]) {
      continue;
    }
    const offset = index * 4;
    solidRed[index] = data[offset];
    solidGreen[index] = data[offset + 1];
    solidBlue[index] = data[offset + 2];
    solidWeight[index] = 1;
  }
  const feather = guideAlpha(alpha, guidance, width, height);
  const blurredRed = boxBlurChannel(solidRed, width, height, MATTE_GUIDE_RADIUS);
  const blurredGreen = boxBlurChannel(solidGreen, width, height, MATTE_GUIDE_RADIUS);
  const blurredBlue = boxBlurChannel(solidBlue, width, height, MATTE_GUIDE_RADIUS);
  const blurredWeight = boxBlurChannel(solidWeight, width, height, MATTE_GUIDE_RADIUS);
  for (let index = 0; index < count; index += 1) {
    const offset = index * 4;
    const interior = person[index] === 1 && (enclosed[index] === 1 || solidInterior(alpha, width, height, index));
    let coverage = Math.max(0, Math.min(255, Math.round(feather[index])));
    if (interior) {
      coverage = 255;
    } else if (!person[index] && !nearPerson(person, width, height, index, MATTE_GUIDE_RADIUS)) {
      coverage = 0;
    }
    const fringe = outerFringe(person, width, height, index);
    const foreign = subject !== null && saturatedForeign(colourAt(data, index), subject);
    if (!enclosed[index] && foreign && (fringe || !person[index])) {
      coverage = 0;
    }
    data[offset + 3] = coverage;
    if (wasSolid[index] || coverage === 0 || blurredWeight[index] <= 0.001) {
      continue;
    }
    data[offset] = Math.max(0, Math.min(255, Math.round(blurredRed[index] / blurredWeight[index])));
    data[offset + 1] = Math.max(0, Math.min(255, Math.round(blurredGreen[index] / blurredWeight[index])));
    data[offset + 2] = Math.max(0, Math.min(255, Math.round(blurredBlue[index] / blurredWeight[index])));
  }
  if (removedMostOfTheFace(saved, data, head)) {
    data.set(saved);
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

/** Grey card fill, then a light shadow, then the person. Used once for the preview and for Save. */
export function compositeCutoutForCard(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  color: Rgb,
): void {
  const count = width * height;
  const alpha = new Float32Array(count);
  for (let index = 0; index < count; index += 1) {
    alpha[index] = pixels[index * 4 + 3] / 255;
  }
  const blurred = boxMean(boxMean(alpha, width, height, CUTOUT_SHADOW_BLUR), width, height, CUTOUT_SHADOW_BLUR);
  const out = new Uint8ClampedArray(pixels.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const sampleX = x - CUTOUT_SHADOW_OFFSET_X;
      const sampleY = y - CUTOUT_SHADOW_OFFSET_Y;
      let shade = 0;
      if (sampleX >= 0 && sampleY >= 0 && sampleX < width && sampleY < height) {
        shade = blurred[sampleY * width + sampleX] * CUTOUT_SHADOW_STRENGTH;
      }
      const coverage = alpha[index];
      const offset = index * 4;
      const baseRed = color.r * (1 - shade);
      const baseGreen = color.g * (1 - shade);
      const baseBlue = color.b * (1 - shade);
      out[offset] = Math.round(pixels[offset] * coverage + baseRed * (1 - coverage));
      out[offset + 1] = Math.round(pixels[offset + 1] * coverage + baseGreen * (1 - coverage));
      out[offset + 2] = Math.round(pixels[offset + 2] * coverage + baseBlue * (1 - coverage));
      out[offset + 3] = 255;
    }
  }
  pixels.set(out);
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

/** A 1:1 crop. This copies pixels. It does not scale them. */
export function copyCrop(source: PhotoRaster, crop: PhotoCrop): PhotoRaster {
  const x = Math.max(0, Math.min(source.width - 1, Math.round(crop.x)));
  const y = Math.max(0, Math.min(source.height - 1, Math.round(crop.y)));
  const right = Math.max(x + 1, Math.min(source.width, Math.round(crop.x + crop.width)));
  const bottom = Math.max(y + 1, Math.min(source.height, Math.round(crop.y + crop.height)));
  const width = right - x;
  const height = bottom - y;
  const data = new Uint8ClampedArray(width * height * 4);
  const rowBytes = width * 4;
  for (let row = 0; row < height; row += 1) {
    const start = ((y + row) * source.width + x) * 4;
    data.set(source.data.subarray(start, start + rowBytes), row * rowBytes);
  }
  return { width, height, data };
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
  const oriented = applyExifOrientation(options.stored, options.orientation);
  const expanded = expandCrop(options.crop, oriented.width, oriented.height);
  const full = copyCrop(oriented, expanded);
  const fitted = fitLongSide(full.width, full.height, options.longSide);
  const modelInput =
    fitted.width === full.width && fitted.height === full.height
      ? full
      : resampleCrop(full, { x: 0, y: 0, width: full.width, height: full.height }, fitted.width, fitted.height);
  const cutout = options.modelOutput(modelInput);
  cleanCutoutEdges(cutout);
  const masked = applyMaskOnce(full, cutout);
  return rasterForPrintFrame(
    masked,
    { x: 0, y: 0, width: masked.width, height: masked.height },
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
    const heic = /hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name);
    if (readJpegOrientation(bytes) === 1 && !heic) {
      return file;
    }
    const raster = await rasterFromBlob(file);
    const blob = await canvasToBlob(paintRaster(raster), "image/png");
    const stem = file.name.replace(/\.[^.]+$/, "") || "photo";
    return new File([blob], `${stem}.png`, { type: "image/png" });
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

export async function runSelectedMask<T>(options: {
  mask: "isnet" | "modnet";
  portrait: () => Promise<T>;
  standard: () => Promise<T>;
  onFallback?: () => void;
}): Promise<T> {
  if (options.mask !== "modnet") {
    return options.standard();
  }
  try {
    return await options.portrait();
  } catch {
    options.onFallback?.();
    return options.standard();
  }
}

export async function removeProfileBackground(options: {
  imageUrl: string;
  crop: PhotoCrop;
  attempt?: number;
  mask?: "isnet" | "modnet" | "server";
  onFallback?: () => void;
  onServerFallback?: () => void;
  onProgress?: (progress: PhotoBackgroundProgress) => void;
  onRetry?: () => void;
}): Promise<Blob> {
  const report = options.onProgress ?? (() => undefined);
  report({ phase: "prepare" });
  const response = await fetch(options.imageUrl);
  if (!response.ok) {
    throw new Error("Unable to load image for processing.");
  }
  // Orient first. A tall crop painted from an unrotated iPhone bitmap stretches the face.
  const oriented = await rasterFromBlob(await response.blob());
  const expanded = expandCrop(options.crop, oriented.width, oriented.height);
  const full = copyCrop(oriented, expanded);
  const fitted = fitLongSide(full.width, full.height);
  const modelInput =
    fitted.width === full.width && fitted.height === full.height
      ? full
      : resampleCrop(full, { x: 0, y: 0, width: full.width, height: full.height }, fitted.width, fitted.height);
  const inputBlob = await canvasToBlob(paintRaster(modelInput), "image/png");
  const asked = options.mask ?? "modnet";
  if (asked === "server") {
    report({ phase: "server" });
    try {
      const { requestServerCutout } = await import("./server-removal");
      const fullBlob = await canvasToBlob(paintRaster(full), "image/png");
      return await requestServerCutout(fullBlob);
    } catch {
      options.onServerFallback?.();
    }
  }

  const restored = await runSelectedMask({
    mask: asked === "isnet" ? "isnet" : "modnet",
    onFallback: options.onFallback,
    portrait: async () => {
      const { portraitMatte } = await import("./modnet-mask");
      const small = await portraitMatte(full, window.location.origin);
      cleanCutoutEdges(small);
      return applyMaskOnce(full, small);
    },
    standard: async () => removeWithStandardModel(inputBlob, full, options, report),
  });
  return canvasToBlob(paintRaster(restored), "image/png");
}

async function removeWithStandardModel(
  inputBlob: Blob,
  full: PhotoRaster,
  options: { attempt?: number; onRetry?: () => void },
  report: (progress: PhotoBackgroundProgress) => void,
): Promise<PhotoRaster> {
  const downloads = new Map<string, { current: number; total: number }>();
  const bgModule = await import("@imgly/background-removal-js");
  let removed: unknown;
  try {
    removed = await runWithModelFetch(
      () =>
        bgModule.removeBackground(inputBlob, {
          ...removalLibraryConfig(window.location.origin, options.attempt ?? 1),
          progress: (key: string, current: number, total: number) => {
            report(progressFromLibraryKey(key, current, total, downloads));
          },
        }),
      { onRetry: options.onRetry },
    );
  } catch (error) {
    if (error instanceof BackgroundFetchError) {
      throw error;
    }
    const offline = typeof navigator !== "undefined" && navigator.onLine === false;
    if (offline || error instanceof TypeError) {
      throw new BackgroundFetchError("network", error instanceof Error ? error.message : "download failed");
    }
    throw new BackgroundFetchError("processing", error instanceof Error ? error.message : "removal failed");
  }

  report({ phase: "edges" });
  const cutout = await rasterFromBlob(asPngBlob(removed));
  cleanCutoutEdges(cutout);
  return applyMaskOnce(full, cutout);
}
