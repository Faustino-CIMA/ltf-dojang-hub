/**
 * Print-crop face rules. No model and no network: the landmarker adapter
 * turns a detection into these numbers, and the tests call the functions directly.
 */

export const FACE_COUNT_CAP = 3;
export const FACE_YAW_MAX_DEG = 15;
export const FACE_PITCH_MAX_DEG = 12;
export const FACE_ROLL_MAX_DEG = 10;
/**
 * The mesh box is chin to forehead, not chin to the crown of the hair.
 * On a head-and-shoulders card the visible face is about 40-45% of the
 * frame, so this shorter box is about a third of the frame. 30% still
 * passes that framing. Above 70% the forehead-to-chin span alone fills
 * the card, which means the head is cropped.
 */
export const FACE_HEIGHT_MIN = 0.3;
export const FACE_HEIGHT_MAX = 0.7;
/** Centre of the mesh box, as a fraction of the print crop. */
export const FACE_CENTER_X_MIN = 0.35;
export const FACE_CENTER_X_MAX = 0.65;
/** Head-and-shoulders framing sits a little above the middle. */
export const FACE_CENTER_Y_MIN = 0.32;
export const FACE_CENTER_Y_MAX = 0.62;
export const FACE_LUMA_MIN = 60;
export const FACE_LUMA_MAX = 210;
/** Locked by the sharp-edge and box-blur fixtures in face-check.test.ts. */
/** A 32px drawn edge scores about 4300; the same edge after a 4px box blur scores about 54. */
export const FACE_BLUR_MIN = 80;
export const FACE_CHECK_DEBOUNCE_MS = 400;

export const FACE_CHECK_ASSET_DIR = "/face-check/1.2.3";
export const FACE_LANDMARKER_FILE = "face_landmarker.task";
export const FACE_WASM_JS = "vision_wasm_internal.js";
export const FACE_WASM_BINARY = "vision_wasm_internal.wasm";
export const FACE_VISION_BUNDLE = "vision_bundle.mjs";

export type FaceBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type FaceObservation = {
  box: FaceBox;
  yawDeg: number;
  pitchDeg: number;
  rollDeg: number;
};

export type FaceHint =
  | "none"
  | "many"
  | "pose"
  | "size"
  | "dark"
  | "bright"
  | "blur";

export type FaceCheckProgress =
  | { phase: "download"; percent: number }
  | { phase: "prepare" | "find" | "light" };

export type FaceCheckOutcome =
  | { status: "pass"; blurVariance?: number }
  | { status: "fail"; hint: FaceHint; blurVariance?: number }
  | { status: "skipped"; reason: "model_unavailable" };

export function faceCheckAssetUrl(origin: string, file: string): string {
  const base = origin.endsWith("/") ? origin.slice(0, -1) : origin;
  return `${base}${FACE_CHECK_ASSET_DIR}/${file}`;
}

export function reviewShowsSkippedFaceCheck(value: string | null | undefined): boolean {
  return value !== "pass";
}

/** Express a box that lives in the same pixel space as the print crop as fractions of that crop. */
export function normalizeBoxToFrame(box: FaceBox, frame: FaceBox): FaceBox {
  return {
    x: (box.x - frame.x) / frame.width,
    y: (box.y - frame.y) / frame.height,
    width: box.width / frame.width,
    height: box.height / frame.height,
  };
}

export function faceBoxFromPoints(points: Array<{ x: number; y: number }>): FaceBox | null {
  if (points.length === 0) {
    return null;
  }
  let minX = points[0].x;
  let minY = points[0].y;
  let maxX = points[0].x;
  let maxY = points[0].y;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  const width = maxX - minX;
  const height = maxY - minY;
  if (width <= 0 || height <= 0) {
    return null;
  }
  return { x: minX, y: minY, width, height };
}

/**
 * Column-major 4×4. Yaw is a left/right turn, pitch is chin up or down,
 * roll is a tilt in the picture.
 */
export function poseDegreesFromMatrix(
  data: ArrayLike<number>,
): { yawDeg: number; pitchDeg: number; rollDeg: number } | null {
  if (data.length < 11) {
    return null;
  }
  const r00 = data[0];
  const r10 = data[1];
  const r20 = data[2];
  const r21 = data[6];
  const r22 = data[10];
  const yaw = Math.atan2(-r20, Math.hypot(r00, r10));
  const pitch = Math.atan2(r21, r22);
  const roll = Math.atan2(r10, r00);
  return {
    yawDeg: (yaw * 180) / Math.PI,
    pitchDeg: (pitch * 180) / Math.PI,
    rollDeg: (roll * 180) / Math.PI,
  };
}

export function evaluateFacePlacement(faces: FaceObservation[]): "pass" | "none" | "many" | "pose" | "size" {
  if (faces.length === 0) {
    return "none";
  }
  if (faces.length !== 1) {
    return "many";
  }
  const face = faces[0];
  if (
    Math.abs(face.yawDeg) > FACE_YAW_MAX_DEG ||
    Math.abs(face.pitchDeg) > FACE_PITCH_MAX_DEG ||
    Math.abs(face.rollDeg) > FACE_ROLL_MAX_DEG
  ) {
    return "pose";
  }
  const { x, y, width, height } = face.box;
  const centerX = x + width / 2;
  const centerY = y + height / 2;
  if (
    height < FACE_HEIGHT_MIN ||
    height > FACE_HEIGHT_MAX ||
    width <= 0 ||
    x < -0.02 ||
    y < -0.02 ||
    x + width > 1.02 ||
    y + height > 1.02 ||
    centerX < FACE_CENTER_X_MIN ||
    centerX > FACE_CENTER_X_MAX ||
    centerY < FACE_CENTER_Y_MIN ||
    centerY > FACE_CENTER_Y_MAX
  ) {
    return "size";
  }
  return "pass";
}

export function evaluateLuma(mean: number): "pass" | "dark" | "bright" {
  if (mean < FACE_LUMA_MIN) {
    return "dark";
  }
  if (mean > FACE_LUMA_MAX) {
    return "bright";
  }
  return "pass";
}

export function meanLuma(pixels: Uint8ClampedArray): number {
  const count = Math.floor(pixels.length / 4);
  if (count === 0) {
    return 0;
  }
  let sum = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    sum += 0.299 * pixels[index] + 0.587 * pixels[index + 1] + 0.114 * pixels[index + 2];
  }
  return sum / count;
}

export function luminancePlane(pixels: Uint8ClampedArray, width: number, height: number): Float32Array {
  const plane = new Float32Array(width * height);
  const count = Math.min(plane.length, Math.floor(pixels.length / 4));
  for (let index = 0; index < count; index += 1) {
    const offset = index * 4;
    plane[index] = 0.299 * pixels[offset] + 0.587 * pixels[offset + 1] + 0.114 * pixels[offset + 2];
  }
  return plane;
}

export function boxBlurPlane(
  source: Float32Array,
  width: number,
  height: number,
  radius: number,
): Float32Array {
  const dest = new Float32Array(source.length);
  const reach = Math.max(0, radius);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sum = 0;
      let samples = 0;
      for (let dy = -reach; dy <= reach; dy += 1) {
        const nextY = y + dy;
        if (nextY < 0 || nextY >= height) {
          continue;
        }
        for (let dx = -reach; dx <= reach; dx += 1) {
          const nextX = x + dx;
          if (nextX < 0 || nextX >= width) {
            continue;
          }
          sum += source[nextY * width + nextX];
          samples += 1;
        }
      }
      dest[y * width + x] = samples === 0 ? 0 : sum / samples;
    }
  }
  return dest;
}

export function laplacianVariance(plane: Float32Array, width: number, height: number): number {
  if (width < 3 || height < 3) {
    return 0;
  }
  let sum = 0;
  let sumSquares = 0;
  let count = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x;
      const value =
        plane[index - width] +
        plane[index - 1] -
        4 * plane[index] +
        plane[index + 1] +
        plane[index + width];
      sum += value;
      sumSquares += value * value;
      count += 1;
    }
  }
  if (count === 0) {
    return 0;
  }
  const mean = sum / count;
  return sumSquares / count - mean * mean;
}

export function evaluateFaceCheck(input: {
  faces: FaceObservation[];
  luma: number;
  blurVariance: number;
}): "pass" | FaceHint {
  const placement = evaluateFacePlacement(input.faces);
  if (placement !== "pass") {
    return placement;
  }
  const light = evaluateLuma(input.luma);
  if (light !== "pass") {
    return light;
  }
  if (input.blurVariance < FACE_BLUR_MIN) {
    return "blur";
  }
  return "pass";
}

export function faceCheckEditorLabels(
  translate: (key: string, values?: Record<string, string>) => string,
) {
  return {
    faceCheckDownload: translate("faceCheckDownload", { percent: "{percent}" }),
    faceCheckPrepare: translate("faceCheckPrepare"),
    faceCheckFind: translate("faceCheckFind"),
    faceCheckLight: translate("faceCheckLight"),
    faceCheckPass: translate("faceCheckPass"),
    faceCheckNone: translate("faceCheckNone"),
    faceCheckMany: translate("faceCheckMany"),
    faceCheckPose: translate("faceCheckPose"),
    faceCheckSize: translate("faceCheckSize"),
    faceCheckDark: translate("faceCheckDark"),
    faceCheckBright: translate("faceCheckBright"),
    faceCheckBlur: translate("faceCheckBlur"),
    faceCheckSkipped: translate("faceCheckSkipped"),
  };
}

export function progressBarPercent(progress: FaceCheckProgress): number {
  if (progress.phase === "download") {
    return Math.round(progress.percent * 0.7);
  }
  if (progress.phase === "prepare") {
    return 74;
  }
  if (progress.phase === "find") {
    return 86;
  }
  return 94;
}
